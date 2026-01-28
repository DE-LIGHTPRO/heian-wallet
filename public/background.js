// Tempo Wallet - Background Service Worker

console.log('🔥 Tempo Wallet background service starting...');

// Store pending connection requests
let pendingConnectionRequest = null;

// Listen for wallet unlock (storage change) to notify all tabs
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.tempoWallet) {
    // Wallet was just unlocked or locked
    if (changes.tempoWallet.newValue) {
      console.log('✅ Wallet unlocked, notifying all tabs');
      // Notify all tabs that wallet is now unlocked
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'WALLET_UNLOCKED',
            address: changes.tempoWallet.newValue.address
          }).catch(() => {
            // Ignore errors for tabs without content script
          });
        });
      });
    } else if (changes.tempoWallet.oldValue && !changes.tempoWallet.newValue) {
      console.log('🔒 Wallet locked, notifying all tabs');
      // Notify all tabs that wallet is now locked
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'WALLET_LOCKED'
          }).catch(() => {
            // Ignore errors for tabs without content script
          });
        });
      });
    }
  }
});

// Listen for ALL messages (RPC requests, faucet requests, etc.)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Message received:', request);

  // Handle connection approval from popup
  if (request.type === 'CONNECTION_APPROVED') {
    console.log('✅ User approved connection');
    if (pendingConnectionRequest) {
      pendingConnectionRequest.sendResponse({
        result: [pendingConnectionRequest.address],
        error: null
      });

      // Save approved connection
      chrome.storage.local.get(['connectedSites'], (result) => {
        const connectedSites = result.connectedSites || {};
        connectedSites[pendingConnectionRequest.origin] = {
          address: pendingConnectionRequest.address,
          approvedAt: Date.now()
        };
        chrome.storage.local.set({ connectedSites });
        console.log('💾 Saved connection approval for:', pendingConnectionRequest.origin);
      });

      // Clear pending request
      pendingConnectionRequest = null;
      chrome.storage.local.remove(['pendingConnectionRequest']);
    }
    sendResponse({ success: true });
    return true;
  }

  // Handle connection rejection from popup
  if (request.type === 'CONNECTION_REJECTED') {
    console.log('❌ User rejected connection');
    if (pendingConnectionRequest) {
      pendingConnectionRequest.sendResponse({
        result: null,
        error: {
          code: 4001,
          message: 'User rejected the request.'
        }
      });

      // Clear pending request
      pendingConnectionRequest = null;
      chrome.storage.local.remove(['pendingConnectionRequest']);
    }
    sendResponse({ success: true });
    return true;
  }

  // Handle faucet requests
  if (request.type === 'FAUCET_REQUEST') {
    console.log('🚰 Background: Faucet request for', request.address);

    (async () => {
      try {
        const response = await fetch('https://rpc.moderato.tempo.xyz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tempo_fundAddress',
            params: [request.address],
            id: 1
          })
        });

        const result = await response.json();
        console.log('✅ Background: Faucet result', result);

        sendResponse({ success: true, result: result });
      } catch (error) {
        console.error('❌ Background: Faucet error', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // Keep channel open for async response
  }

  // Handle RPC requests from content script
  if (request.type === 'RPC_REQUEST') {
    const method = request.method;

    if (method === 'eth_requestAccounts') {
      // Pass both tabId AND origin from request
      handleConnect(sendResponse, sender.tab?.id, request.origin).catch(err => {
        console.error('Error in handleConnect:', err);
        sendResponse({ result: null, error: { message: err.message } });
      });
      return true; // Keep channel open for async response
    }

    if (method === 'eth_accounts') {
      handleGetAccounts(sendResponse).catch(err => {
        console.error('Error in handleGetAccounts:', err);
        sendResponse({ result: [], error: null });
      });
      return true; // Keep channel open for async response
    }

    if (method === 'eth_sendTransaction') {
      handleSendTransaction(request.params, sendResponse);
      return true;
    }

    if (method === 'eth_chainId') {
      sendResponse({ result: '0xa5bf', error: null }); // Moderato testnet: 42431
      return true;
    }

    // Default response for unsupported methods
    sendResponse({ result: null, error: { message: 'Method not supported: ' + method } });
    return true;
  }

  // Legacy direct method handling (for backward compatibility)
  if (request.method === 'eth_requestAccounts') {
    handleConnect(sendResponse, sender.tab?.id);
    return true;
  }

  if (request.method === 'eth_accounts') {
    handleGetAccounts(sendResponse);
    return true;
  }

  if (request.method === 'eth_sendTransaction') {
    handleSendTransaction(request.params, sendResponse);
    return true;
  }

  // Default response
  sendResponse({ result: null, error: { message: 'Method not supported' } });
  return true;
});

