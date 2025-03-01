// Global variables
let videoElement;
let isHost = false;
let roomId = null;
let lastTimeUpdate = 0;
const SYNC_THRESHOLD = 2; // seconds
let isConnected = false;
let socket = null;
let serverUrl = null;
let retryCount = 0;
const MAX_RETRIES = 3;
let syncInterval = null;

// Socket.IO connection status
const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
};
let connectionState = ConnectionState.DISCONNECTED;

// Initialize Socket.IO connection
function initializeConnection() {
  if (socket) {
    socket.disconnect();
  }

  if (!serverUrl) {
    console.error('Server URL not provided!');
    updateConnectionStatus(ConnectionState.ERROR, 'Server URL not provided');
    return;
  }

  console.log(`🔄 Connecting to server at ${serverUrl}`);
  updateConnectionStatus(ConnectionState.CONNECTING);

  // Connect directly since Socket.IO is already loaded via content_scripts
  connectSocket();
}

// Connect to Socket.IO server
function connectSocket() {
  try {
    console.log(`Attempting to connect to: ${serverUrl}`);
    
    // Check if io is defined
    if (typeof io === 'undefined') {
      console.error('❌ Socket.IO client not loaded');
      updateConnectionStatus(ConnectionState.ERROR, 'Socket.IO client not loaded');
      return;
    }
    
    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000
    });

    setupSocketListeners();
  } catch (error) {
    console.error('❌ Error connecting to server:', error);
    updateConnectionStatus(ConnectionState.ERROR, error.message);
  }
}

// Setup Socket.IO event listeners
function setupSocketListeners() {
  socket.on('connect', () => {
    console.log(`✅ Connected to server with ID: ${socket.id}`);
    retryCount = 0;

    // Join the room
    socket.emit('join', {
      roomId: roomId,
      isHost: isHost
    });
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Connection error:', error);
    
    if (++retryCount <= MAX_RETRIES) {
      console.log(`Retrying connection (${retryCount}/${MAX_RETRIES})...`);
      updateConnectionStatus(ConnectionState.CONNECTING, `Retrying (${retryCount}/${MAX_RETRIES})...`);
    } else {
      console.error('❌ Max retries reached, giving up');
      updateConnectionStatus(ConnectionState.ERROR, 'Failed to connect to server after multiple attempts');
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Disconnected from server:', reason);
    clearInterval(syncInterval);
    updateConnectionStatus(ConnectionState.DISCONNECTED, reason);
  });

  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
    updateConnectionStatus(ConnectionState.ERROR, error.message);
  });

  socket.on('roomInfo', (data) => {
    console.log('📋 Room info received:', data);
    isHost = data.isHost;
    isConnected = true;
    updateConnectionStatus(ConnectionState.CONNECTED);

    // Update peer count
    chrome.runtime.sendMessage({
      type: 'peerCount',
      count: data.participants.length - 1 // Subtract self
    });

    // If we're the host, start sending regular sync updates
    if (isHost && videoElement) {
      startSyncInterval();
    }
  });

  socket.on('userJoined', (data) => {
    console.log('👋 User joined:', data);
    
    // Update peer count - request current count from server
    chrome.runtime.sendMessage({
      type: 'peerCount',
      count: -1 // Signal to request updated count
    });

    // If we're the host, send the current video state to the new user
    if (isHost && videoElement) {
      sendVideoState();
    }
  });

  socket.on('userLeft', (data) => {
    console.log('👋 User left:', data);
    
    // Update peer count - request current count from server
    chrome.runtime.sendMessage({
      type: 'peerCount',
      count: -1
    });
  });

  socket.on('sync', (data) => {
    console.log('🔄 Sync received:', data);
    handleSyncMessage(data);
  });

  socket.on('syncRequest', () => {
    console.log('🔄 Sync requested');
    if (isHost && videoElement) {
      sendVideoState();
    }
  });

  socket.on('hostChanged', (data) => {
    console.log('👑 Host changed:', data);
    
    // Check if we are the new host
    if (data.newHostId === socket.id) {
      console.log('👑 I am now the host!');
      isHost = true;
      
      // Start sending sync updates
      if (videoElement) {
        startSyncInterval();
      }
    }

    chrome.runtime.sendMessage({
      type: 'hostChanged',
      isHost: data.newHostId === socket.id
    });
  });
}

