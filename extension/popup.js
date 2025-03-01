document.addEventListener('DOMContentLoaded', () => {
    const createRoomBtn = document.getElementById('createRoom');
    const joinRoomBtn = document.getElementById('joinRoom');
    const leaveRoomBtn = document.getElementById('leaveRoom');
    const roomInput = document.getElementById('roomInput');
    const createJoinDiv = document.getElementById('create-join');
    const roomControlsDiv = document.getElementById('room-controls');
    const currentRoomSpan = document.getElementById('currentRoom');
    const statusSpan = document.getElementById('status');
    const statusDot = document.querySelector('.status-dot');
    const peerCountSpan = document.getElementById('peerCount');
    const errorDiv = document.getElementById('error');
    const serverUrlInput = document.getElementById('serverUrl');

    let currentTabId = null;
    let currentUrl = null;
    let contentScriptLoaded = false;
    const DEFAULT_SERVER_URL = 'http://localhost:8080';

    // Generate a random room ID
    function generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // Save room state
    function saveRoomState(roomId, isHost, serverUrl) {
        chrome.storage.local.set({
            roomState: {
                roomId,
                isHost,
                serverUrl,
                tabId: currentTabId,
                url: currentUrl
            }
        });
    }

    // Clear room state
    function clearRoomState() {
        chrome.storage.local.remove('roomState');
    }

    // Show room controls and hide create/join options
    function showRoomControls(roomId, serverUrl, skipStatusUpdate = false) {
        createJoinDiv.style.display = 'none';
        roomControlsDiv.style.display = 'block';
        currentRoomSpan.textContent = roomId;
        document.getElementById('serverStatus').textContent = serverUrl;
        if (!skipStatusUpdate) {
            updateStatus('Connecting to server...');
        }
    }

    // Hide room controls and show create/join options
    function showCreateJoin() {
        createJoinDiv.style.display = 'block';
        roomControlsDiv.style.display = 'none';
        roomInput.value = '';
        updateStatus('Disconnected');
        updatePeerCount(0);
        hideError();
        clearRoomState();
    }

    // Update connection status
    function updateStatus(status, connected = false) {
        statusSpan.textContent = status;
        statusDot.classList.toggle('connected', connected);
    }

    // Update peer count
    function updatePeerCount(count) {
        // Skip updates for invalid counts
        if (count < 0) return;
        peerCountSpan.textContent = count;
    }

    // Show error message
    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    // Hide error message
    function hideError() {
        errorDiv.style.display = 'none';
    }

    // Ensure content script is loaded
    async function ensureContentScriptLoaded(retries = 3) {
        if (contentScriptLoaded) return true;
        
        for (let i = 0; i < retries; i++) {
            try {
                // Wait a bit before first attempt
                if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                // Check with background script first
                const bgResponse = await new Promise(resolve => {
                    chrome.runtime.sendMessage({ 
                        type: 'checkContentScript',
                        tabId: currentTabId
                    }, resolve);
                });

                if (!bgResponse?.isLoaded) {
                    // Request background script to inject content script
                    await chrome.runtime.sendMessage({ 
                        type: 'injectContentScript',
                        tabId: currentTabId
                    });
                    // Wait for injection
                    await new Promise(resolve => setTimeout(resolve, 200));
                }

                // Try to ping the content script
                const response = await new Promise((resolve, reject) => {
                    chrome.tabs.sendMessage(currentTabId, { type: 'ping' }, response => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(response);
                        }
                    });
                });

                if (response?.success) {
                    contentScriptLoaded = true;
                    return true;
                }
            } catch (error) {
                console.log(`Attempt ${i + 1}: Content script not responding, waiting...`);
                if (i === retries - 1) {
                    showError('Failed to connect to the page. Please refresh and try again.');
                    return false;
                }
            }
        }
        return false;
    }

    // Safe message sender with retries
    async function sendMessageToTab(message, retries = 2) {
        if (!currentTabId) return null;
        
        for (let i = 0; i < retries; i++) {
            try {
                if (!await ensureContentScriptLoaded()) {
                    throw new Error('Content script could not be loaded');
                }
                
                const response = await new Promise((resolve, reject) => {
                    chrome.tabs.sendMessage(currentTabId, message, response => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(response);
                        }
                    });
                });

                if (!response?.success && response?.error) {
                    throw new Error(response.error);
                }

                return response;
            } catch (error) {
                console.error(`Attempt ${i + 1} failed:`, error);
                if (i === retries - 1) {
                    throw error;
                }
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 200));
                // Reset content script loaded flag to force recheck
                contentScriptLoaded = false;
            }
        }
        return null;
    }

    // Check connection state
    async function checkConnectionState() {
        if (!currentTabId) return;
        
        try {
            const response = await sendMessageToTab({ type: 'getPartyState' });
            if (response?.success) {
                const isConnected = response.connected;
                const isHost = response.isHost;
                
                if (isHost) {
                    // Host is waiting for peers
                    updateStatus('Waiting for peers...', isConnected);
                } else {
                    updateStatus(
                        isConnected ? 'Connected' : 'Connecting to server...',
                        isConnected
                    );
                }
                
                if (response.peerCount !== undefined) {
                    updatePeerCount(response.peerCount);
                }
            } else {
                updateStatus('Disconnected');
                updatePeerCount(0);
            }
        } catch (error) {
            console.error('Connection check failed:', error);
            updateStatus('Disconnected');
            updatePeerCount(0);
        }
    }

    // Get or validate server URL
    function getServerUrl() {
        let url = serverUrlInput.value.trim();
        
        if (!url) {
            url = DEFAULT_SERVER_URL;
            serverUrlInput.value = url;
        }
        
        // Ensure it has http or https
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'http://' + url;
            serverUrlInput.value = url;
        }
        
        return url;
    }

    // Create a new room
    createRoomBtn.addEventListener('click', async () => {
        try {
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            const currentTab = tabs[0];
            currentTabId = currentTab.id;
            currentUrl = currentTab.url;

            if (!currentTab.url.includes('blutv.com')) {
                showError('Please navigate to a BluTV video page first!');
                return;
            }

            const serverUrl = getServerUrl();
            if (!serverUrl) {
                showError('Please enter a valid server URL!');
                return;
            }

            const roomId = generateRoomId();
            const response = await sendMessageToTab({
                type: 'initParty',
                roomId: roomId,
                isHost: true,
                serverUrl: serverUrl
            });

            if (response) {
                showRoomControls(roomId, serverUrl);
                saveRoomState(roomId, true, serverUrl);
                await checkConnectionState();
            } else {
                showError('Failed to initialize party. Please refresh the page and try again.');
            }
        } catch (error) {
            showError('Failed to create room: ' + error.message);
        }
    });

    // Join an existing room
    joinRoomBtn.addEventListener('click', async () => {
        const roomId = roomInput.value.trim().toUpperCase();
        if (!roomId) {
            showError('Please enter a room ID!');
            return;
        }

        try {
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            const currentTab = tabs[0];
            currentTabId = currentTab.id;
            currentUrl = currentTab.url;

            if (!currentTab.url.includes('blutv.com')) {
                showError('Please navigate to a BluTV video page first!');
                return;
            }

            const serverUrl = getServerUrl();
            if (!serverUrl) {
                showError('Please enter a valid server URL!');
                return;
            }

            const response = await sendMessageToTab({
                type: 'initParty',
                roomId: roomId,
                isHost: false,
                serverUrl: serverUrl
            });

            if (response) {
                showRoomControls(roomId, serverUrl);
                saveRoomState(roomId, false, serverUrl);
                await checkConnectionState();
            } else {
                showError('Failed to join party. Please refresh the page and try again.');
            }
        } catch (error) {
            showError('Failed to join room: ' + error.message);
        }
    });

    // Leave the current room
    leaveRoomBtn.addEventListener('click', async () => {
        if (currentTabId) {
            try {
                await sendMessageToTab({ type: 'leaveParty' });
            } catch (error) {
                console.error('Error leaving party:', error);
            }
            showCreateJoin();
        }
    });

    // Manually request sync from host
    document.getElementById('requestSync').addEventListener('click', async () => {
        try {
            await sendMessageToTab({ type: 'requestSync' });
            showMessage('Sync requested from host');
        } catch (error) {
            showError('Failed to request sync: ' + error.message);
        }
    });

    // Show temporary message
    function showMessage(message, timeout = 3000) {
        showError(message);
        setTimeout(() => {
            hideError();
        }, timeout);
    }

    // Listen for status updates
    chrome.runtime.onMessage.addListener((message, sender) => {
        if (sender.tab?.id === currentTabId) {
            switch (message.type) {
                case 'connectionStatus':
                    updateStatus(
                        message.status || (message.connected ? 'Connected' : 'Disconnected'),
                        message.connected
                    );
                    if (message.message) {
                        showError(message.message);
                    } else {
                        hideError();
                    }
                    break;
                case 'peerCount':
                    updatePeerCount(message.count);
                    break;
                case 'hostChanged':
                    if (message.isHost) {
                        showMessage('You are now the host!');
                    } else {
                        showMessage('Host has changed');
                    }
                    break;
            }
        }
    });

    // Initialize popup state
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        const currentTab = tabs[0];
        currentTabId = currentTab.id;
        currentUrl = currentTab.url;
        
        // Check if we're in a room
        const storage = await chrome.storage.local.get('roomState');
        const roomState = storage.roomState;
        
        if (roomState && 
            roomState.tabId === currentTabId && 
            currentUrl && 
            currentUrl.includes('blutv.com')) {
            // We're in a room and on a BluTV page, restore the UI
            serverUrlInput.value = roomState.serverUrl || DEFAULT_SERVER_URL;
            showRoomControls(roomState.roomId, roomState.serverUrl, true); // Skip initial status update
            checkConnectionState();
        } else if (roomState && roomState.tabId === currentTabId) {
            // We have a room state but we're not on a BluTV page
            clearRoomState();
            showCreateJoin();
        } else {
            // Not in a room, initialize with stored or default server URL
            const serverStorage = await chrome.storage.local.get('lastServerUrl');
            if (serverStorage.lastServerUrl) {
                serverUrlInput.value = serverStorage.lastServerUrl;
            } else {
                serverUrlInput.value = DEFAULT_SERVER_URL;
            }
        }
    });

    // Save the server URL whenever it changes
    serverUrlInput.addEventListener('blur', () => {
        const url = getServerUrl();
        chrome.storage.local.set({ lastServerUrl: url });
    });
}); 