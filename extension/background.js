// Store room information
const rooms = new Map();

// Keep track of tabs where content script is loaded
const contentScriptTabs = new Set();

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('BluTV Party extension installed');
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  
  switch (request.type) {
    case 'checkContentScript':
      sendResponse({ isLoaded: contentScriptTabs.has(request.tabId) });
      break;

    case 'injectContentScript':
      injectContentScript(request.tabId).then(success => {
        sendResponse({ success });
      });
      break;

    case 'connectionStatus':
      if (request.connected && request.isHost) {
        // Store room information
        rooms.set(request.roomId, {
          hostTabId: tabId,
          peers: new Set()
        });
      }
      updateBadge(tabId, request.connected);
      break;

    case 'relayOffer':
      // Forward offer from peer to host
      const room = rooms.get(request.roomId);
      if (room) {
        chrome.tabs.sendMessage(room.hostTabId, {
          type: 'joinRequest',
          peerId: tabId,
          offer: request.offer
        });
        room.peers.add(tabId);
      }
      break;

    case 'relayAnswer':
      // Forward answer from host to peer
      chrome.tabs.sendMessage(request.peerId, {
        type: 'receiveAnswer',
        answer: request.answer
      });
      break;

    case 'relayICECandidate':
      // Forward ICE candidate to the appropriate peer
      const targetTabId = request.peerId;
      chrome.tabs.sendMessage(targetTabId, {
        type: 'receiveICE',
        candidate: request.candidate,
        peerId: tabId
      });
      break;
  }
  
  return true;
});

// Update extension badge
function updateBadge(tabId, connected) {
  chrome.action.setBadgeText({
    text: connected ? '✓' : '×',
    tabId: tabId
  });
  chrome.action.setBadgeBackgroundColor({
    color: connected ? '#28a745' : '#dc3545',
    tabId: tabId
  });
}

// Handle extension updates
chrome.runtime.onUpdateAvailable.addListener(() => {
  chrome.runtime.reload();
});

// Function to inject content script
async function injectContentScript(tabId) {
    // Don't inject if already loaded
    if (contentScriptTabs.has(tabId)) {
        return true;
    }

    try {
        // Check if we can communicate with existing content script
        try {
            await chrome.tabs.sendMessage(tabId, { type: 'ping' });
            contentScriptTabs.add(tabId);
            return true;
        } catch (error) {
            // Content script not loaded, proceed with injection
        }

        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        });
        contentScriptTabs.add(tabId);
        return true;
    } catch (error) {
        console.error('Failed to inject content script:', error);
        return false;
    }
}

// Listen for navigation events
chrome.webNavigation.onCompleted.addListener(async (details) => {
    // Only handle main frame navigation
    if (details.frameId === 0 && details.url.includes('blutv.com')) {
        await injectContentScript(details.tabId);
    }
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url?.includes('blutv.com')) {
        injectContentScript(tabId);
    }
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
    contentScriptTabs.delete(tabId);
}); 