async function handleConnect(sendResponse, tabId, requestOrigin) {
  console.log('🔗 Connect request from dApp...', 'tabId:', tabId, 'requestOrigin:', requestOrigin);

  try {
    // Check both unlocked wallet and encrypted wallet
    const result = await chrome.storage.local.get(['tempoWallet', 'encryptedWallet', 'accounts', 'currentAccountIndex', 'connectedSites']);

    // Check if wallet exists
    if (!result.encryptedWallet && (!result.accounts || result.accounts.length === 0)) {
      console.log('❌ No wallet found');
      sendResponse({
        result: null,
        error: {
          code: 4001,
          message: 'No wallet found. Please create a wallet first.'
        }
      });
      return;
    }

    // Check if wallet is locked
    if (!result.tempoWallet || !result.tempoWallet.address) {
      console.log('🔒 Wallet is locked, opening popup for unlock...');
      chrome.action.openPopup().catch(() => {
        console.log('⚠️ Could not open popup automatically');
      });

      sendResponse({
        result: null,
        error: {
          code: 4001,
          message: 'User rejected the request. Please unlock your wallet and try again.'
        }
      });
      return;
    }

    // Check if this origin is already connected
    const connectedSites = result.connectedSites || {};
    const accountAddress = result.tempoWallet.address;

    if (requestOrigin && connectedSites[requestOrigin]) {
      console.log('✅ Site already connected, auto-approving:', requestOrigin);
      sendResponse({
        result: [accountAddress],
        error: null
      });
      return;
    }

    // Wallet is unlocked - get tab info for origin
    console.log('✅ Wallet is unlocked, requesting user approval...');

    // Check if we have a valid tabId
    if (!tabId) {
      console.error('❌ No tabId provided');
      sendResponse({
        result: null,
        error: {
          code: 4001,
          message: 'Connection error. Please try again.'
        }
      });
      return;
    }

    // ✅ IMPROVED: Use requestOrigin if available, otherwise get from tab
    if (requestOrigin) {
      console.log('✅ Using origin from request:', requestOrigin);
      proceedWithConnection(requestOrigin);
    } else {
      // Fallback: get origin from tab URL
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          console.error('❌ Error getting tab:', chrome.runtime.lastError);
          sendResponse({
            result: null,
            error: {
              code: 4001,
              message: 'Connection error. Please refresh the page and try again.'
            }
          });
          return;
        }

        if (!tab || !tab.url) {
          console.error('❌ Tab URL is undefined');
          sendResponse({
            result: null,
            error: {
              code: 4001,
              message: 'Cannot connect from this page. Please try from a website (not chrome:// or extension pages).'
            }
          });
          return;
        }

        let origin;
        try {
          const url = new URL(tab.url);

          // Check for restricted protocols
          if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:' || url.protocol === 'about:') {
            console.error('❌ Restricted protocol:', url.protocol);
            sendResponse({
              result: null,
              error: {
                code: 4001,
                message: 'Cannot connect from browser internal pages. Please use a website.'
              }
            });
            return;
          }

          origin = url.origin;
        } catch (err) {
          console.error('❌ Invalid URL:', tab.url, err);
          sendResponse({
            result: null,
            error: {
              code: 4001,
              message: 'Invalid page URL. Please refresh and try again.'
            }
          });
          return;
        }

        console.log('📍 Origin from tab:', origin);
        proceedWithConnection(origin);
      });
    }

    function proceedWithConnection(origin) {
      console.log('🔗 Proceeding with connection for origin:', origin);

      // Store the pending request
      pendingConnectionRequest = {
        origin: origin,
        address: result.tempoWallet.address,
        sendResponse: sendResponse,
        tabId: tabId
      };

      // Save to storage so popup can access it
      chrome.storage.local.set({ pendingConnectionRequest: {
        origin: origin,
        address: result.tempoWallet.address,
        tabId: tabId
      }}).then(() => {
        console.log('💾 Saved pending connection request to storage');

        // Open popup to show connection approval screen
        chrome.action.openPopup().then(() => {
          console.log('✅ Popup opened successfully');
        }).catch((err) => {
          console.error('⚠️ Could not open popup:', err);
          sendResponse({
            result: null,
            error: {
              code: 4001,
              message: 'User rejected the request.'
            }
          });
        });
      }).catch((err) => {
        console.error('❌ Error saving to storage:', err);
        sendResponse({
          result: null,
          error: {
            code: 4001,
            message: 'Connection error. Please try again.'
          }
        });
      });
    }

  } catch (error) {
    console.error('❌ Error in handleConnect:', error);
    sendResponse({
      result: null,
      error: { message: error.message || 'Connection failed' }
    });
  }
}

async function handleGetAccounts(sendResponse) {
  console.log('📋 Get accounts request...');

  try {
    const result = await chrome.storage.local.get(['tempoWallet']);

    if (result.tempoWallet && result.tempoWallet.address) {
      console.log('✅ Wallet found:', result.tempoWallet.address);
      sendResponse({
        result: [result.tempoWallet.address],
        error: null
      });
    } else {
      console.log('ℹ️ No wallet connected (locked or not created)');
      sendResponse({
        result: [],
        error: null
      });
    }
  } catch (error) {
    console.error('❌ Error in handleGetAccounts:', error);
    sendResponse({
      result: [],
      error: null
    });
  }
}

async function handleSendTransaction(params, sendResponse) {
  console.log('💸 Send transaction request:', params);

  // TODO: Implement transaction signing and sending
  sendResponse({
    result: null,
    error: { message: 'Transaction sending coming soon!' }
  });
}

console.log('✅ Tempo Wallet background service ready!');