// Start interval to send video state (for host only)
function startSyncInterval() {
  // Clear existing interval if any
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  // Send initial state
  sendVideoState();

  // Set up interval to send state every 5 seconds
  syncInterval = setInterval(() => {
    if (isHost && isConnected && videoElement) {
      sendVideoState();
    }
  }, 5000);
}

// Update connection status and notify extension
function updateConnectionStatus(state, message = '') {
  connectionState = state;
  
  // Determine connected status
  const connected = state === ConnectionState.CONNECTED;
  
  // Send message to extension
  chrome.runtime.sendMessage({ 
    type: 'connectionStatus', 
    connected: connected,
    status: state,
    isHost: isHost,
    roomId: roomId,
    message: message
  });
}

// Handle incoming sync messages
function handleSyncMessage(data) {
  if (!videoElement) return;
  
  // Ignore our own messages
  if (socket && data.userId === socket.id) return;
  
  // Only accept sync messages from host if we're not the host,
  // unless forced by another peer (e.g., for seeking)
  if (!isHost && !data.isHost && !data.force) return;

  if (Math.abs(videoElement.currentTime - data.currentTime) > SYNC_THRESHOLD) {
    console.log(`Syncing video time: ${videoElement.currentTime} -> ${data.currentTime}`);
    videoElement.currentTime = data.currentTime;
  }
  
  if (data.isPlaying && videoElement.paused) {
    console.log('Playing video');
    videoElement.play().catch(error => {
      console.error('Failed to play:', error);
    });
  } else if (!data.isPlaying && !videoElement.paused) {
    console.log('Pausing video');
    videoElement.pause();
  }
}

// Send video state to server
function sendVideoState() {
  if (!videoElement || !socket || !isConnected) return;

  const now = Date.now();
  if (now - lastTimeUpdate < 1000) return; // Throttle updates
  lastTimeUpdate = now;

  const state = {
    currentTime: videoElement.currentTime,
    isPlaying: !videoElement.paused
  };
  
  console.log('📤 Sending sync:', state);
  
  socket.emit('sync', state);
}

// Initialize video element observer
function initializeVideoObserver() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const videoElements = document.querySelectorAll('video');
      if (videoElements.length > 0) {
        videoElement = videoElements[0];
        setupVideoListeners();
        
        // If we're already connected and we're the host, start sending sync updates
        if (isConnected && isHost) {
          startSyncInterval();
        }
        
        observer.disconnect();
        break;
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Setup video element event listeners
function setupVideoListeners() {
  if (!videoElement) return;

  videoElement.addEventListener('play', () => {
    if (isHost) {
      sendVideoState();
    }
  });
  
  videoElement.addEventListener('pause', () => {
    if (isHost) {
      sendVideoState();
    }
  });
  
  videoElement.addEventListener('seeking', () => {
    if (isHost) {
      sendVideoState();
    }
  });

  // Periodic update during playback
  videoElement.addEventListener('timeupdate', () => {
    // Only send updates every few seconds to avoid flooding
    const now = Date.now();
    if (isHost && now - lastTimeUpdate > 5000) {
      sendVideoState();
    }
  });
}

// Handle extension messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handleMessage = async () => {
    switch (request.type) {
      case 'ping':
        return { success: true };
        
      case 'getPartyState':
        return {
          success: true,
          connected: isConnected,
          peerCount: socket ? socket.connected : 0,
          isHost: isHost,
          roomId: roomId,
          serverUrl: serverUrl
        };
        
      case 'initParty':
        // Save party info
        roomId = request.roomId;
        isHost = request.isHost;
        serverUrl = request.serverUrl;
        
        // Initialize connection
        initializeConnection();
        return { success: true };
        
      case 'requestSync':
        if (socket && socket.connected) {
          socket.emit('requestSync');
          return { success: true };
        }
        return { success: false, error: 'Not connected to server' };
        
      case 'leaveParty':
        // Disconnect from server
        if (socket) {
          socket.disconnect();
          socket = null;
        }
        
        // Reset state
        clearInterval(syncInterval);
        syncInterval = null;
        roomId = null;
        isHost = false;
        isConnected = false;
        serverUrl = null;
        connectionState = ConnectionState.DISCONNECTED;
        return { success: true };
        
      default:
        return { success: false, error: 'Unknown message type' };
    }
  };

  // Handle the async response properly
  handleMessage().then(response => {
    sendResponse(response);
  }).catch(error => {
    console.error('Error handling message:', error);
    sendResponse({ success: false, error: error.message });
  });

  return true; // Will respond asynchronously
});

// Start observing for video element
initializeVideoObserver(); 