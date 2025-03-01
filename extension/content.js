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
    
    // Initialize chat UI
    initializeChat();
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

  // Listen for chat messages
  socket.on('chatMessage', (data) => {
    console.log('💬 Chat message received:', data);
    
    // Display the message in the chat UI
    displayChatMessage(data);
    
    // Determine if this is the user's own message
    const isOwnMessage = data.userId === socket.id;
    
    // Notify the background script about new message
    chrome.runtime.sendMessage({
      type: 'newChatMessage',
      data: {
        ...data,
        isOwnMessage
      }
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
        
        // Initialize chat UI after connecting
        setTimeout(() => {
          initializeChat();
        }, 1000); // Slight delay to ensure socket connection is established
        
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
        
        // Remove chat UI
        const chatContainer = document.getElementById('blutv-party-chat');
        if (chatContainer) {
          chatContainer.remove();
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
        
      case 'toggleChat':
        toggleChat();
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

// Create chat UI
function createChatUI() {
  // Remove existing chat UI if any
  const existingChat = document.getElementById('blutv-party-chat');
  if (existingChat) {
    existingChat.remove();
  }

  // Try to get saved username from localStorage
  let savedUsername = localStorage.getItem('blutvPartyUsername') || '';

  // Create chat container
  const chatContainer = document.createElement('div');
  chatContainer.id = 'blutv-party-chat';
  chatContainer.style.cssText = `
    position: absolute;
    top: 70px;
    right: 20px;
    width: 300px;
    height: 400px;
    background-color: rgba(0, 0, 0, 0.8);
    color: white;
    border-radius: 8px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    font-family: Arial, sans-serif;
  `;

  // Create header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 10px;
    background-color: #5865F2;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: move;
  `;
  header.innerHTML = '<span>BluTV Party Chat</span>';
  
  // Add minimize button
  const minimizeBtn = document.createElement('button');
  minimizeBtn.innerHTML = '−';
  minimizeBtn.style.cssText = `
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 18px;
  `;
  minimizeBtn.onclick = (e) => {
    e.stopPropagation(); // Prevent dragging when clicking the button
    toggleChat();
  };
  header.appendChild(minimizeBtn);
  
  // Create username input area
  const usernameArea = document.createElement('div');
  usernameArea.style.cssText = `
    padding: 10px;
    border-bottom: 1px solid #444;
    display: flex;
    align-items: center;
  `;
  
  const usernameLabel = document.createElement('label');
  usernameLabel.innerHTML = 'Username:';
  usernameLabel.style.cssText = `
    margin-right: 8px;
    font-size: 14px;
  `;
  
  const usernameInput = document.createElement('input');
  usernameInput.type = 'text';
  usernameInput.value = savedUsername;
  usernameInput.placeholder = 'Enter your username';
  usernameInput.style.cssText = `
    flex: 1;
    padding: 6px;
    border-radius: 4px;
    border: none;
    background-color: #444;
    color: white;
    font-size: 14px;
  `;
  
  usernameInput.onchange = (e) => {
    const username = e.target.value.trim();
    if (username) {
      localStorage.setItem('blutvPartyUsername', username);
    }
  };
  
  usernameArea.appendChild(usernameLabel);
  usernameArea.appendChild(usernameInput);
  
  // Create messages container
  const messagesContainer = document.createElement('div');
  messagesContainer.id = 'blutv-party-messages';
  messagesContainer.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;

  // Create input area
  const inputArea = document.createElement('div');
  inputArea.style.cssText = `
    padding: 10px;
    border-top: 1px solid #444;
    display: flex;
  `;

  const chatInput = document.createElement('input');
  chatInput.id = 'blutv-party-chat-input';
  chatInput.type = 'text';
  chatInput.placeholder = 'Type a message...';
  chatInput.style.cssText = `
    flex: 1;
    padding: 8px;
    border-radius: 4px;
    border: none;
    background-color: #444;
    color: white;
    resize: none;
  `;
  
  // Prevent space key from triggering video play/pause
  chatInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
  });
  
  const sendButton = document.createElement('button');
  sendButton.innerHTML = 'Send';
  sendButton.style.cssText = `
    margin-left: 8px;
    padding: 8px 12px;
    background-color: #5865F2;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  `;

  // Add event listener for sending messages
  const sendMessage = () => {
    const message = chatInput.value.trim();
    if (message && socket && isConnected) {
      // Get username from input or generate default
      const username = usernameInput.value.trim() || 
                      'User ' + (socket.id ? socket.id.substring(0, 5) : Math.floor(Math.random() * 10000));
      
      socket.emit('chatMessage', {
        message: message,
        username: username
      });
      chatInput.value = '';
    }
  };

  sendButton.onclick = sendMessage;
  chatInput.onkeypress = (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  inputArea.appendChild(chatInput);
  inputArea.appendChild(sendButton);

  // Assemble the chat UI
  chatContainer.appendChild(header);
  chatContainer.appendChild(usernameArea);
  chatContainer.appendChild(messagesContainer);
  chatContainer.appendChild(inputArea);
  document.body.appendChild(chatContainer);

  // Make chat draggable
  makeDraggable(chatContainer, header);

  return chatContainer;
}

// Function to toggle chat visibility
function toggleChat() {
  const chatContainer = document.getElementById('blutv-party-chat');
  if (chatContainer) {
    if (chatContainer.style.display === 'none') {
      chatContainer.style.display = 'flex';
      // Focus the chat input when shown
      setTimeout(() => {
        const chatInput = document.getElementById('blutv-party-chat-input');
        if (chatInput) chatInput.focus();
      }, 100);
    } else {
      chatContainer.style.display = 'none';
    }
  }
}

// Function to display chat messages
function displayChatMessage(data) {
  const messagesContainer = document.getElementById('blutv-party-messages');
  if (!messagesContainer) return;

  const isOwnMessage = data.userId === socket.id;
  
  const messageElement = document.createElement('div');
  messageElement.style.cssText = `
    background-color: ${isOwnMessage ? '#5865F2' : '#424549'};
    padding: 8px 12px;
    border-radius: 8px;
    max-width: 85%;
    align-self: ${isOwnMessage ? 'flex-end' : 'flex-start'};
    word-break: break-word;
  `;

  const timestamp = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  messageElement.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px;">
      ${data.username}${isOwnMessage ? ' <span style="opacity: 0.7; font-style: italic;">(You)</span>' : ''} 
      <span style="font-weight: normal; opacity: 0.7; font-size: 12px;">${timestamp}</span>
    </div>
    <div>${data.message}</div>
  `;

  messagesContainer.appendChild(messageElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Make an element draggable
function makeDraggable(element, handle) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  
  handle.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e.preventDefault();
    // Get the mouse cursor position at startup
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    // Call a function whenever the cursor moves
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e.preventDefault();
    // Calculate the new cursor position
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    // Set the element's new position
    element.style.top = (element.offsetTop - pos2) + "px";
    element.style.left = (element.offsetLeft - pos1) + "px";
    // Reset right positioning to avoid conflicts
    element.style.right = "auto";
  }

  function closeDragElement() {
    // Stop moving when mouse button is released
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

// Initialize chat when joining a room
function initializeChat() {
  if (isConnected && roomId) {
    createChatUI();
  }
} 