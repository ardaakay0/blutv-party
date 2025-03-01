let peerConnections = new Map(); // Store peer connections
let dataChannels = new Map(); // Store data channels
let videoElement;
let isHost = false;
let roomId = null;
let lastTimeUpdate = 0;
const SYNC_THRESHOLD = 2; // seconds
let isConnected = false;

// Initialize WebRTC connection
function initializeConnection() {
    isConnected = false; // Reset connection state
    chrome.runtime.sendMessage({ 
        type: 'connectionStatus', 
        connected: false
    });

    if (isHost) {
        // Host creates a room and waits for peers
        console.log('✅ Created room:', roomId);
        chrome.runtime.sendMessage({ 
            type: 'connectionStatus', 
            connected: true,
            isHost: true,
            roomId: roomId
        });
        isConnected = true; // Host is always initially connected
    } else {
        // Peer connects to host
        console.log('🔄 Connecting to room:', roomId);
        connectToPeer(roomId);
    }
}

// Create RTCPeerConnection with a peer
function createPeerConnection(peerId) {
    const peerConnection = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    });

    // Create data channel for synchronization
    const dataChannel = peerConnection.createDataChannel('sync');
    setupDataChannel(dataChannel);
    dataChannels.set(peerId, dataChannel);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            // Send ICE candidate to peer through extension messaging
            chrome.runtime.sendMessage({
                type: 'relayICECandidate',
                candidate: event.candidate,
                peerId: peerId
            });
        }
    };

    peerConnection.ondatachannel = (event) => {
        setupDataChannel(event.channel);
    };

    peerConnections.set(peerId, peerConnection);
    return peerConnection;
}

// Setup data channel for sync messages
function setupDataChannel(channel) {
    channel.onopen = () => {
        console.log('Data channel opened');
        isConnected = true;
        chrome.runtime.sendMessage({ 
            type: 'connectionStatus', 
            connected: true 
        });
        chrome.runtime.sendMessage({
            type: 'peerCount',
            count: dataChannels.size
        });
        if (isHost) {
            sendVideoState();
        }
    };

    channel.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleSyncMessage(data);
    };

    channel.onerror = (error) => {
        console.error('Data channel error:', error);
        chrome.runtime.sendMessage({ 
            type: 'connectionStatus', 
            connected: false,
            error: 'Connection error occurred'
        });
    };

    channel.onclose = () => {
        console.log('Data channel closed');
        const wasConnected = isConnected;
        isConnected = dataChannels.size > 0;
        
        // Only send status update if connection state actually changed
        if (wasConnected !== isConnected) {
            chrome.runtime.sendMessage({ 
                type: 'connectionStatus', 
                connected: isConnected 
            });
        }
        
        chrome.runtime.sendMessage({
            type: 'peerCount',
            count: dataChannels.size
        });
    };
}

// Handle incoming sync messages
function handleSyncMessage(data) {
    if (!videoElement) return;
    
    console.log('Received sync:', data);
    
    if (Math.abs(videoElement.currentTime - data.currentTime) > SYNC_THRESHOLD) {
        videoElement.currentTime = data.currentTime;
    }
    if (data.isPlaying) {
        videoElement.play().catch(error => {
            console.error('Failed to play:', error);
        });
    } else {
        videoElement.pause();
    }
}

// Connect to a peer using their room ID
async function connectToPeer(hostRoomId) {
    const peerConnection = createPeerConnection(hostRoomId);
    
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Send offer to host through extension messaging
        chrome.runtime.sendMessage({
            type: 'relayOffer',
            offer: offer,
            roomId: hostRoomId
        });
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

// Send video state to all connected peers
function sendVideoState() {
    if (!videoElement) return;

    const now = Date.now();
    if (now - lastTimeUpdate < 1000) return; // Throttle updates
    lastTimeUpdate = now;

    const state = {
        currentTime: videoElement.currentTime,
        isPlaying: !videoElement.paused
    };
    
    console.log('Sending sync:', state);
    
    // Send to all connected peers
    dataChannels.forEach(channel => {
        if (channel.readyState === 'open') {
            channel.send(JSON.stringify(state));
        }
    });
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
                    peerCount: dataChannels.size,
                    isHost: isHost,
                    roomId: roomId
                };
                
            case 'initParty':
                // Clean up any existing connections first
                peerConnections.forEach(connection => connection.close());
                dataChannels.forEach(channel => channel.close());
                peerConnections.clear();
                dataChannels.clear();
                
                roomId = request.roomId;
                isHost = request.isHost;
                initializeConnection();
                return { success: true };
                
            case 'joinRequest':
                if (isHost) {
                    const peerConnection = createPeerConnection(request.peerId);
                    try {
                        await peerConnection.setRemoteDescription(request.offer);
                        const answer = await peerConnection.createAnswer();
                        await peerConnection.setLocalDescription(answer);
                        
                        // Send answer back through extension messaging
                        chrome.runtime.sendMessage({
                            type: 'relayAnswer',
                            answer: answer,
                            peerId: request.peerId
                        });
                        return { success: true };
                    } catch (error) {
                        console.error('Error creating answer:', error);
                        return { success: false, error: error.message };
                    }
                }
                return { success: false };
                
            case 'receiveAnswer':
                if (!isHost) {
                    const peerConnection = peerConnections.get(roomId);
                    if (peerConnection) {
                        await peerConnection.setRemoteDescription(request.answer);
                        return { success: true };
                    }
                }
                return { success: false };
                
            case 'receiveICE':
                const peerConnection = isHost ? 
                    peerConnections.get(request.peerId) : 
                    peerConnections.get(roomId);
                if (peerConnection) {
                    await peerConnection.addIceCandidate(request.candidate);
                    return { success: true };
                }
                return { success: false };
                
            case 'leaveParty':
                // Close all peer connections
                peerConnections.forEach(connection => connection.close());
                dataChannels.forEach(channel => channel.close());
                peerConnections.clear();
                dataChannels.clear();
                roomId = null;
                isHost = false;
                isConnected = false;
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