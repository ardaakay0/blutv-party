// Background service worker for BluTV Party extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('BluTV Party extension installed');
});

// Listen for connection status changes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'connectionStatus') {
    // Update extension icon or badge if needed
    chrome.action.setBadgeText({
      text: request.connected ? '✓' : '×',
      tabId: sender.tab.id
    });
    chrome.action.setBadgeBackgroundColor({
      color: request.connected ? '#28a745' : '#dc3545',
      tabId: sender.tab.id
    });
  }
  return true;
});

// Handle extension updates
chrome.runtime.onUpdateAvailable.addListener(() => {
  chrome.runtime.reload();
}); 