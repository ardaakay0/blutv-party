document.addEventListener('DOMContentLoaded', () => {
    const createRoomBtn = document.getElementById('createRoom');
    const joinRoomBtn = document.getElementById('joinRoom');
    const leaveRoomBtn = document.getElementById('leaveRoom');
    const roomInput = document.getElementById('roomInput');
    const createJoinDiv = document.getElementById('create-join');
    const roomControlsDiv = document.getElementById('room-controls');
    const currentRoomSpan = document.getElementById('currentRoom');

    // Generate a random room ID
    function generateRoomId() {
        return Math.random().toString(36).substring(2, 8);
    }

    // Show room controls and hide create/join options
    function showRoomControls(roomId) {
        createJoinDiv.style.display = 'none';
        roomControlsDiv.style.display = 'block';
        currentRoomSpan.textContent = roomId;
    }

    // Hide room controls and show create/join options
    function showCreateJoin() {
        createJoinDiv.style.display = 'block';
        roomControlsDiv.style.display = 'none';
        roomInput.value = '';
    }

    // Create a new room
    createRoomBtn.addEventListener('click', () => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            const currentTab = tabs[0];
            if (currentTab.url.includes('blutv.com')) {
                const roomId = generateRoomId();
                chrome.tabs.sendMessage(currentTab.id, {
                    type: 'initParty',
                    roomId: roomId,
                    isHost: true
                }, () => {
                    showRoomControls(roomId);
                });
            } else {
                alert('Please navigate to a BluTV video page first!');
            }
        });
    });

    // Join an existing room
    joinRoomBtn.addEventListener('click', () => {
        const roomId = roomInput.value.trim();
        if (!roomId) {
            alert('Please enter a room ID!');
            return;
        }

        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            const currentTab = tabs[0];
            if (currentTab.url.includes('blutv.com')) {
                chrome.tabs.sendMessage(currentTab.id, {
                    type: 'initParty',
                    roomId: roomId,
                    isHost: false
                }, () => {
                    showRoomControls(roomId);
                });
            } else {
                alert('Please navigate to a BluTV video page first!');
            }
        });
    });

    // Leave the current room
    leaveRoomBtn.addEventListener('click', () => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'leaveParty'
            }, () => {
                showCreateJoin();
            });
        });
    });
}); 