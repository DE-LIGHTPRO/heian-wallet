// HEIAN Wallet - Content Script
// Bridges communication between webpage (inpage.js) and extension (background.js)

console.log('🔥 HEIAN Wallet content script loaded');

// Inject wallet icon URL into page before inpage script loads
const iconUrl = chrome.runtime.getURL('public/icons/icon128.png');
const configScript = document.createElement('script');
configScript.textContent = `window.__HEIAN_WALLET_ICON__ = "${iconUrl}";`;
(document.head || document.documentElement).appendChild(configScript);

// Inject inpage script into the webpage
const script = document.createElement('script');
script.src = chrome.runtime.getURL('public/inpage.js');
script.onload = function() {
  this.remove();
  console.log('✅ Inpage script injected and loaded');
};
(document.head || document.documentElement).appendChild(script);

// Listen for messages from inpage script (webpage context)
window.addEventListener('message', async function(event) {
  // Only accept messages from same window
  if (event.source !== window) return;
  
  // Only accept messages from our inpage script
  if (!event.data || event.data.target !== 'heian-content') return;
  
  console.log('📨 Content script received from inpage:', event.data.method);
  
  try {
    // Forward to background script
    const response = await chrome.runtime.sendMessage({
      type: 'RPC_REQUEST',
      method: event.data.method,
      params: event.data.params || [],
      id: event.data.id,
      origin: window.location.origin
    });
    
    console.log('📬 Content script sending response to inpage:', response);
    
    // Send response back to inpage
    window.postMessage({
      target: 'heian-inpage',
      source: 'heian-content',
      method: event.data.method,
      id: event.data.id,
      result: response.result,
      error: response.error
    }, '*');
    
  } catch (error) {
    console.error('❌ Content script error:', error);
    
    // Send error back to inpage
    window.postMessage({
      target: 'heian-inpage',
      source: 'heian-content',
      id: event.data.id,
      error: { message: error.message || 'Request failed' }
    }, '*');
  }
});

// Listen for wallet state changes from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'WALLET_UNLOCKED') {
    console.log('✅ Wallet unlocked, notifying page');
    // Notify the page that wallet is now unlocked
    window.postMessage({
      target: 'heian-inpage',
      source: 'heian-content',
      type: 'accountsChanged',
      accounts: [message.address]
    }, '*');
  } else if (message.type === 'WALLET_LOCKED') {
    console.log('🔒 Wallet locked, notifying page');
    // Notify the page that wallet is now locked
    window.postMessage({
      target: 'heian-inpage',
      source: 'heian-content',
      type: 'accountsChanged',
      accounts: []
    }, '*');
  }
});

console.log('✅ HEIAN Wallet content script ready');
