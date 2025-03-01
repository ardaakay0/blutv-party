const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// Enable CORS with any origin for easier testing
app.use(cors({
  origin: '*',  // Allow any origin during development
  methods: ['GET', 'POST'],
  credentials: true
}));

// Add a basic route for health check
app.get('/', (req, res) => {
  res.send('BluTV Party Server is running!');
});

// Add a route to obtain the server's IP address
app.get('/ip', (req, res) => {
  // Get local IP addresses
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const results = {};

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        if (!results[name]) {
          results[name] = [];
        }
        results[name].push(net.address);
      }
    }
  }

  res.json({
    ip: results,
    port: port
  });
});

const httpServer = createServer(app);

// Configure Socket.IO with all necessary options
const io = new Server(httpServer, {
  cors: {
    origin: '*',  // Allow any origin during development
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'], // Allow both WebSocket and polling
  allowEIO3: true, // Enable Engine.IO v3 compatibility
  path: '/socket.io/', // Explicit path
  pingTimeout: 60000, // Increase ping timeout
  pingInterval: 25000 // Increase ping interval
});

// Store active rooms and their participants
const rooms = new Map();

// Log the number of connected clients every 30 seconds
setInterval(() => {
  const numClients = io.engine.clientsCount;
  const numRooms = rooms.size;
  console.log(`Status: ${numClients} clients connected, ${numRooms} active rooms`);
}, 30000);

// Utility function to log with timestamp
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${message}`, data);
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

io.on('connection', (socket) => {
  log(`User connected: ${socket.id}`);

  socket.on('join', (data) => {
    try {
      const roomId = data.roomId;
      socket.join(roomId);
      log(`User ${socket.id} joined room: ${roomId}`);
      
      // Update room participants
      if (!rooms.has(roomId)) {
        rooms.set(roomId, { 
          hostId: data.isHost ? socket.id : null,
          participants: new Set(),
          currentState: {
            currentTime: 0,
            isPlaying: false,
            lastUpdated: Date.now()
          }
        });
      }
      
      const room = rooms.get(roomId);
      room.participants.add(socket.id);
      
      // If this is the first person and they're not marked as host, make them host
      if (room.participants.size === 1 && !room.hostId) {
        room.hostId = socket.id;
        log(`User ${socket.id} automatically became host of empty room: ${roomId}`);
      }

      // Store roomId in socket for quick access
      socket.data.roomId = roomId;
      socket.data.isHost = room.hostId === socket.id;

      // Notify others in the room
      socket.to(roomId).emit('userJoined', { 
        userId: socket.id,
        isHost: socket.data.isHost 
      });
      
      // Send current room state to the joining user
      socket.emit('roomInfo', {
        roomId,
        hostId: room.hostId,
        isHost: room.hostId === socket.id,
        participants: Array.from(room.participants),
        currentState: room.currentState
      });
    } catch (error) {
      log('Error in join handler:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('sync', (data) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) {
        socket.emit('error', { message: 'Not in a room' });
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Only allow the host to sync by default, but allow override
      const isHost = room.hostId === socket.id;
      if (!isHost && !data.force) {
        socket.emit('error', { message: 'Only host can sync' });
        return;
      }

      log(`Sync event in room ${roomId}:`, {
        currentTime: data.currentTime,
        isPlaying: data.isPlaying
      });
      
      // Update room state
      room.currentState = {
        currentTime: data.currentTime,
        isPlaying: data.isPlaying,
        lastUpdated: Date.now()
      };
      
      // Send to everyone in the room except sender
      socket.to(roomId).emit('sync', {
        currentTime: data.currentTime,
        isPlaying: data.isPlaying,
        userId: socket.id,
        isHost: isHost
      });
    } catch (error) {
      log('Error in sync handler:', error);
      socket.emit('error', { message: 'Failed to sync' });
    }
  });

  socket.on('requestSync', () => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) {
        socket.emit('error', { message: 'Not in a room' });
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Request sync from host
      if (room.hostId && room.hostId !== socket.id) {
        io.to(room.hostId).emit('syncRequest', { 
          userId: socket.id 
        });
      } else {
        socket.emit('error', { message: 'No host available for sync' });
      }
    } catch (error) {
      log('Error in requestSync handler:', error);
      socket.emit('error', { message: 'Failed to request sync' });
    }
  });

  socket.on('transferHost', (data) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) {
        socket.emit('error', { message: 'Not in a room' });
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Only current host can transfer host status
      if (room.hostId !== socket.id) {
        socket.emit('error', { message: 'Only host can transfer host status' });
        return;
      }

      // Check if target user is in the room
      if (!room.participants.has(data.userId)) {
        socket.emit('error', { message: 'Target user not found in room' });
        return;
      }

      room.hostId = data.userId;
      log(`Host transferred in room ${roomId} from ${socket.id} to ${data.userId}`);

      // Notify all users in the room
      io.to(roomId).emit('hostChanged', {
        previousHostId: socket.id,
        newHostId: data.userId
      });
    } catch (error) {
      log('Error in transferHost handler:', error);
      socket.emit('error', { message: 'Failed to transfer host' });
    }
  });

  socket.on('disconnect', () => {
    try {
      const roomId = socket.data.roomId;
      log(`User disconnected: ${socket.id}, was in room: ${roomId || 'none'}`);
      
      if (roomId && rooms.has(roomId)) {
        const room = rooms.get(roomId);
        room.participants.delete(socket.id);
        
        // If room is empty, remove it
        if (room.participants.size === 0) {
          rooms.delete(roomId);
          log(`Room ${roomId} removed (empty)`);
        } 
        // If the host left, assign a new host
        else if (room.hostId === socket.id) {
          const newHostId = room.participants.values().next().value;
          room.hostId = newHostId;
          log(`New host assigned in room ${roomId}: ${newHostId}`);
          
          // Notify all users about the host change
          io.to(roomId).emit('hostChanged', {
            previousHostId: socket.id,
            newHostId: newHostId
          });
        }
        
        // Notify others that user left
        socket.to(roomId).emit('userLeft', { 
          userId: socket.id,
          wasHost: room.hostId === socket.id
        });
      }
    } catch (error) {
      log('Error in disconnect handler:', error);
    }
  });
});

const port = process.env.PORT || 3000;
httpServer.listen(port, () => {
  log(`Server running on port ${port}`);
  
  // Log available IP addresses
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  
  log('Available on:');
  Object.keys(nets).forEach((name) => {
    nets[name].forEach((net) => {
      if (net.family === 'IPv4' && !net.internal) {
        log(`  http://${net.address}:${port}`);
      }
    });
  });
  log('To use this server with the extension, create a room and enter the server URL when prompted');
}); 