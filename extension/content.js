let peerConnections = new Map(); // Store peer connections
let dataChannels = new Map(); // Store data channels
let videoElement;
let isHost = false;
let roomId = null;
let lastTimeUpdate = 0;
const SYNC_THRESHOLD = 2; // seconds
let isConnected = false;
let connectionTimeout;
const CONNECTION_TIMEOUT = 30000; // 30 seconds timeout

// Initialize WebRTC connection
function initializeConnection() {
    clearTimeout(connectionTimeout);
    isConnected = false;
    chrome.runtime.sendMessage({ 
        type: 'connectionStatus', 
        connected: false,
        status: 'Initializing connection...'
    });

    // Clean up any existing connections
    peerConnections.forEach(connection => connection.close());
    dataChannels.forEach(channel => channel.close());
    peerConnections.clear();
    dataChannels.clear();

    if (isHost) {
        console.log('✅ Created room:', roomId);
        chrome.runtime.sendMessage({ 
            type: 'connectionStatus', 
            connected: true,
            isHost: true,
            roomId: roomId,
            status: 'Waiting for peers to join...'
        });
        isConnected = true;
    } else {
        console.log('🔄 Connecting to room:', roomId);
        connectToPeer(roomId);
        
        // Set connection timeout
        connectionTimeout = setTimeout(() => {
            if (!isConnected) {
                console.log('❌ Connection timeout - attempting reconnect...');
                chrome.runtime.sendMessage({ 
                    type: 'connectionStatus', 
                    connected: false,
                    status: 'Connection timeout - reconnecting...'
                });
                connectToPeer(roomId); // Attempt reconnection
            }
        }, CONNECTION_TIMEOUT);
    }
}

// Create RTCPeerConnection with a peer
function createPeerConnection(peerId) {
    console.log('Creating peer connection for:', peerId);
    
    const peerConnection = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            {
                urls: [
                    'turn:a.relay.metered.ca:80',
                    'turn:a.relay.metered.ca:80?transport=tcp',
                    'turn:a.relay.metered.ca:443',
                    'turn:a.relay.metered.ca:443?transport=tcp'
                ],
                username: '83ee56d5b5e9c11988b65a19',
                credential: 'eA+qWdcVQEZGTLZa'
            }
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
    });

    peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState;
        console.log(`📡 ICE Connection State (${peerId}):`, state);
        
        chrome.runtime.sendMessage({ 
            type: 'connectionStatus', 
            connected: state === 'connected' || state === 'completed',
            status: `ICE ${state}`
        });

        if (state === 'failed' || state === 'disconnected') {
            console.log('❌ ICE connection failed or disconnected - attempting restart...');
            peerConnection.restartIce();
        }
    };

    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log(`🌐 Connection State (${peerId}):`, state);
        
        if (state === 'failed') {
            console.log('❌ Connection failed - attempting reconnection...');
            // Clean up and retry connection
            peerConnection.close();
            peerConnections.delete(peerId);
            if (!isHost) {
                setTimeout(() => connectToPeer(roomId), 2000);
            }
        }
    };

    peerConnection.onsignalingstatechange = () => {
        console.log(`📞 Signaling State (${peerId}):`, peerConnection.signalingState);
    };

    peerConnection.onicegatheringstatechange = () => {
        console.log(`❄️ ICE Gathering State (${peerId}):`, peerConnection.iceGatheringState);
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('📨 New ICE candidate:', event.candidate.candidate);
            chrome.runtime.sendMessage({
                type: 'relayICECandidate',
                candidate: event.candidate,
                peerId: peerId
            });
        }
    };

    // Create data channel for synchronization
    const dataChannel = peerConnection.createDataChannel('sync', {
        ordered: true,
        maxRetransmits: 3
    });
    setupDataChannel(dataChannel, peerId);
    dataChannels.set(peerId, dataChannel);

    peerConnection.ondatachannel = (event) => {
        console.log('📱 Received data channel');
        setupDataChannel(event.channel, peerId);
    };

    peerConnections.set(peerId, peerConnection);
    return peerConnection;
}

// Setup data channel for sync messages
function setupDataChannel(channel, peerId) {
    channel.onopen = () => {
        console.log(`✅ Data channel opened for peer: ${peerId}`);
        clearTimeout(connectionTimeout);
        isConnected = true;
        chrome.runtime.sendMessage({ 
            type: 'connectionStatus', 
            connected: true,
            status: 'Connected successfully'
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