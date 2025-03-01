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
      // Update the extension badge
      updateBadge(tabId, request.connected);
      
      // Store room information for potentially reconnecting
      if (request.connected && request.roomId) {
        rooms.set(request.roomId, {
          tabId: tabId,
          isHost: request.isHost,
          serverUrl: request.serverUrl
        });
      } else if (!request.connected && tabId) {
        // Find and remove any rooms associated with this tab
        for (const [roomId, room] of rooms.entries()) {
          if (room.tabId === tabId) {
            rooms.delete(roomId);
            break;
          }
        }
      }
      break;

    case 'peerCount':
      // If count is -1, this is just a notification that peers have changed
      // No action needed, the content script will handle the actual count
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
    
    // Remove any rooms associated with this tab
    for (const [roomId, room] of rooms.entries()) {
        if (room.tabId === tabId) {
            rooms.delete(roomId);
        }
    }
}); 