let socket;
let videoElement;
let isHost = false;
let roomId = null;
let lastTimeUpdate = 0;
const SYNC_THRESHOLD = 2; // seconds

// Initialize WebSocket connection
function initializeWebSocket() {
    socket = new WebSocket('wss://blutv-party-production.up.railway.app:8080');
    
    socket.onopen = () => {
        console.log('✅ Connected to server');
        chrome.runtime.sendMessage({ type: 'connectionStatus', connected: true });
        if (roomId) {
            socket.send(JSON.stringify({
                type: 'join',
                roomId: roomId
            }));
        }
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleSocketMessage(data);
    };

    socket.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        chrome.runtime.sendMessage({ type: 'connectionStatus', connected: false });
    };

    socket.onclose = () => {
        console.log('Disconnected from server');
        // Attempt to reconnect after 5 seconds
        setTimeout(initializeWebSocket, 5000);
    };
}

// Handle incoming WebSocket messages
function handleSocketMessage(data) {
    if (!videoElement) return;

    switch (data.type) {
        case 'sync':
            if (Math.abs(videoElement.currentTime - data.currentTime) > SYNC_THRESHOLD) {
                videoElement.currentTime = data.currentTime;
            }
            if (data.isPlaying) {
                videoElement.play();
            } else {
                videoElement.pause();
            }
            break;
        case 'joined':
            if (isHost) {
                sendVideoState();
            }
            break;
    }
}

// Send current video state to server
function sendVideoState() {
    if (!socket || !videoElement) return;

    const now = Date.now();
    if (now - lastTimeUpdate < 1000) return; // Throttle updates to once per second
    lastTimeUpdate = now;

    socket.send(JSON.stringify({
        type: 'sync',
        currentTime: videoElement.currentTime,
        isPlaying: !videoElement.paused,
        roomId: roomId
    }));
}

// Initialize video element observer
function initializeVideoObserver() {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            const videoElements = document.querySelectorAll('video');
            if (videoElements.length > 0) {
                videoElement = videoElements[0];
                setupVideoListeners();
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

    videoElement.addEventListener('play', sendVideoState);
    videoElement.addEventListener('pause', sendVideoState);
    videoElement.addEventListener('seeking', sendVideoState);
    videoElement.addEventListener('timeupdate', () => {
        if (isHost) {
            sendVideoState();
        }
    });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
        case 'initParty':
            roomId = request.roomId;
            isHost = request.isHost;
            initializeWebSocket();
            break;
        case 'leaveParty':
            if (socket) {
                socket.close();
            }
            roomId = null;
            isHost = false;
            break;
    }
    sendResponse({ success: true });
});

// Start observing for video element
initializeVideoObserver(); 