let socket;
let videoElement;
let roomId;

function initializeSync() {
    // Find the video element on BluTV
    videoElement = document.querySelector('video');
    
    if (!videoElement) {
        console.error('No video element found');
        return;
    }

    // Load Socket.io client
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.7.4/socket.io.min.js';
    document.head.appendChild(script);

    script.onload = () => {
        // Connect to your server
        socket = io('YOUR_SERVER_URL');

        // Listen for video events
        videoElement.addEventListener('play', handleVideoEvent);
        videoElement.addEventListener('pause', handleVideoEvent);
        videoElement.addEventListener('seeked', handleVideoEvent);

        // Listen for updates from other users
        socket.on('videoStateUpdate', (data) => {
            if (data.type === 'play') {
                videoElement.play();
            } else if (data.type === 'pause') {
                videoElement.pause();
            } else if (data.type === 'seeked') {
                videoElement.currentTime = data.currentTime;
            }
        });
    };
}

function handleVideoEvent(event) {
    if (!socket || !roomId) return;

    const videoState = {
        type: event.type,
        currentTime: videoElement.currentTime,
        isPlaying: !videoElement.paused,
        roomId: roomId
    };

    socket.emit('videoEvent', videoState);
}

function connectToRoom(newRoomId) {
    roomId = newRoomId;
    if (socket) {
        socket.emit('joinRoom', roomId);
    }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'joinRoom') {
        connectToRoom(request.roomId);
        sendResponse({status: 'connected'});
    }
});

// Initialize when the page loads
initializeSync(); 