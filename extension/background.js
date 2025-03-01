// Store room information
const rooms = new Map();

// Keep track of tabs where content script is loaded
const contentScriptTabs = new Set();

// Log function for debugging
function log(message, data) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  if (data) {
    console.log(`[${timestamp}] ${message}`, data);
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  log('BluTV Party extension installed');
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  
  switch (request.type) {
    case 'checkContentScript':
      log(`Checking if content script is loaded in tab ${request.tabId}`, contentScriptTabs.has(request.tabId));
      sendResponse({ isLoaded: contentScriptTabs.has(request.tabId) });
      break;

    case 'injectContentScript':
      log(`Injecting content script into tab ${request.tabId}`);
      injectContentScript(request.tabId).then(success => {
        log(`Content script injection ${success ? 'succeeded' : 'failed'} for tab ${request.tabId}`);
        sendResponse({ success });
      });
      break;

    case 'connectionStatus':
      // Update the extension badge
      updateBadge(tabId, request.connected);
      
      // Log connection state changes
      log(`Connection status update for tab ${tabId}`, {
        state: request.status,
        connected: request.connected,
        isHost: request.isHost,
        message: request.message
      });
      
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
      
    case 'newChatMessage':
      // Display notification for new chat messages
      if (tabId && request.data) {
        // Don't notify for your own messages
        if (!request.data.isOwnMessage) {
          // Update badge with a "chat" indicator
          chrome.action.setBadgeText({
            text: '💬',
            tabId: tabId
          });
          
          // Reset badge after 3 seconds
          setTimeout(() => {
            // Check if tab is still connected before resetting
            chrome.tabs.sendMessage(tabId, { type: 'getPartyState' }, (response) => {
              if (chrome.runtime.lastError) {
                return; // Tab might be closed
              }
              
              if (response && response.connected) {
                chrome.action.setBadgeText({
                  text: '✓',
                  tabId: tabId
                });
              }
            });
          }, 3000);
          
          // If permission granted, show OS notification
          if (sender.tab?.url && request.data.username && request.data.message) {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: 'BluTV Party - ' + request.data.username,
              message: request.data.message,
              silent: false
            });
          }
        }
      }
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
        log(`Content script already loaded in tab ${tabId}`);
        return true;
    }

    try {
        // Check if we can communicate with existing content script
        try {
            await chrome.tabs.sendMessage(tabId, { type: 'ping' });
            log(`Content script responded to ping in tab ${tabId}`);
            contentScriptTabs.add(tabId);
            return true;
        } catch (error) {
            log(`Error pinging content script in tab ${tabId}`, error);
            // Content script not loaded, proceed with injection
        }

        log(`Injecting socket.io.min.js and content.js into tab ${tabId}`);
        
        // Inject Socket.IO first
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['socket.io.min.js']
        });
        
        // Then inject content script
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        });
        
        contentScriptTabs.add(tabId);
        log(`Successfully injected scripts into tab ${tabId}`);
        return true;
    } catch (error) {
        log(`Failed to inject content script into tab ${tabId}`, error);
        return false;
    }
}

// Listen for navigation events
chrome.webNavigation.onCompleted.addListener(async (details) => {
    // Only handle main frame navigation
    if (details.frameId === 0 && details.url.includes('blutv.com')) {
        log(`Navigation completed in tab ${details.tabId} to ${details.url}`);
        await injectContentScript(details.tabId);
    }
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url?.includes('blutv.com')) {
        log(`Tab ${tabId} updated to ${tab.url}`);
        injectContentScript(tabId);
    }
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
    log(`Tab ${tabId} removed`);
    contentScriptTabs.delete(tabId);
    
    // Remove any rooms associated with this tab
    for (const [roomId, room] of rooms.entries()) {
        if (room.tabId === tabId) {
            rooms.delete(roomId);
        }
    }
}); 