const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// Enable CORS with specific origins
app.use(cors({
  origin: [
    'https://*.blutv.com',
    'http://*.blutv.com',
    'chrome-extension://*'
  ],
  methods: ['GET', 'POST'],
  credentials: true
}));

// Add a basic route for health check
app.get('/', (req, res) => {
  res.send('BluTV Party Server is running!');
});

const httpServer = createServer(app);

// Configure Socket.IO with all necessary options
const io = new Server(httpServer, {
  cors: {
    origin: [
      'https://*.blutv.com',
      'http://*.blutv.com',
      'chrome-extension://*'
    ],
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

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (data) => {
    try {
      const roomId = data.roomId;
      socket.join(roomId);
      console.log(`User ${socket.id} joined room: ${roomId}`);
      
      // Update room participants
      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }
      rooms.get(roomId).add(socket.id);

      // Notify others in the room
      socket.to(roomId).emit('joined', { userId: socket.id });
      
      // Send current room state to the joining user
      socket.emit('roomInfo', {
        roomId,
        participants: Array.from(rooms.get(roomId))
      });
    } catch (error) {
      console.error('Error in join handler:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('sync', (data) => {
    try {
      console.log(`Sync event in room ${data.roomId}:`, {
        currentTime: data.currentTime,
        isPlaying: data.isPlaying
      });
      
      socket.to(data.roomId).emit('sync', {
        currentTime: data.currentTime,
        isPlaying: data.isPlaying,
        userId: socket.id
      });
    } catch (error) {
      console.error('Error in sync handler:', error);
      socket.emit('error', { message: 'Failed to sync' });
    }
  });

  socket.on('disconnect', () => {
    try {
      console.log('User disconnected:', socket.id);
      
      // Remove user from all rooms they were in
      rooms.forEach((participants, roomId) => {
        if (participants.has(socket.id)) {
          participants.delete(socket.id);
          // If room is empty, remove it
          if (participants.size === 0) {
            rooms.delete(roomId);
          } else {
            // Notify others that user left
            socket.to(roomId).emit('userLeft', { userId: socket.id });
          }
        }
      });
    } catch (error) {
      console.error('Error in disconnect handler:', error);
    }
  });
});

const port = process.env.PORT || 8080;
httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 