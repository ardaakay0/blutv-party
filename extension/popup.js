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

    let currentTabId = null;
    let currentUrl = null;
    let contentScriptLoaded = false;

    // Generate a random room ID
    function generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // Save room state
    function saveRoomState(roomId, isHost) {
        chrome.storage.local.set({
            roomState: {
                roomId,
                isHost,
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
    function showRoomControls(roomId, skipStatusUpdate = false) {
        createJoinDiv.style.display = 'none';
        roomControlsDiv.style.display = 'block';
        currentRoomSpan.textContent = roomId;
        if (!skipStatusUpdate) {
            updateStatus('Connecting...');
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
                    // Host is always initially connected
                    updateStatus('Waiting for peers...', true);
                } else {
                    updateStatus(
                        isConnected ? 'Connected' : 'Connecting to host...',
                        isConnected
                    );
                }
                
                if (response.peerCount) {
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

            const roomId = generateRoomId();
            const response = await sendMessageToTab({
                type: 'initParty',
                roomId: roomId,
                isHost: true
            });

            if (response) {
                showRoomControls(roomId);
                saveRoomState(roomId, true);
                await checkConnectionState();
            } else {
                showError('Failed to initialize party. Please refresh the page and try again.');
            }
        } catch (error) {
            showError('Failed to create room. Please try again.');
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

            const response = await sendMessageToTab({
                type: 'initParty',
                roomId: roomId,
                isHost: false
            });

            if (response) {
                showRoomControls(roomId);
                saveRoomState(roomId, false);
                await checkConnectionState();
            } else {
                showError('Failed to join party. Please refresh the page and try again.');
            }
        } catch (error) {
            showError('Failed to join room. Please try again.');
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

    // Listen for status updates
    chrome.runtime.onMessage.addListener((message, sender) => {
        if (sender.tab?.id === currentTabId) {
            switch (message.type) {
                case 'connectionStatus':
                    if (message.isHost) {
                        updateStatus(
                            message.connected ? 'Waiting for peers...' : 'Disconnected',
                            message.connected
                        );
                    } else {
                        updateStatus(
                            message.connected ? 'Connected' : 'Connecting to host...',
                            message.connected
                        );
                    }
                    if (message.error) {
                        showError(message.error);
                    } else {
                        hideError();
                    }
                    break;
                case 'peerCount':
                    updatePeerCount(message.count);
                    if (message.count > 0) {
                        updateStatus('Connected', true);
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
            showRoomControls(roomState.roomId, true); // Skip initial status update
            checkConnectionState();
        } else if (roomState && roomState.tabId === currentTabId) {
            // We have a room state but we're not on a BluTV page
            clearRoomState();
            showCreateJoin();
        }
    });
}); 