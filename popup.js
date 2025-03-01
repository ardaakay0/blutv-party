document.getElementById('createRoom').addEventListener('click', () => {
    const roomId = Math.random().toString(36).substring(7);
    document.getElementById('roomId').value = roomId;
    connectToRoom(roomId);
});

document.getElementById('joinRoom').addEventListener('click', () => {
    const roomId = document.getElementById('roomId').value;
    connectToRoom(roomId);
});

function connectToRoom(roomId) {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
            action: 'joinRoom',
            roomId: roomId
        }, (response) => {
            if (response.status === 'connected') {
                document.getElementById('status').textContent = 'Connected to room: ' + roomId;
            }
        });
    });
} 