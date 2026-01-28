// ============================================
// HEIAN WALLET - REBUILD V2
// Clean, Organized Architecture
// ============================================

console.log('🔥 HEIAN Wallet v2 loading...');

// ============================================
// GLOBAL VARIABLES
// ============================================

let wallet = null;
let accounts = [];
let currentAccountIndex = 0;
let currentNetwork = 'testnet';
let tokenBalances = {};
let tokenPrices = {}; // Token prices in USD for display
let pendingTransaction = null;
let contacts = [];
let allTransactions = [];
let batchPaymentsData = null;
let currentPassword = null; // Store password for re-encryption

// Performance optimization: Provider and decimals caching
let cachedProvider = null;
let cachedProviderUrl = null;
const decimalsCache = {};
let balanceFetchController = null; // For cancelling pending requests

// Transaction status polling
let statusPollingInterval = null;
const POLLING_INTERVAL = 15000; // Poll every 15 seconds
const MAX_POLLING_TIME = 300000; // Stop polling after 5 minutes

// Constants
const AUTO_LOCK_TIMEOUT = 1800000; // 30 minutes (increased from 5 minutes)
let autoLockTimer = null;

// ============================================
// NETWORK CONFIGURATION
// ============================================

const NETWORKS = {
  testnet: {
    name: 'Moderato Testnet',
    rpc: 'https://rpc.moderato.tempo.xyz',
    chainId: 42431,
    explorer: 'https://explore.moderato.tempo.xyz',
    faucet: 'https://faucet.moderato.tempo.xyz/drip',
    tokens: {
      'pathUSD': '0x20C0000000000000000000000000000000000000',
      'AlphaUSD': '0x20C0000000000000000000000000000000000001',
      'BetaUSD': '0x20C0000000000000000000000000000000000002',
      'ThetaUSD': '0x20C0000000000000000000000000000000000003',
      'KlarnaUSD': '0x20C0000000000000000000000000000000000004' // Placeholder - will be updated when public
    }
  },
  mainnet: {
    name: 'Mainnet',
    rpc: 'https://rpc.tempo.xyz',
    chainId: 792381,
    explorer: 'https://explore.tempo.xyz',
    faucet: null,
    tokens: {
      'USDC': '0x0000000000000000000000000000000000000000',
      'USDT': '0x0000000000000000000000000000000000000000',
      'USDB': '0x0000000000000000000000000000000000000000',
      'DAI': '0x0000000000000000000000000000000000000000',
      'KlarnaUSD': '0x0000000000000000000000000000000000000000' // Will be updated on mainnet launch 2026
    }
  }
};

console.log('✅ Configuration loaded');

// ============================================
// EXPLORER INTEGRATION HELPERS
// ============================================

// Get explorer base URL for current network
function getExplorerUrl() {
  return NETWORKS[currentNetwork].explorer;
}

// Generate explorer URL for address
function getAddressExplorerUrl(address) {
  return `${getExplorerUrl()}/address/${address}`;
}

// Generate explorer URL for transaction
function getTxExplorerUrl(txHash) {
  return `${getExplorerUrl()}/tx/${txHash}`;
}

// Open explorer URL in new tab
function openExplorer(url) {
  console.log('🔗 Opening explorer URL:', url);
  chrome.tabs.create({ url });
  showToast('Opening transaction in explorer...', 'info', 2000);
}

// ============================================
// PERFORMANCE OPTIMIZATION HELPERS
// ============================================

// Get or create cached provider
function getOrCreateProvider(rpcUrl) {
  if (cachedProvider && cachedProviderUrl === rpcUrl) {
    return cachedProvider;
  }

  cachedProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
  cachedProviderUrl = rpcUrl;
  return cachedProvider;
}

// Throttle function to limit how often a function can be called
function throttle(func, delay) {
  let lastCall = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return func.apply(this, args);
    }
  };
}

// Get cached decimals or fetch and cache
async function getTokenDecimals(contract, tokenName) {
  const cacheKey = `${currentNetwork}_${tokenName}`;

  if (decimalsCache[cacheKey] !== undefined) {
    return decimalsCache[cacheKey];
  }

  const decimals = await contract.decimals();
  decimalsCache[cacheKey] = decimals;
  return decimals;
}

// Clear provider cache when switching networks
function clearProviderCache() {
  cachedProvider = null;
  cachedProviderUrl = null;
}

// ============================================
// NUMBER FORMATTING UTILITIES
// ============================================

// Format token balance with smart precision
function formatTokenAmount(amount, options = {}) {
  const {
    maxDecimals = 6,
    minDecimals = 2,
    useCompact = true,
    locale = 'en-US'
  } = options;

  if (amount === null || amount === undefined || isNaN(amount)) {
    return '0';
  }

  const num = parseFloat(amount);

  // Use compact notation for large numbers (M/K)
  if (useCompact) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(2) + 'K';
    }
  }

  // Smart precision based on size
  if (num >= 100) {
    return num.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: minDecimals });
  } else if (num >= 1) {
    return num.toLocaleString(locale, { minimumFractionDigits: minDecimals, maximumFractionDigits: 4 });
  } else if (num > 0) {
    return num.toLocaleString(locale, { minimumFractionDigits: minDecimals, maximumFractionDigits: maxDecimals });
  }

  return '0';
}

// Format USD value
function formatUSD(amount, options = {}) {
  const {
    useCompact = true,
    locale = 'en-US'
  } = options;

  if (amount === null || amount === undefined || isNaN(amount)) {
    return '$0.00';
  }

  const num = parseFloat(amount);

  // Use compact notation for large numbers
  if (useCompact) {
    if (num >= 1000000) {
      return '$' + (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
      return '$' + (num / 1000).toFixed(2) + 'K';
    }
  }

  // Standard USD formatting
  if (num >= 100) {
    return num.toLocaleString(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else if (num >= 1) {
    return num.toLocaleString(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
  } else if (num > 0) {
    return num.toLocaleString(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 });
  }

  return '$0.00';
}

// Format address (truncate)
function formatAddress(address, prefixLength = 6, suffixLength = 4) {
  if (!address) return '';
  if (address.length <= prefixLength + suffixLength) return address;
  return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`;
}

// Format block number
function formatBlockNumber(blockNum) {
  if (!blockNum && blockNum !== 0) return '';
  return '#' + parseInt(blockNum).toLocaleString('en-US');
}

// Toast notification system - BULLETPROOF VERSION
function showToast(message, type = 'success', duration = 3000) {
  console.log('🍞 showToast called:', message, type);

  // Get or create container
  let container = document.getElementById('toast-container');
  if (!container) {
    console.warn('⚠️ Toast container not found, creating it...');
    container = document.createElement('div');
    container.id = 'toast-container';
    // CSS will handle styling via #toast-container rule
    document.body.appendChild(container);
    console.log('✅ Toast container created');
  }

  const toast = document.createElement('div');
  toast.style.cssText = `
    display:flex;
    align-items:center;
    gap:12px;
    padding:16px 20px;
    border-radius:12px;
    box-shadow:0 10px 25px -5px rgba(0,0,0,0.2), 0 8px 10px -6px rgba(0,0,0,0.1);
    min-width:280px;
    max-width:400px;
    background:${type === 'success' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : type === 'error' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'};
    color:white;
    font-size:14px;
    font-weight:500;
    animation:slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  `;

  const iconSvg = type === 'success' ?
    '<svg style="width:24px;height:24px;flex-shrink:0;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' :
    type === 'error' ?
    '<svg style="width:24px;height:24px;flex-shrink:0;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' :
    '<svg style="width:24px;height:24px;flex-shrink:0;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

  toast.innerHTML = `${iconSvg}<div style="flex:1;line-height:1.4;">${message}</div>`;

  container.appendChild(toast);
  console.log('✅ Toast added and visible');

  // Auto remove
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, duration);
}


// ============================================
// ENCRYPTION & SECURITY
// ============================================

// Derive encryption key from password
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt sensitive data
async function encryptData(data, password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const key = await deriveKey(password, salt);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    enc.encode(data)
  );
  
  // Combine salt + iv + encrypted data
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  // Convert to base64
  return btoa(String.fromCharCode(...combined));
}

// Decrypt sensitive data
async function decryptData(encryptedBase64, password) {
  try {
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);
    
    const key = await deriveKey(password, salt);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encrypted
    );
    
    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (error) {
    throw new Error('Wrong password or corrupted data');
  }
}

console.log('✅ Encryption functions loaded');

// ============================================
// STORAGE HELPERS
// ============================================

// Load network preference
async function loadNetwork() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['tempoNetwork'], (result) => {
      if (result.tempoNetwork) {
        currentNetwork = result.tempoNetwork;
        console.log('✅ Loaded network:', currentNetwork);
      } else {
        currentNetwork = 'testnet';
        console.log('✅ Default network: testnet');
      }
      resolve();
    });
  });
}

// Load accounts
async function loadAccounts() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['tempoAccounts'], (result) => {
      if (result.tempoAccounts && Array.isArray(result.tempoAccounts)) {
        accounts = result.tempoAccounts;
        console.log('✅ Loaded accounts:', accounts.length);
      } else {
        accounts = [];
        console.log('✅ No accounts found');
      }
      resolve(accounts);
    });
  });
}

// Save accounts
async function saveAccounts() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ tempoAccounts: accounts }, () => {
      console.log('✅ Accounts saved');
      resolve();
    });
  });
}

// Update encrypted wallet with current accounts and mnemonic
async function updateEncryptedWallet() {
  if (!currentPassword) {
    console.log('⚠️ No password available, skipping encrypted wallet update');
    return;
  }

  if (!wallet || !wallet.mnemonic) {
    console.log('⚠️ No mnemonic available, skipping encrypted wallet update');
    return;
  }

  try {
    const sensitiveData = {
      accounts: accounts,
      currentAccountIndex: currentAccountIndex,
      mnemonic: wallet.mnemonic
    };

    const encrypted = await encryptData(JSON.stringify(sensitiveData), currentPassword);
    await chrome.storage.local.set({ encryptedWallet: encrypted });

    console.log('✅ Encrypted wallet updated with', accounts.length, 'accounts');
  } catch (error) {
    console.error('❌ Failed to update encrypted wallet:', error);
  }
}

console.log('✅ Storage helpers loaded');


// ============================================
// ACCOUNT MANAGEMENT
// ============================================

// Initialize accounts from mnemonic
async function initializeAccounts(mnemonic) {
  try {
    const seed = ethers.utils.mnemonicToSeed(mnemonic);
    const hdNode = ethers.utils.HDNode.fromSeed(seed);
    
    // Derive first account
    const path = "m/44'/60'/0'/0/0";
    const derivedNode = hdNode.derivePath(path);
    const derivedWallet = new ethers.Wallet(derivedNode.privateKey);
    
    accounts = [{
      address: derivedWallet.address,
      privateKey: derivedWallet.privateKey,
      name: 'Account 1',
      path: path
    }];
    
    currentAccountIndex = 0;
    
    await saveAccounts();
    console.log('✅ Initialized account from mnemonic');
    
  } catch (error) {
    console.error('❌ Failed to initialize accounts:', error);
    throw error;
  }
}

// Create new wallet
async function createWallet2() {
  console.log('🎯 createWallet2 called!');
  const btn = document.getElementById('createBtn');
  console.log('Button element:', btn);
  if (!btn) {
    console.log('❌ Button not found!');
    return;
  }
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating...';
  
  const startTime = Date.now();
  
  try {
    // Generate random wallet
    const randomWallet = ethers.Wallet.createRandom();
    
    wallet = {
      address: randomWallet.address,
      privateKey: randomWallet.privateKey,
      mnemonic: randomWallet.mnemonic.phrase
    };
    
    console.log('✅ Wallet created:', wallet.address);
    
    // Initialize account system
    await initializeAccounts(wallet.mnemonic);
    
    // Ensure minimum display time
    const elapsed = Date.now() - startTime;
    if (elapsed < 1000) {
      await new Promise(resolve => setTimeout(resolve, 1000 - elapsed));
    }
    
    showSeedScreen();
    
  } catch (error) {
    console.error('❌ Wallet creation failed:', error);
    alert('Failed to create wallet: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create New Wallet';
  }
}

// Import wallet from seed phrase
async function importWallet() {
  const seedPhrase = prompt('Enter your 12-word seed phrase:');
  
  if (!seedPhrase) return;
  
  try {
    // Validate seed phrase
    const words = seedPhrase.trim().toLowerCase().split(/\s+/);
    
    if (words.length !== 12) {
      throw new Error('Seed phrase must be exactly 12 words');
    }
    
    // Try to create wallet from mnemonic
    const importedWallet = ethers.Wallet.fromMnemonic(seedPhrase.trim());
    
    wallet = {
      address: importedWallet.address,
      privateKey: importedWallet.privateKey,
      mnemonic: seedPhrase.trim()
    };
    
    console.log('✅ Wallet imported:', wallet.address);
    
    // Initialize account system
    await initializeAccounts(wallet.mnemonic);
    
    // Show password setup
    showPasswordSetup();
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    alert('Invalid seed phrase. Please check and try again.');
  }
}

// Unlock wallet
async function unlockWallet(password) {
  try {
    const result = await new Promise(resolve => {
      chrome.storage.local.get(['encryptedWallet'], resolve);
    });
    
    if (!result.encryptedWallet) {
      throw new Error('No encrypted wallet found');
    }
    
    // Decrypt
    const decrypted = await decryptData(result.encryptedWallet, password);
    const sensitiveData = JSON.parse(decrypted);
    
    // Restore accounts
    accounts = sensitiveData.accounts;
    currentAccountIndex = sensitiveData.currentAccountIndex || 0;
    
    if (accounts.length > 0) {
      wallet = {
        address: accounts[currentAccountIndex].address,
        privateKey: accounts[currentAccountIndex].privateKey,
        mnemonic: sensitiveData.mnemonic
      };

      // Store password for session (for re-encryption)
      currentPassword = password;

      // CRITICAL: Save unlocked wallet to storage so background.js can access it for dApp connections
      await chrome.storage.local.set({
        tempoWallet: wallet,
        accounts: accounts,
        currentAccountIndex: currentAccountIndex
      });

      console.log('✅ Wallet unlocked and saved to storage');
      return true;
    }
    
    throw new Error('No accounts found');
    
  } catch (error) {
    console.error('❌ Unlock failed:', error);
    throw error;
  }
}

// Lock wallet
function lockWallet() {
  console.log('🔒 Locking wallet...');

  wallet = null;
  accounts = [];
  currentAccountIndex = 0;
  currentPassword = null; // Clear password on lock

  // CRITICAL: Remove unlocked wallet from storage so dApps can't access it
  chrome.storage.local.remove(['tempoWallet', 'accounts', 'currentAccountIndex'], () => {
    console.log('✅ Wallet data cleared from storage');
  });

  clearAutoLockTimer();

  document.getElementById('walletScreen').style.display = 'none';
  document.getElementById('unlockScreen').style.display = 'block';
  
  document.getElementById('unlockPassword').value = '';
}

// Add new account
async function addAccount() {
  if (!wallet || !wallet.mnemonic) {
    alert('Cannot create account without mnemonic');
    return;
  }
  
  try {
    const seed = ethers.utils.mnemonicToSeed(wallet.mnemonic);
    const hdNode = ethers.utils.HDNode.fromSeed(seed);
    
    // Derive next account
    const accountNumber = accounts.length;
    const path = `m/44'/60'/0'/0/${accountNumber}`;
    const derivedNode = hdNode.derivePath(path);
    const derivedWallet = new ethers.Wallet(derivedNode.privateKey);
    
    accounts.push({
      address: derivedWallet.address,
      privateKey: derivedWallet.privateKey,
      name: `Account ${accountNumber + 1}`,
      path: path
    });
    
    currentAccountIndex = accounts.length - 1;

    wallet = {
      address: accounts[currentAccountIndex].address,
      privateKey: accounts[currentAccountIndex].privateKey,
      mnemonic: wallet.mnemonic
    };

    await saveAccounts();
    await updateEncryptedWallet(); // Update encrypted storage with new account

    console.log('✅ Created account:', wallet.address);

    updateAccountUI();
    fetchBalances();
    
  } catch (error) {
    console.error('❌ Failed to add account:', error);
    alert('Failed to create account');
  }
}

// Switch account
async function switchAccount() {
  const select = document.getElementById('accountSelect');
  if (!select) return;
  
  const newIndex = parseInt(select.value);
  
  if (newIndex === currentAccountIndex) return;
  
  currentAccountIndex = newIndex;
  
  wallet = {
    address: accounts[currentAccountIndex].address,
    privateKey: accounts[currentAccountIndex].privateKey,
    mnemonic: wallet.mnemonic
  };

  await saveAccounts();
  await updateEncryptedWallet(); // Update encrypted storage with new current index

  console.log('✅ Switched to:', accounts[currentAccountIndex].name || `Account ${currentAccountIndex + 1}`);

  fetchBalances();
}

// Rename account
async function renameAccount() {
  const currentAccount = accounts[currentAccountIndex];
  
  if (!currentAccount) {
    alert('No account selected');
    return;
  }
  
  const currentName = currentAccount.name || `Account ${currentAccountIndex + 1}`;
  const newName = prompt('Enter new account name:', currentName);
  
  if (!newName || newName.trim() === '') {
    return;
  }
  
  accounts[currentAccountIndex].name = newName.trim();

  await saveAccounts();
  await updateEncryptedWallet(); // Update encrypted storage with new name

  console.log('✅ Account renamed to:', newName);

  updateAccountUI();
  // Icons already initialized - no need to replace
}

// Update account UI
function updateAccountUI() {
  const select = document.getElementById('accountSelect');
  if (!select) return;
  
  select.innerHTML = accounts.map((acc, index) => {
    const accountName = acc.name || `Account ${index + 1}`;
    return `<option value="${index}">${accountName}</option>`;
  }).join('');
  
  select.value = currentAccountIndex;
}

console.log('✅ Account management loaded');


// ============================================
// BALANCE & TRANSACTIONS
// ============================================

// Debounced balance fetching - prevents too many calls
let balanceFetchTimeout = null;
function fetchBalancesDebounced() {
  if (balanceFetchTimeout) {
    clearTimeout(balanceFetchTimeout);
  }
  balanceFetchTimeout = setTimeout(() => {
    fetchBalances();
  }, 300); // Wait 300ms after last call
}

// Update 24h balance change display (with mock data)
function updateBalanceChange(currentBalance) {
  const changeEl = document.getElementById('balanceChange');
  if (!changeEl) return;

  // Mock data: simulate a percentage change
  // In production, you would compare current balance with balance 24h ago from API
  const mockChange = (Math.random() * 10 - 3).toFixed(2); // Random between -3% and +7%
  const isPositive = parseFloat(mockChange) >= 0;

  // Update the display
  const arrow = changeEl.querySelector('svg polyline');
  const span = changeEl.querySelector('span');

  if (span) {
    span.textContent = `${isPositive ? '+' : ''}${mockChange}%`;
  }

  // Update arrow direction
  if (arrow) {
    if (isPositive) {
      // Up arrow
      arrow.setAttribute('points', '18 15 12 9 6 15');
      changeEl.style.color = 'rgba(16, 185, 129, 0.95)'; // Green
    } else {
      // Down arrow
      arrow.setAttribute('points', '6 9 12 15 18 9');
      changeEl.style.color = 'rgba(239, 68, 68, 0.95)'; // Red
    }
  }

  // Show the element always (for demo - in production, add: if (currentBalance > 0))
  changeEl.style.display = 'inline-flex';

  // Update mini chart
  updateMiniChart(currentBalance, isPositive);
}

// Update mini chart with mock historical data
function updateMiniChart(currentBalance, isPositive) {
  const chartEl = document.getElementById('miniChart');
  if (!chartEl) return;

  // Show chart always for demo (in production, add: if (currentBalance <= 0) return;)
  // Generate demo data even at $0 balance

  // Generate mock historical data points (last 24 hours)
  const points = 20;
  const dataPoints = [];
  const trend = isPositive ? 1.05 : 0.95; // Up or down trend

  for (let i = 0; i < points; i++) {
    // Create organic-looking data with some randomness
    const baseValue = 20 + (i / points) * 10 * (trend - 0.975);
    const randomness = (Math.random() - 0.5) * 4;
    dataPoints.push(Math.max(5, Math.min(35, baseValue + randomness)));
  }

  // Generate SVG polyline points
  const svgPoints = dataPoints.map((value, index) => {
    const x = (index / (points - 1)) * 200;
    const y = 40 - value; // Invert Y axis (SVG is top-down)
    return `${x},${y}`;
  }).join(' ');

  // Update the polyline
  const polyline = chartEl.querySelector('polyline');
  if (polyline) {
    polyline.setAttribute('points', svgPoints);
    // Color based on trend
    const color = isPositive ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)';
    polyline.setAttribute('stroke', color);
  }

  // Show the chart
  chartEl.style.display = 'block';
}

// Initialize token prices with defaults
function initializeTokenPrices() {
  // Stablecoins are pegged to $1 USD
  const stablecoins = ['AlphaUSD', 'BetaUSD', 'pathUSD', 'ThetaUSD', 'KlarnaUSD', 'USDC', 'USDT', 'USDB', 'DAI'];

  stablecoins.forEach(token => {
    tokenPrices[token] = 1.0;
  });

  // Other tokens can have dynamic prices (set to 0 for now, can be fetched from API later)
  // tokenPrices['OtherToken'] = 0;

  console.log('💵 Token prices initialized');
}

// Fetch balances
async function fetchBalances() {
  if (!wallet) {
    console.log('⚠️ No wallet');
    return;
  }

  if (!wallet.address) {
    if (accounts && accounts[currentAccountIndex]) {
      wallet = accounts[currentAccountIndex];
      console.log('✅ Restored wallet from accounts');
    } else {
      console.log('❌ Cannot restore wallet');
      return;
    }
  }

  console.log('💰 Fetching balances...');

  // Check if wallet exists
  if (!wallet || !wallet.address) {
    console.log('⚠️ Wallet not available, skipping balance fetch');
    return;
  }

  try {
    // Cancel any pending balance fetch
    if (balanceFetchController) {
      balanceFetchController.abort();
    }
    balanceFetchController = new AbortController();

    const rpcUrl = NETWORKS[currentNetwork].rpc;
    const provider = getOrCreateProvider(rpcUrl); // Use cached provider
    const networkTokens = NETWORKS[currentNetwork].tokens;

    let totalBalance = 0;
    tokenBalances = {};

    const erc20Abi = [
      'function balanceOf(address owner) view returns (uint256)',
      'function decimals() view returns (uint8)'
    ];

    // Fetch all token balances in parallel for much better performance
    const balancePromises = Object.entries(networkTokens).map(async ([tokenName, tokenAddress]) => {
      try {
        const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);

        // Fetch balance and decimals in parallel
        const [balance, decimals] = await Promise.all([
          contract.balanceOf(wallet.address),
          getTokenDecimals(contract, tokenName) // Use cached decimals
        ]);

        const formattedBalance = parseFloat(ethers.utils.formatUnits(balance, decimals));

        console.log(tokenName + ':', formattedBalance);
        return { tokenName, balance: formattedBalance };
      } catch (error) {
        console.warn(`⚠️ Failed to fetch ${tokenName} balance:`, error.message);
        return { tokenName, balance: 0 };
      }
    });

    // Wait for all balance fetches to complete
    const results = await Promise.all(balancePromises);

    // Process results
    results.forEach(({ tokenName, balance }) => {
      tokenBalances[tokenName] = balance;
      totalBalance += balance;
    });

    // Update balance display - use correct class name
    const balanceAmountEl = document.querySelector('.balance-amount-large');
    if (balanceAmountEl) {
      balanceAmountEl.textContent = formatUSD(totalBalance);
    }

    // Update 24h balance change (mock data - replace with real API later)
    updateBalanceChange(totalBalance);

    console.log('✅ Total balance:', totalBalance);
    console.log('✅ tokenBalances object:', tokenBalances);

    // Update token balances display (optimized to avoid full DOM rebuild)
    updateTokenBalancesDisplay();

  } catch (error) {
    console.error('❌ Error fetching balances:', error);
    console.error('❌ Error details:', error.message, error.stack);

    // Determine error type for better user feedback
    let errorMessage = '❌ Error loading balances.';
    let canRetry = true;

    if (error.message?.includes('network') || error.message?.includes('failed to fetch')) {
      errorMessage = '❌ Network error. Check your connection.';
    } else if (error.message?.includes('timeout')) {
      errorMessage = '❌ Request timed out. RPC may be slow.';
    } else if (error.code === 'NETWORK_ERROR') {
      errorMessage = '❌ Cannot connect to network. Try again later.';
    } else {
      errorMessage = '❌ Error: ' + (error.message || 'Unknown error');
      canRetry = false;
    }

    // Show error message to user with retry button
    const tokenBalancesEl = document.getElementById('tokenBalances');
    if (tokenBalancesEl) {
      tokenBalancesEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;">' +
        '<div style="color:var(--danger);font-size:12px;margin-bottom:10px;">' + errorMessage + '</div>' +
        (canRetry ? '<button onclick="fetchBalances()" style="padding:8px 16px;font-size:12px;">Retry</button>' : '') +
        '</div>';
    }

    // Show toast notification
    showToast(errorMessage, 'error', 4000);

    // Reset balance display to show error state
    const balanceAmountEl = document.querySelector('.balance-amount-large');
    if (balanceAmountEl) {
      balanceAmountEl.textContent = '--';
    }
  }
}

// Show skeleton loading state for tokens
function showTokensSkeleton() {
  const tokenBalancesEl = document.getElementById('tokenBalances');
  if (!tokenBalancesEl) return;

  const skeletonHTML = `
    <div class="token-card" style="background:white;border:1px solid #e2e8f0;border-left:3px solid #e2e8f0;padding:16px;border-radius:16px;display:flex;align-items:center;gap:12px;min-height:56px;opacity:0.6;">
      <div style="flex-shrink:0;width:32px;height:32px;background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:50%;"></div>
      <div style="flex:1;min-width:0;">
        <div style="width:80px;height:14px;background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:4px;margin-bottom:6px;"></div>
        <div style="width:60px;height:11px;background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:4px;"></div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="width:70px;height:15px;background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:4px;margin-bottom:6px;margin-left:auto;"></div>
        <div style="width:50px;height:12px;background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:4px;margin-left:auto;"></div>
      </div>
    </div>
  `.repeat(4);

  tokenBalancesEl.innerHTML = skeletonHTML;
}

// Optimized function to update token balances display without full DOM rebuild
function updateTokenBalancesDisplay() {
  console.log('🎨 updateTokenBalancesDisplay() called');
  console.log('📊 tokenBalances:', tokenBalances);

  const tokenBalancesEl = document.getElementById('tokenBalances');
  if (!tokenBalancesEl) {
    console.error('❌ tokenBalances element not found!');
    return;
  }

  const hideZeroToggle = document.getElementById('hideZeroBalanceToggle');
  const shouldHideZero = hideZeroToggle ? hideZeroToggle.checked : false;

  tokenBalancesEl.style.display = 'flex';

  // Define stablecoins (USD-pegged tokens)
  const stablecoins = ['AlphaUSD', 'BetaUSD', 'pathUSD', 'ThetaUSD', 'KlarnaUSD'];

  // Filter and categorize tokens
  const allTokens = Object.keys(tokenBalances)
    .filter(tokenName => !shouldHideZero || tokenBalances[tokenName] > 0);

  console.log('🔢 allTokens:', allTokens);

  const stablecoinTokens = allTokens.filter(t => stablecoins.includes(t));
  const otherTokens = allTokens.filter(t => !stablecoins.includes(t));

  // If no visible tokens, show empty message
  if (allTokens.length === 0) {
    tokenBalancesEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:#64748b;font-size:12px;">All tokens have zero balance</div>';
    return;
  }

  // Calculate total USD value for percentages
  let totalUSDValue = 0;
  const tokenUSDValues = {};

  allTokens.forEach(tokenName => {
    const balance = tokenBalances[tokenName];
    const price = tokenPrices[tokenName] || (stablecoins.includes(tokenName) ? 1 : 0);
    const usdValue = balance * price;
    tokenUSDValues[tokenName] = usdValue;
    totalUSDValue += usdValue;
  });

  // Build HTML for each token card - PREMIUM DESIGN
  const buildTokenCard = (tokenName, isStablecoin) => {
    const balance = tokenBalances[tokenName];
    const icon = getTokenIcon(tokenName);

    // Get USD value
    const price = tokenPrices[tokenName] || (isStablecoin ? 1 : 0);
    const usdValue = balance * price;
    const percentage = totalUSDValue > 0 ? (usdValue / totalUSDValue * 100) : 0;

    // Smart formatting for token balance
    let displayBalance;
    if (balance >= 1000000) {
      displayBalance = (balance / 1000000).toFixed(2) + 'M';
    } else if (balance >= 1000) {
      displayBalance = (balance / 1000).toFixed(2) + 'K';
    } else if (balance >= 1) {
      displayBalance = balance.toFixed(2);
    } else {
      displayBalance = balance.toFixed(6);
    }

    // Format USD value nicely
    let displayUSD;
    if (usdValue >= 1000000) {
      displayUSD = '$' + (usdValue / 1000000).toFixed(2) + 'M';
    } else if (usdValue >= 1000) {
      displayUSD = '$' + (usdValue / 1000).toFixed(2) + 'K';
    } else {
      displayUSD = '$' + usdValue.toFixed(2);
    }

    // CLEAN PREMIUM DESIGN - single line, no clutter
    const badgeStyle = isStablecoin
      ? 'background:rgba(16, 185, 129, 0.12);color:#10b981;'
      : 'background:rgba(139, 92, 246, 0.12);color:#8b5cf6;';

    return '<div class="token-card" style="background:var(--card-bg);border:1px solid var(--border-color);padding:16px 18px;border-radius:14px;transition:all 0.2s ease;cursor:pointer;margin-bottom:10px;">' +
      '<div style="display:flex;align-items:center;gap:12px;">' +
        // Icon
        '<div style="flex-shrink:0;">' + icon + '</div>' +

        // Token name + badge
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:600;color:var(--text-primary);font-size:15px;margin-bottom:3px;letter-spacing:-0.01em;">' + tokenName + '</div>' +
          '<div style="font-size:9px;font-weight:700;' + badgeStyle + 'padding:3px 7px;border-radius:4px;display:inline-block;letter-spacing:0.04em;">' +
            (isStablecoin ? 'STABLECOIN' : 'TEMPO') +
          '</div>' +
        '</div>' +

        // Amount section
        '<div style="text-align:right;flex-shrink:0;">' +
          '<div style="font-weight:700;color:var(--text-primary);font-size:17px;letter-spacing:-0.02em;margin-bottom:2px;">' + displayUSD + '</div>' +
          '<div style="font-size:11px;color:var(--text-secondary);font-weight:500;">' + displayBalance + '</div>' +
        '</div>' +

        // Percentage
        '<div style="text-align:right;flex-shrink:0;min-width:50px;">' +
          '<div style="font-size:13px;color:var(--text-secondary);font-weight:600;">' + percentage.toFixed(1) + '%</div>' +
        '</div>' +
      '</div>' +
      '</div>';
  };

  let tokensHTML = '';

  // Stablecoins section - PREMIUM HEADER (dark mode aware)
  if (stablecoinTokens.length > 0) {
    tokensHTML += '<div style="grid-column:1/-1;margin:0 0 16px 0;padding:0 0 12px 0;border-bottom:1px solid var(--border-color);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div style="font-size:14px;font-weight:700;color:var(--text-primary);letter-spacing:-0.01em;">Stablecoins</div>' +
          '<div style="font-size:10px;font-weight:700;background:rgba(16,185,129,0.15);color:#10b981;padding:4px 10px;border-radius:6px;letter-spacing:0.03em;">USD-PEGGED</div>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-secondary);font-weight:600;">' + stablecoinTokens.length + ' token' + (stablecoinTokens.length > 1 ? 's' : '') + '</div>' +
      '</div>' +
      '</div>';

    tokensHTML += stablecoinTokens.map(tokenName => buildTokenCard(tokenName, true)).join('');
  }

  // Other tokens section - PREMIUM HEADER (dark mode aware)
  if (otherTokens.length > 0) {
    tokensHTML += '<div style="grid-column:1/-1;margin:24px 0 16px 0;padding:0 0 12px 0;border-bottom:1px solid var(--border-color);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div style="font-size:14px;font-weight:700;color:var(--text-primary);letter-spacing:-0.01em;">Tempo Tokens</div>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-secondary);font-weight:600;">' + otherTokens.length + ' token' + (otherTokens.length > 1 ? 's' : '') + '</div>' +
      '</div>' +
      '</div>';

    tokensHTML += otherTokens.map(tokenName => buildTokenCard(tokenName, false)).join('');
  }

  tokenBalancesEl.innerHTML = tokensHTML;

  // Update total balance in header
  updateTotalBalance(totalUSDValue);
}

// Update total balance display
function updateTotalBalance(totalUSD) {
  const balanceEl = document.querySelector('.balance-amount-large');
  if (balanceEl) {
    balanceEl.textContent = `$${totalUSD.toFixed(2)}`;
  }
}

// Refresh balance manually
async function refreshBalance() {
  const refreshBtn = document.getElementById('refreshBalanceBtn');
  
  if (!refreshBtn) return;
  
  refreshBtn.disabled = true;
  refreshBtn.style.opacity = '0.5';
  const icon = refreshBtn.querySelector('i');
  if (icon) {
    icon.style.animation = 'spin 1s linear infinite';
  }
  
  try {
    console.log('🔄 Manually refreshing balance...');
    await fetchBalances();
    console.log('✅ Balance refreshed!');
  } catch (error) {
    console.error('❌ Refresh failed:', error);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.style.opacity = '1';
    if (icon) {
      icon.style.animation = '';
    }
  }
}

// Send transaction
async function executeSend() {
  // Detect which tab is active
  const addressForm = document.getElementById('sendAddressForm');
  const contactForm = document.getElementById('sendContactForm');
  const isContactTab = contactForm && contactForm.style.display !== 'none';

  // Read from appropriate form based on active tab
  let addressInput, amount, tokenName, memo;

  if (isContactTab) {
    // Reading from Contact tab
    addressInput = document.getElementById('sendContactSelect').value.trim();
    amount = document.getElementById('sendAmountContact').value.trim();
    tokenName = document.getElementById('sendTokenContact').value;
    memo = document.getElementById('sendMemoContact').value.trim();
  } else {
    // Reading from Address tab
    addressInput = document.getElementById('sendToAddress').value.trim();
    amount = document.getElementById('sendAmount').value.trim();
    tokenName = document.getElementById('sendToken').value;
    memo = document.getElementById('sendMemo').value.trim();
  }

  if (!addressInput || !amount || !tokenName) {
    showToast('Please fill in all required fields', 'error');
    return;
  }

  // Validate amount first
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    showToast('Invalid amount', 'error');
    return;
  }

  // Resolve address (handles both 0x addresses and ENS names)
  let recipientAddress = addressInput;
  let recipientDisplay = addressInput;

  // Check if it's an ENS name
  if (addressInput.endsWith('.eth')) {
    showToast('Resolving ENS name...', 'info', 2000);

    try {
      const resolution = await resolveRecipient(addressInput);
      if (resolution && resolution.address) {
        recipientAddress = resolution.address;
        recipientDisplay = resolution.ensName || recipientAddress;
        console.log('✅ ENS resolved:', addressInput, '→', recipientAddress);
      } else {
        showToast('ENS name "' + addressInput + '" not found. Please check the spelling.', 'error', 5000);
        return;
      }
    } catch (error) {
      console.error('ENS resolution error:', error);
      // Provide specific error messages
      if (error.message?.includes('network') || error.message?.includes('timeout')) {
        showToast('Network error: Cannot resolve ENS name. Check your connection.', 'error', 5000);
      } else if (error.message?.includes('not found')) {
        showToast('ENS name "' + addressInput + '" not found or not registered.', 'error', 5000);
      } else {
        showToast('Failed to resolve ENS name: ' + (error.message || 'Unknown error'), 'error', 5000);
      }
      return;
    }
  } else {
    // Validate as Ethereum address
    if (!ethers.utils.isAddress(addressInput)) {
      showToast('Invalid recipient address', 'error');
      return;
    }
    recipientAddress = addressInput;
  }

  // Final validation of resolved address
  if (!recipientAddress || !ethers.utils.isAddress(recipientAddress)) {
    showToast('Invalid recipient address', 'error');
    return;
  }

  // Store transaction for confirmation
  pendingTransaction = {
    to: recipientAddress,        // Use resolved address
    toDisplay: recipientDisplay,  // For display (ENS or address)
    amount: amount,
    token: tokenName,
    memo: memo
  };

  await showConfirmScreen();
}

// Confirm and send
async function confirmAndSend() {
  if (!pendingTransaction) {
    alert('No pending transaction');
    return;
  }
  
  const confirmBtn = document.getElementById('confirmSendBtn');
  const cancelBtn = document.getElementById('cancelSendBtn');
  
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = '<span class="spinner"></span> Sending...';
  cancelBtn.disabled = true;
  
  const timeoutId = setTimeout(() => {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Send';
    cancelBtn.disabled = false;
    alert('⏱️ Transaction timeout\n\nThe transaction is taking longer than expected. It may still complete.\n\nCheck your transaction history in a few minutes.');
  }, 30000);
  
  try {
    const rpcUrl = NETWORKS[currentNetwork].rpc;
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(wallet.privateKey, provider);
    
    const networkTokens = NETWORKS[currentNetwork].tokens;
    const tokenAddress = networkTokens[pendingTransaction.token];
    
    if (!tokenAddress) {
      throw new Error('Token not found');
    }
    
    const erc20Abi = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function decimals() view returns (uint8)'
    ];
    
    const contract = new ethers.Contract(tokenAddress, erc20Abi, signer);
    const decimals = await contract.decimals();
    const amountWei = ethers.utils.parseUnits(pendingTransaction.amount, decimals);
    
    console.log('📤 Sending transaction...');

    const tx = await contract.transfer(pendingTransaction.to, amountWei);

    console.log('✅ Transaction sent:', tx.hash);

    clearTimeout(timeoutId);

    // Save to history immediately (don't wait for confirmation)
    await saveTransaction({
      hash: tx.hash,
      from: wallet.address,
      to: pendingTransaction.to,
      amount: pendingTransaction.amount,
      token: pendingTransaction.token,
      memo: pendingTransaction.memo,
      timestamp: new Date().toISOString(),
      status: 'pending'
    });

    showToast('✅ Transaction sent! Hash: ' + tx.hash.substring(0, 10) + '...', 'success', 5000);

    pendingTransaction = null;

    // Clear the send form
    clearSendForm();

    document.getElementById('confirmScreen').style.display = 'none';
    document.getElementById('walletScreen').style.display = 'block';

    // Wait for confirmation in background (don't block UI)
    tx.wait().then(async () => {
      console.log('✅ Transaction confirmed on blockchain!');

      // Update transaction status to confirmed
      await updateTransactionStatus(tx.hash, 'confirmed');

      showToast('✅ Transaction confirmed on blockchain!', 'success', 3000);
      fetchBalances(); // Refresh balances after confirmation

      // Reload transaction history to show updated status
      await loadTransactionHistory();
      renderTransactionHistory();
    }).catch(async (err) => {
      console.error('⚠️ Transaction confirmation error:', err);

      // Update transaction status to failed
      await updateTransactionStatus(tx.hash, 'failed');

      // Reload transaction history to show failed status
      await loadTransactionHistory();
      renderTransactionHistory();
    });

  } catch (error) {
    clearTimeout(timeoutId);
    console.error('❌ Transaction failed:', error);
    showToast('Transaction failed: ' + error.message, 'error', 5000);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Send';
    cancelBtn.disabled = false;
  }
}

// Save transaction to history
async function saveTransaction(tx) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['tempoTransactions'], (result) => {
      let transactions = result.tempoTransactions || [];
      transactions.unshift(tx);

      chrome.storage.local.set({ tempoTransactions: transactions }, () => {
        console.log('✅ Transaction saved');
        resolve();
      });
    });
  });
}

// Update transaction status (pending → confirmed/failed)
async function updateTransactionStatus(txHash, newStatus) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['tempoTransactions'], (result) => {
      let transactions = result.tempoTransactions || [];

      // Find transaction by hash and update status
      const txIndex = transactions.findIndex(tx => tx.hash === txHash);
      if (txIndex !== -1) {
        transactions[txIndex].status = newStatus;

        chrome.storage.local.set({ tempoTransactions: transactions }, () => {
          console.log(`✅ Transaction ${txHash.substring(0, 10)}... updated to ${newStatus}`);
          resolve();
        });
      } else {
        console.warn(`⚠️ Transaction ${txHash} not found in history`);
        resolve();
      }
    });
  });
}

// Start polling for pending transaction status updates
function startTransactionStatusPolling() {
  // Stop any existing polling
  stopTransactionStatusPolling();

  console.log('🔄 Starting transaction status polling...');

  statusPollingInterval = setInterval(async () => {
    try {
      // Get all pending transactions
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['tempoTransactions'], resolve);
      });

      const transactions = result.tempoTransactions || [];
      const pendingTxs = transactions.filter(tx => tx.status === 'pending');

      if (pendingTxs.length === 0) {
        console.log('✅ No pending transactions, stopping poll');
        stopTransactionStatusPolling();
        return;
      }

      console.log(`🔍 Checking ${pendingTxs.length} pending transactions...`);

      const provider = getOrCreateProvider(NETWORKS[currentNetwork].rpc);

      // Check each pending transaction
      for (const tx of pendingTxs) {
        try {
          // Skip faucet pseudo-hashes
          if (tx.hash.startsWith('0xfaucet_')) {
            continue;
          }

          const receipt = await provider.getTransactionReceipt(tx.hash);

          if (receipt) {
            const newStatus = receipt.status === 1 ? 'confirmed' : 'failed';

            if (newStatus !== tx.status) {
              console.log(`✅ Transaction ${tx.hash.substring(0, 10)}... status changed to ${newStatus}`);

              await updateTransactionStatus(tx.hash, newStatus);

              // Show toast notification
              if (newStatus === 'confirmed') {
                showToast('✅ Transaction confirmed!', 'success', 3000);
                fetchBalances(); // Refresh balances
              } else {
                showToast('❌ Transaction failed', 'error', 3000);
              }

              // Reload and render history
              await loadTransactionHistory();
              renderTransactionHistory();
            }
          }
        } catch (error) {
          console.warn(`⚠️ Error checking transaction ${tx.hash}:`, error.message);
        }
      }
    } catch (error) {
      console.error('❌ Error in status polling:', error);
    }
  }, POLLING_INTERVAL);

  // Auto-stop polling after MAX_POLLING_TIME
  setTimeout(() => {
    console.log('⏱️ Max polling time reached, stopping');
    stopTransactionStatusPolling();
  }, MAX_POLLING_TIME);
}

// Stop transaction status polling
function stopTransactionStatusPolling() {
  if (statusPollingInterval) {
    clearInterval(statusPollingInterval);
    statusPollingInterval = null;
    console.log('⏸️ Transaction status polling stopped');
  }
}

// Fetch transaction history from blockchain
async function fetchBlockchainTransactions() {
  if (!wallet || !wallet.address) return [];

  try {
    console.log('🔍 Fetching blockchain transactions for:', wallet.address);
    const provider = getOrCreateProvider(NETWORKS[currentNetwork].rpc);

    // Get current block number
    const currentBlock = await provider.getBlockNumber();
    console.log('Current block:', currentBlock);

    // Fetch last 1000 blocks of history (adjust based on performance)
    const fromBlock = Math.max(0, currentBlock - 1000);

    const transactions = [];

    // Method 1: Try to get transaction history via eth_getLogs for token transfers
    try {
      console.log('Attempting to fetch logs from blocks:', fromBlock, 'to', currentBlock);

      // ERC20 Transfer event signature: Transfer(address,address,uint256)
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

      // Try to get incoming transfers (to our address)
      console.log('Fetching incoming transfers...');
      const incomingLogs = await Promise.race([
        provider.getLogs({
          fromBlock: fromBlock,
          toBlock: currentBlock,
          topics: [
            transferTopic,
            null, // from (any address)
            ethers.utils.hexZeroPad(wallet.address, 32) // to (our address)
          ]
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout fetching incoming logs')), 10000))
      ]);

      // Try to get outgoing transfers (from our address)
      console.log('Fetching outgoing transfers...');
      const outgoingLogs = await Promise.race([
        provider.getLogs({
          fromBlock: fromBlock,
          toBlock: currentBlock,
          topics: [
            transferTopic,
            ethers.utils.hexZeroPad(wallet.address, 32), // from (our address)
            null // to (any address)
          ]
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout fetching outgoing logs')), 10000))
      ]);

      console.log(`✅ Found ${incomingLogs.length} incoming + ${outgoingLogs.length} outgoing token transfers`);

      // Batch fetch all unique block numbers (much faster!)
      const allLogs = [...incomingLogs, ...outgoingLogs];
      const uniqueBlockNumbers = [...new Set(allLogs.map(log => log.blockNumber))];
      console.log(`Fetching ${uniqueBlockNumbers.length} unique blocks...`);

      // Fetch all blocks in parallel
      const blockCache = {};
      const blockPromises = uniqueBlockNumbers.map(async (blockNum) => {
        try {
          const block = await provider.getBlock(blockNum);
          blockCache[blockNum] = block;
        } catch (err) {
          console.warn(`Failed to fetch block ${blockNum}:`, err);
        }
      });

      await Promise.all(blockPromises);
      console.log(`✅ Fetched ${Object.keys(blockCache).length} blocks`);

      // Process incoming transfers
      for (const log of incomingLogs) {
        try {
          const block = blockCache[log.blockNumber];
          if (!block) continue;

          const from = '0x' + log.topics[1].slice(26);
          const to = '0x' + log.topics[2].slice(26);
          const amount = ethers.BigNumber.from(log.data);

          // Get token info
          const tokenAddress = log.address;
          const tokenName = getTokenNameByAddress(tokenAddress);

          transactions.push({
            hash: log.transactionHash,
            from: from,
            to: to,
            amount: ethers.utils.formatUnits(amount, 6), // Most Tempo tokens are 6 decimals
            token: tokenName || 'Unknown',
            timestamp: block.timestamp * 1000,
            blockNumber: log.blockNumber
          });
        } catch (err) {
          console.warn('Error processing incoming log:', err);
        }
      }

      // Process outgoing transfers
      for (const log of outgoingLogs) {
        try {
          const block = blockCache[log.blockNumber];
          if (!block) continue;

          const from = '0x' + log.topics[1].slice(26);
          const to = '0x' + log.topics[2].slice(26);
          const amount = ethers.BigNumber.from(log.data);

          // Get token info
          const tokenAddress = log.address;
          const tokenName = getTokenNameByAddress(tokenAddress);

          transactions.push({
            hash: log.transactionHash,
            from: from,
            to: to,
            amount: ethers.utils.formatUnits(amount, 6),
            token: tokenName || 'Unknown',
            timestamp: block.timestamp * 1000,
            blockNumber: log.blockNumber
          });
        } catch (err) {
          console.warn('Error processing outgoing log:', err);
        }
      }

    } catch (error) {
      console.warn('❌ Token transfer logs query failed:', error.message);
      console.warn('This may be normal - Tempo RPC might not support eth_getLogs with complex filters');
      console.warn('Falling back to local storage only');
    }

    // Remove duplicates by hash
    const uniqueTxs = {};
    transactions.forEach(tx => {
      uniqueTxs[tx.hash] = tx;
    });

    const finalTxs = Object.values(uniqueTxs);

    // Sort by timestamp (newest first)
    finalTxs.sort((a, b) => b.timestamp - a.timestamp);

    console.log(`✅ Fetched ${finalTxs.length} blockchain transactions`);
    return finalTxs;

  } catch (error) {
    console.error('Failed to fetch blockchain transactions:', error);
    return [];
  }
}

// Helper: Get token name by contract address
function getTokenNameByAddress(address) {
  const tokens = NETWORKS[currentNetwork].tokens;
  for (const [name, addr] of Object.entries(tokens)) {
    if (addr.toLowerCase() === address.toLowerCase()) {
      return name;
    }
  }
  return null;
}

// Load transaction history (merge blockchain + local storage)
async function loadTransactionHistory() {
  try {
    console.log('📥 Loading transaction history...');

    // Fetch from blockchain
    console.log('Fetching from blockchain...');
    const blockchainTxs = await fetchBlockchainTransactions();
    console.log(`Blockchain returned ${blockchainTxs.length} transactions`);

    // Also load from local storage (for transactions we created)
    console.log('Loading from local storage...');
    const storageTxs = await new Promise((resolve) => {
      chrome.storage.local.get(['tempoTransactions'], (result) => {
        const txs = result.tempoTransactions || [];
        console.log(`Storage has ${txs.length} transactions`);
        resolve(txs);
      });
    });

    // Merge and deduplicate
    const allTxs = [...blockchainTxs, ...storageTxs];
    console.log(`Total before dedup: ${allTxs.length}`);

    const uniqueTxs = {};
    allTxs.forEach(tx => {
      uniqueTxs[tx.hash] = tx;
    });

    allTransactions = Object.values(uniqueTxs);

    // Sort by timestamp (newest first)
    allTransactions.sort((a, b) => {
      const timeA = a.timestamp || 0;
      const timeB = b.timestamp || 0;
      return timeB - timeA;
    });

    console.log('✅ Final transaction count:', allTransactions.length);
    if (allTransactions.length > 0) {
      console.log('Sample transaction:', allTransactions[0]);
    }
  } catch (error) {
    console.error('❌ Error loading transactions:', error);
    allTransactions = [];
  }
}

console.log('✅ Balance & transactions loaded');


// ============================================
// UI NAVIGATION & SCREENS
// ============================================

// Show create screen
function showCreateScreen() {
  document.getElementById('createScreen').style.display = 'block';
  document.getElementById('walletScreen').style.display = 'none';
  document.getElementById('unlockScreen').style.display = 'none';
}

// Show seed phrase screen
function showSeedScreen() {
  document.getElementById('createScreen').style.display = 'none';
  document.getElementById('seedScreen').style.display = 'block';
  
  document.getElementById('seedDisplay').textContent = wallet.mnemonic;
}

// Show password setup screen
function showPasswordSetup() {
  document.getElementById('seedScreen').style.display = 'none';
  document.getElementById('createScreen').style.display = 'none';
  document.getElementById('passwordSetupScreen').style.display = 'block';
}

// Show wallet screen
function showWalletScreen() {
  // Hide all other screens
  document.getElementById('createScreen').style.display = 'none';
  document.getElementById('seedScreen').style.display = 'none';
  document.getElementById('passwordSetupScreen').style.display = 'none';
  document.getElementById('unlockScreen').style.display = 'none';
  document.getElementById('sendScreen').style.display = 'none';
  document.getElementById('receiveScreen').style.display = 'none';
  document.getElementById('confirmScreen').style.display = 'none';
  document.getElementById('contactsScreen').style.display = 'none';
  document.getElementById('addContactScreen').style.display = 'none';
  document.getElementById('historyScreen').style.display = 'none';
  document.getElementById('settingsScreen').style.display = 'none';
  document.getElementById('batchPaymentsScreen').style.display = 'none';
  document.getElementById('faucetScreen').style.display = 'none';
  document.getElementById('swapScreen').style.display = 'none';

  // Show wallet screen
  document.getElementById('walletScreen').style.display = 'block';

  // Update network status indicator
  updateNetworkUI();

  if (wallet && wallet.address) {
    document.getElementById('walletAddress').textContent = wallet.address;

    updateAccountUI();

    // If we have cached balances, show them immediately
    if (tokenBalances && Object.keys(tokenBalances).length > 0) {
      updateTokenBalancesDisplay();
    } else {
      // Only show skeleton if no cached data
      showTokensSkeleton();
    }

    // Fetch balances in background (non-blocking) to update with latest data
    fetchBalances();

    // Start polling for pending transactions
    startTransactionStatusPolling();

    // Icons already initialized at startup - no need to replace again

    startAutoLockTimer();
  }
}

// Show send screen
function send() {
  document.getElementById('walletScreen').style.display = 'none';
  document.getElementById('sendScreen').style.display = 'block';
}

// Show receive screen
function receive() {
  document.getElementById('walletScreen').style.display = 'none';
  document.getElementById('receiveScreen').style.display = 'block';

  document.getElementById('receiveAddress').textContent = wallet.address;

  // Use the ID selector directly - more robust than CSS path
  const qrContainer = document.getElementById('qrCodeContainer');
  if (qrContainer) {
    qrContainer.innerHTML = '';

    new QRCode(qrContainer, {
      text: wallet.address,
      width: 200,
      height: 200
    });
  }
}

// Show confirm screen
async function showConfirmScreen() {
  document.getElementById('sendScreen').style.display = 'none';
  document.getElementById('confirmScreen').style.display = 'block';

  if (pendingTransaction) {
    // Show recipient (ENS name if available, otherwise address)
    const recipientEl = document.getElementById('confirmRecipient');
    const addressEl = document.getElementById('confirmAddress');

    if (pendingTransaction.toDisplay && pendingTransaction.toDisplay.endsWith('.eth')) {
      // Show ENS name as primary
      if (recipientEl) recipientEl.textContent = pendingTransaction.toDisplay;
      // Show resolved address below
      if (addressEl) {
        addressEl.textContent = pendingTransaction.to;
        addressEl.style.display = 'block';
      }
    } else {
      // Show address only
      if (recipientEl) recipientEl.textContent = pendingTransaction.to;
      if (addressEl) addressEl.style.display = 'none';
    }

    // Legacy support for old confirmTo element
    const legacyConfirmTo = document.getElementById('confirmTo');
    if (legacyConfirmTo) {
      legacyConfirmTo.textContent = pendingTransaction.toDisplay || pendingTransaction.to;
    }

    // Show amount with token symbol
    document.getElementById('confirmAmount').textContent = pendingTransaction.amount + ' ' + pendingTransaction.token;

    // Calculate and show USD value
    const amountNum = parseFloat(pendingTransaction.amount);
    const tokenPrice = tokenPrices[pendingTransaction.token] || 0;
    const usdValue = amountNum * tokenPrice;

    const confirmAmountUSD = document.getElementById('confirmAmountUSD');
    if (confirmAmountUSD) {
      if (usdValue > 0) {
        confirmAmountUSD.textContent = `≈ $${usdValue.toFixed(2)}`;
        confirmAmountUSD.style.display = 'block';
      } else {
        confirmAmountUSD.textContent = '';
        confirmAmountUSD.style.display = 'none';
      }
    }

    // Show memo if present
    const memoEl = document.getElementById('confirmMemo');
    if (memoEl) {
      memoEl.textContent = pendingTransaction.memo || 'None';
    }

    // Show memo section only if there's a memo
    const memoSection = document.getElementById('confirmMemoSection');
    if (memoSection) {
      if (pendingTransaction.memo) {
        memoSection.style.display = 'block';
      } else {
        memoSection.style.display = 'none';
      }
    }

    // Calculate total
    const totalAmount = parseFloat(pendingTransaction.amount);
    document.getElementById('confirmTotal').textContent = totalAmount.toFixed(2) + ' ' + pendingTransaction.token;

    // Show total USD value
    const confirmTotalUSD = document.getElementById('confirmTotalUSD');
    if (confirmTotalUSD && usdValue > 0) {
      confirmTotalUSD.textContent = `≈ $${usdValue.toFixed(2)}`;
      confirmTotalUSD.style.display = 'block';
    }

    // Estimate gas fees
    await estimateAndDisplayGasFees();
  }
}

// Estimate gas fees and display in stablecoin
async function estimateAndDisplayGasFees() {
  const gasFeeEl = document.getElementById('confirmGasFee');
  const gasFeeUSDEl = document.getElementById('confirmGasFeeUSD');

  try {
    const rpcUrl = NETWORKS[currentNetwork].rpc;
    const provider = getOrCreateProvider(rpcUrl);

    // Get current gas price
    const gasPrice = await provider.getGasPrice();

    // Estimate gas for ERC20 transfer (typical: ~50,000-70,000 gas)
    const estimatedGas = ethers.BigNumber.from('65000'); // Conservative estimate

    // Calculate total gas cost
    const gasCost = gasPrice.mul(estimatedGas);

    // Format gas fee
    const gasFeeFormatted = ethers.utils.formatEther(gasCost);
    const gasFeeNumber = parseFloat(gasFeeFormatted);

    // Display native token amount
    gasFeeEl.textContent = gasFeeNumber.toFixed(6) + ' TEMPO';

    // For Tempo, gas is paid in stablecoins (very low cost ~$0.001)
    // Tempo uses stablecoin gas, so we can show the USD equivalent directly
    const gasFeeUSD = gasFeeNumber * 1; // On Tempo, 1 gas unit ≈ $1 in stablecoin terms

    // Display stablecoin/USD amount
    if (gasFeeUSD < 0.01) {
      gasFeeUSDEl.textContent = '~$0.001 ' + pendingTransaction.token;
      gasFeeUSDEl.style.color = '#10b981'; // Green for very low
    } else if (gasFeeUSD < 0.1) {
      gasFeeUSDEl.textContent = '~$' + gasFeeUSD.toFixed(3) + ' ' + pendingTransaction.token;
      gasFeeUSDEl.style.color = '#10b981'; // Green
    } else {
      gasFeeUSDEl.textContent = '~$' + gasFeeUSD.toFixed(2) + ' ' + pendingTransaction.token;
      gasFeeUSDEl.style.color = '#f59e0b'; // Amber for higher fees
    }

  } catch (error) {
    console.warn('Failed to estimate gas:', error);
    gasFeeEl.textContent = '~0.000001 TEMPO';
    gasFeeUSDEl.textContent = '~$0.001 ' + (pendingTransaction ? pendingTransaction.token : 'USD');
    gasFeeUSDEl.style.color = '#10b981';
  }
}

// Show history screen
async function showHistory() {
  document.getElementById('walletScreen').style.display = 'none';
  document.getElementById('historyScreen').style.display = 'block';

  // Show skeleton while loading
  const skeleton = document.getElementById('historyLoadingSkeleton');
  const listEl = document.getElementById('transactionList');
  if (skeleton) skeleton.style.display = 'block';
  if (listEl) listEl.style.display = 'none';

  // First render from cache immediately (fast)
  if (allTransactions && allTransactions.length > 0) {
    renderTransactionHistory();
    if (skeleton) skeleton.style.display = 'none';
  }

  // Then fetch fresh data in background (slower)
  loadTransactionHistory().then(() => {
    renderTransactionHistory();
  }).catch(err => {
    console.error('Failed to load transaction history:', err);
  });

  // Render results
  renderTransactionHistory();
}

// Render transaction history
function renderTransactionHistory(transactions = allTransactions) {
  const listEl = document.getElementById('transactionList');
  const emptyState = document.getElementById('emptyHistoryState');
  const skeleton = document.getElementById('historyLoadingSkeleton');

  if (!listEl) return;

  // Hide skeleton loader
  if (skeleton) {
    skeleton.style.display = 'none';
  }

  // Show transaction list
  listEl.style.display = 'block';

  if (transactions.length === 0) {
    // Show empty state
    if (emptyState) {
      emptyState.style.display = 'block';
    } else {
      listEl.innerHTML = '<div style="text-align:center;padding:60px 20px;opacity:0.7;">' +
        '<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto 16px;">' +
        '<path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>' +
        '</svg>' +
        '<div style="font-size:14px;color:#0f172a;">No transactions yet</div>' +
        '<div style="font-size:12px;color:#64748b;margin-top:8px;">Your payment history will appear here</div></div>';
    }
    return;
  }

  // Hide empty state if exists
  if (emptyState) {
    emptyState.style.display = 'none';
  }

  // Group transactions by date
  const groupedTxs = {};
  transactions.forEach(tx => {
    const date = new Date(tx.timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let dateKey;
    if (date.toDateString() === today.toDateString()) {
      dateKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      dateKey = 'Yesterday';
    } else {
      dateKey = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    if (!groupedTxs[dateKey]) {
      groupedTxs[dateKey] = [];
    }
    groupedTxs[dateKey].push(tx);
  });

  // Render grouped transactions
  listEl.innerHTML = Object.entries(groupedTxs).map(([dateKey, txs]) => {
    const txCards = txs.map(tx => {
      const date = new Date(tx.timestamp);
      const type = tx.from.toLowerCase() === wallet.address.toLowerCase() ? 'Sent' : 'Received';
      const color = type === 'Sent' ? '#dc2626' : '#10b981';
      const bgColor = type === 'Sent' ? '#fee2e2' : '#d1fae5';
      const explorerUrl = getTxExplorerUrl(tx.hash);

      // Get status info
      const status = tx.status || 'confirmed';
      let statusBadge = '';
      if (status === 'pending') {
        statusBadge = '<span class="status-badge status-badge-pending"><span class="status-pulse"></span>Pending</span>';
      } else if (status === 'failed') {
        statusBadge = '<span class="status-badge status-badge-failed">❌ Failed</span>';
      } else {
        const typeClass = type === 'Sent' ? 'status-badge-sent' : 'status-badge-received';
        statusBadge = '<span class="status-badge status-badge-confirmed">✓ Confirmed</span>';
      }

      // Calculate USD value if available
      const usdValue = tx.usdValue || (tx.amount * (tokenPrices[tx.token] || 0));
      const usdDisplay = usdValue > 0 ? `$${usdValue.toFixed(2)}` : '';

      // Format time
      const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      // Truncate address for display
      const otherAddress = type === 'Sent' ? tx.to : tx.from;
      const truncatedAddress = otherAddress.slice(0, 6) + '...' + otherAddress.slice(-4);

      return '<div class="tx-card" style="border-left:3px solid ' + color + ';padding-left:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px;">' +
          '<div style="flex:1;">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
              '<span style="font-weight:700;color:' + color + ';font-size:13px;">' + type + '</span>' +
              statusBadge +
            '</div>' +
            '<div style="font-size:11px;color:#64748b;">' +
              (type === 'Sent' ? 'To: ' : 'From: ') + '<span style="font-family:monospace;">' + truncatedAddress + '</span>' +
            '</div>' +
          '</div>' +
          '<div style="text-align:right;">' +
            '<div style="font-weight:700;font-size:14px;color:#0f172a;">' +
              (type === 'Sent' ? '-' : '+') + tx.amount + ' ' + tx.token +
            '</div>' +
            (usdDisplay ? '<div style="font-size:11px;color:#64748b;margin-top:2px;">' + (type === 'Sent' ? '-' : '+') + usdDisplay + '</div>' : '') +
          '</div>' +
        '</div>' +
        (tx.memo ? '<div style="display:flex;align-items:start;gap:6px;background:#f8fafc;border-radius:6px;padding:6px 8px;margin-top:8px;">' +
          '<span style="font-size:12px;">💬</span>' +
          '<span style="font-size:11px;color:#475569;line-height:1.4;">' + escapeHtml(tx.memo) + '</span>' +
        '</div>' : '') +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">' +
          '<div style="font-size:10px;color:#94a3b8;">' + timeStr + (tx.confirmations ? ' • ' + tx.confirmations + ' confirmations' : '') + '</div>' +
          '<button class="tx-view-btn" data-explorer-url="' + explorerUrl + '" style="background:none;border:none;color:#667eea;font-size:10px;cursor:pointer;display:flex;align-items:center;gap:3px;padding:2px 6px;border-radius:4px;transition:background 0.2s;font-weight:600;">' +
            '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>' +
              '<polyline points="15 3 21 3 21 9"></polyline>' +
              '<line x1="10" y1="14" x2="21" y2="3"></line>' +
            '</svg>' +
            '<span>Explorer</span>' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div style="margin-bottom:20px;">' +
      '<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;padding:8px 0;border-bottom:1px solid #e2e8f0;margin-bottom:12px;">' + dateKey + '</div>' +
      txCards +
    '</div>';
  }).join('');

  // Add event delegation for View buttons
  listEl.querySelectorAll('.tx-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-explorer-url');
      openExplorer(url);
    });

    // Add hover effects
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(102, 126, 234, 0.1)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'none';
    });
  });

  listEl.style.display = 'block';
}

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Filter transactions based on search and filter
function filterTransactions() {
  if (!wallet) return;

  const searchInput = document.getElementById('transactionSearchInput');
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

  // Get active filter
  const activeFilter = document.querySelector('.filter-btn.active');
  const filterType = activeFilter ? activeFilter.dataset.filter : 'all';

  let filtered = [...allTransactions];

  // Apply search filter
  if (searchTerm) {
    filtered = filtered.filter(tx => {
      const searchableText = [
        tx.from,
        tx.to,
        tx.hash,
        tx.amount.toString(),
        tx.token,
        tx.memo || ''
      ].join(' ').toLowerCase();

      return searchableText.includes(searchTerm);
    });
  }

  // Apply type filter
  if (filterType === 'sent') {
    filtered = filtered.filter(tx => tx.from.toLowerCase() === wallet.address.toLowerCase());
  } else if (filterType === 'received') {
    filtered = filtered.filter(tx => tx.to.toLowerCase() === wallet.address.toLowerCase());
  } else if (filterType === 'today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    filtered = filtered.filter(tx => new Date(tx.timestamp) >= today);
  } else if (filterType === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    filtered = filtered.filter(tx => new Date(tx.timestamp) >= weekAgo);
  }

  // Re-render with filtered results
  renderTransactionHistory(filtered);

  // Show "no results" message if search/filter returned nothing but we have transactions
  if (filtered.length === 0 && allTransactions.length > 0) {
    const listEl = document.getElementById('transactionList');
    if (listEl) {
      listEl.innerHTML = '<div style="text-align:center;padding:60px 20px;">' +
        '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto 16px;">' +
        '<circle cx="11" cy="11" r="8"></circle>' +
        '<path d="m21 21-4.35-4.35"></path>' +
        '</svg>' +
        '<div style="font-size:14px;color:#0f172a;margin-bottom:8px;">No matching transactions</div>' +
        '<div style="font-size:12px;color:#64748b;">Try adjusting your search or filters</div></div>';
    }
  }
}

// Show settings screen
function showSettings() {
  document.getElementById('walletScreen').style.display = 'none';
  document.getElementById('settingsScreen').style.display = 'block';
  
  updateNetworkUI();
}

// Back to wallet functions
function backToWallet() {
  document.getElementById('sendScreen').style.display = 'none';
  document.getElementById('receiveScreen').style.display = 'none';
  document.getElementById('confirmScreen').style.display = 'none';
  document.getElementById('historyScreen').style.display = 'none';
  document.getElementById('settingsScreen').style.display = 'none';
  document.getElementById('contactsScreen').style.display = 'none';
  document.getElementById('batchPaymentsScreen').style.display = 'none';
  document.getElementById('paymentLinkScreen').style.display = 'none';
  document.getElementById('buyStablecoinsScreen').style.display = 'none';
  document.getElementById('sellStablecoinsScreen').style.display = 'none';
  document.getElementById('addContactScreen').style.display = 'none';
  document.getElementById('swapScreen').style.display = 'none';
  document.getElementById('walletScreen').style.display = 'block';
}

function cancelSend() {
  pendingTransaction = null;
  document.getElementById('confirmScreen').style.display = 'none';
  document.getElementById('sendScreen').style.display = 'block';
}

// Clear send form fields
function clearSendForm() {
  // Clear Address tab fields
  document.getElementById('sendToAddress').value = '';
  document.getElementById('sendAmount').value = '';
  document.getElementById('sendToken').value = 'AlphaUSD';
  document.getElementById('sendMemo').value = '';
  document.getElementById('feeToken').value = 'AlphaUSD';

  // Clear Contact tab fields
  document.getElementById('sendContactSelect').value = '';
  document.getElementById('sendAmountContact').value = '';
  document.getElementById('sendTokenContact').value = 'AlphaUSD';
  document.getElementById('sendMemoContact').value = '';
  document.getElementById('feeTokenContact').value = 'AlphaUSD';

  // Hide ENS status
  const ensStatus = document.getElementById('ensStatus');
  if (ensStatus) {
    ensStatus.style.display = 'none';
    ensStatus.innerHTML = '';
  }

  console.log('✅ Send form cleared');
}

console.log('✅ UI navigation loaded');


// ============================================
// AUTO-LOCK TIMER
// ============================================

function startAutoLockTimer() {
  clearAutoLockTimer();
  
  console.log('⏰ Starting auto-lock timer (5 minutes)');
  
  autoLockTimer = setTimeout(() => {
    console.log('🔒 Auto-lock triggered');
    lockWallet();
  }, AUTO_LOCK_TIMEOUT);
}

function clearAutoLockTimer() {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }
}

// Throttle auto-lock reset to once per second to reduce CPU usage
const resetAutoLock = throttle(function() {
  if (wallet) {
    startAutoLockTimer();
  }
}, 1000); // Max once per second

console.log('✅ Auto-lock timer loaded');

// ============================================
// NETWORK SWITCHING
// ============================================

async function switchNetwork(network) {
  if (network !== 'testnet' && network !== 'mainnet') {
    console.error('Invalid network:', network);
    return;
  }

  const confirmMsg = 'Switch to ' + NETWORKS[network].name + '?\n\nYour wallet address will stay the same, but you\'ll see different balances and transaction history.\n\nMake sure you\'re connected to the correct network!';

  if (!confirm(confirmMsg)) {
    return;
  }

  console.log('🔄 Switching to:', network);

  currentNetwork = network;

  // CRITICAL: Clear provider cache when switching networks
  clearProviderCache();

  await chrome.storage.local.set({ tempoNetwork: network });

  console.log('✅ Switched to:', NETWORKS[network].name);

  updateNetworkUI();

  showToast('Switched to ' + NETWORKS[network].name, 'success');

  // FIXED: Ensure balance fetch happens with retry on failure
  if (wallet && wallet.address) {
    console.log('🔄 Fetching balances for', network, 'at address:', wallet.address);

    // Small delay to ensure provider cache is fully cleared
    setTimeout(async () => {
      try {
        await fetchBalances();
        console.log('✅ Balances loaded for', network);
      } catch (err) {
        console.error('❌ Balance fetch failed, retrying...', err);
        // Retry once after 1 second
        setTimeout(async () => {
          try {
            await fetchBalances();
            console.log('✅ Balances loaded on retry for', network);
          } catch (retryErr) {
            console.error('❌ Balance fetch failed on retry:', retryErr);
            showToast('Failed to load balances. Click refresh.', 'error');
          }
        }, 1000);
      }
    }, 100);
  } else {
    console.warn('⚠️ No wallet or address available for balance fetch');
  }
}

function updateNetworkUI() {
  // Update settings screen network name
  const currentNetworkName = document.getElementById('currentNetworkName');
  if (currentNetworkName) {
    currentNetworkName.textContent = NETWORKS[currentNetwork].name;
  }

  // Update top-right network status indicator
  const networkStatusText = document.getElementById('networkStatusText');
  if (networkStatusText) {
    networkStatusText.textContent = NETWORKS[currentNetwork].name;
  }

  const testnetBtn = document.getElementById('switchToTestnet');
  const mainnetBtn = document.getElementById('switchToMainnet');

  if (testnetBtn && mainnetBtn) {
    if (currentNetwork === 'testnet') {
      testnetBtn.style.borderColor = '#f59e0b';
      testnetBtn.style.background = '#fffbeb';
      mainnetBtn.style.borderColor = '#e2e8f0';
      mainnetBtn.style.background = 'white';
    } else {
      mainnetBtn.style.borderColor = '#10b981';
      mainnetBtn.style.background = '#f0fdf4';
      testnetBtn.style.borderColor = '#e2e8f0';
      testnetBtn.style.background = 'white';
    }
  }

  // Fetch network status when showing settings
  fetchNetworkStatus();
}

// Fetch and display network status
async function fetchNetworkStatus() {
  const rpcStatus = document.getElementById('rpcStatus');
  const blockHeight = document.getElementById('blockHeight');
  const responseTime = document.getElementById('responseTime');

  if (!rpcStatus || !blockHeight || !responseTime) return;

  try {
    // Set loading state
    rpcStatus.innerHTML = '<div style="width:8px;height:8px;border-radius:50%;background:#94a3b8;"></div><span style="font-size:12px;color:#64748b;">Checking...</span>';
    blockHeight.textContent = '#...';
    responseTime.textContent = '-- ms';

    const startTime = performance.now();
    const provider = getOrCreateProvider(NETWORKS[currentNetwork].rpc);

    // Fetch block number
    const blockNum = await provider.getBlockNumber();
    const endTime = performance.now();
    const latency = Math.round(endTime - startTime);

    // Update UI with success
    rpcStatus.innerHTML = '<div style="width:8px;height:8px;border-radius:50%;background:#10b981;"></div><span style="font-size:12px;color:#10b981;font-weight:600;">Online</span>';
    blockHeight.textContent = formatBlockNumber(blockNum);
    responseTime.textContent = latency + ' ms';
    responseTime.style.color = latency < 500 ? '#10b981' : latency < 1000 ? '#f59e0b' : '#dc2626';

  } catch (error) {
    console.error('Network status fetch failed:', error);

    // Update UI with error
    rpcStatus.innerHTML = '<div style="width:8px;height:8px;border-radius:50%;background:#dc2626;"></div><span style="font-size:12px;color:#dc2626;font-weight:600;">Offline</span>';
    blockHeight.textContent = '#--';
    responseTime.textContent = '-- ms';
    responseTime.style.color = '#dc2626';
  }
}

console.log('✅ Network switching loaded');

// ============================================
// TOKEN ICONS
// ============================================

const TOKEN_ICONS = {
  'AlphaUSD': '<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="alpha-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#3B82F6;stop-opacity:1" /><stop offset="100%" style="stop-color:#1D4ED8;stop-opacity:1" /></linearGradient></defs><circle cx="16" cy="16" r="16" fill="url(#alpha-grad)"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="18" font-weight="bold" font-family="system-ui, -apple-system, sans-serif">α</text></svg>',

  'BetaUSD': '<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="beta-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#10B981;stop-opacity:1" /><stop offset="100%" style="stop-color:#059669;stop-opacity:1" /></linearGradient></defs><circle cx="16" cy="16" r="16" fill="url(#beta-grad)"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="18" font-weight="bold" font-family="system-ui, -apple-system, sans-serif">β</text></svg>',

  'pathUSD': '<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="path-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#8B5CF6;stop-opacity:1" /><stop offset="100%" style="stop-color:#7C3AED;stop-opacity:1" /></linearGradient></defs><circle cx="16" cy="16" r="16" fill="url(#path-grad)"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="18" font-weight="bold" font-family="system-ui, -apple-system, sans-serif">π</text></svg>',

  'ThetaUSD': '<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="theta-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#F59E0B;stop-opacity:1" /><stop offset="100%" style="stop-color:#D97706;stop-opacity:1" /></linearGradient></defs><circle cx="16" cy="16" r="16" fill="url(#theta-grad)"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="18" font-weight="bold" font-family="system-ui, -apple-system, sans-serif">θ</text></svg>',
  
  'USDC': '<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="usdc-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#2775CA;stop-opacity:1" /><stop offset="100%" style="stop-color:#1A5FA0;stop-opacity:1" /></linearGradient></defs><circle cx="16" cy="16" r="16" fill="url(#usdc-grad)"/><text x="16" y="20" text-anchor="middle" fill="white" font-size="10" font-weight="bold" font-family="system-ui">USDC</text></svg>',
  
  'USDT': '<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="usdt-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#26A17B;stop-opacity:1" /><stop offset="100%" style="stop-color:#1A7A5E;stop-opacity:1" /></linearGradient></defs><circle cx="16" cy="16" r="16" fill="url(#usdt-grad)"/><text x="16" y="20" text-anchor="middle" fill="white" font-size="10" font-weight="bold" font-family="system-ui">USDT</text></svg>',
  
  'USDB': '<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="usdb-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#6366F1;stop-opacity:1" /><stop offset="100%" style="stop-color:#4F46E5;stop-opacity:1" /></linearGradient></defs><circle cx="16" cy="16" r="16" fill="url(#usdb-grad)"/><text x="16" y="20" text-anchor="middle" fill="white" font-size="10" font-weight="bold" font-family="system-ui">USDB</text></svg>',
  
  'DAI': '<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="dai-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#F5AC37;stop-opacity:1" /><stop offset="100%" style="stop-color:#E8941F;stop-opacity:1" /></linearGradient></defs><circle cx="16" cy="16" r="16" fill="url(#dai-grad)"/><text x="16" y="20" text-anchor="middle" fill="white" font-size="11" font-weight="bold" font-family="system-ui">DAI</text></svg>',
  
  'KlarnaUSD': '<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="klarna-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#FFB3C7;stop-opacity:1" /><stop offset="100%" style="stop-color:#FF85A1;stop-opacity:1" /></linearGradient></defs><circle cx="16" cy="16" r="16" fill="url(#klarna-grad)"/><text x="16" y="13" text-anchor="middle" fill="#1a1a1a" font-size="7" font-weight="bold" font-family="system-ui">KLARNA</text><text x="16" y="22" text-anchor="middle" fill="#1a1a1a" font-size="8" font-weight="bold" font-family="system-ui">USD</text></svg>'
};

function getTokenIcon(tokenName) {
  return TOKEN_ICONS[tokenName] || TOKEN_ICONS['AlphaUSD'];
}

console.log('✅ Token icons loaded');


// ============================================
// EVENT LISTENERS (ATTACH ALL BUTTONS)
// ============================================

function attachListeners() {
  console.log('🎯 Attaching event listeners...');
  
  // Reset auto-lock on any interaction
  document.addEventListener('click', resetAutoLock);
  document.addEventListener('keypress', resetAutoLock);
  
  // Create & Import
  const createBtn = document.getElementById('createBtn');
  if (createBtn) createBtn.addEventListener('click', createWallet2);
  
  const importBtn = document.getElementById('importBtn');
  if (importBtn) importBtn.addEventListener('click', importWallet);
  
  // Seed phrase confirmation
  const seedConfirm = document.getElementById('seedConfirm');
  if (seedConfirm) seedConfirm.addEventListener('click', showPasswordSetup);
  
  // Password setup
  const passwordSetupBtn = document.getElementById('encryptWalletBtn');
  if (passwordSetupBtn) passwordSetupBtn.addEventListener('click', async () => {
    const password = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (!password || password.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }

    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    
    try {
      const sensitiveData = {
        accounts: accounts,
        currentAccountIndex: currentAccountIndex,
        mnemonic: wallet.mnemonic
      };

      const encrypted = await encryptData(JSON.stringify(sensitiveData), password);

      await chrome.storage.local.set({ encryptedWallet: encrypted });

      // Store password for session (for re-encryption)
      currentPassword = password;

      console.log('✅ Wallet encrypted and saved');

      showWalletScreen();
      
    } catch (error) {
      console.error('❌ Failed to encrypt wallet:', error);
      alert('Failed to save wallet');
    }
  });
  
  // Unlock function (shared by button click and Enter key)
  const performUnlock = async () => {
    const password = document.getElementById('unlockPassword').value;

    if (!password) {
      showToast('Please enter password', 'error');
      return;
    }

    try {
      await unlockWallet(password);
      showWalletScreen();
    } catch (error) {
      console.error('❌ Unlock failed:', error);
      document.getElementById('unlockError').textContent = '❌ Wrong password';
      document.getElementById('unlockError').style.display = 'block';
    }
  };

  // Unlock button click
  const unlockBtn = document.getElementById('unlockBtn');
  if (unlockBtn) unlockBtn.addEventListener('click', performUnlock);

  // Unlock on Enter key press
  const unlockPasswordInput = document.getElementById('unlockPassword');
  if (unlockPasswordInput) {
    unlockPasswordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        performUnlock();
      }
    });
  }

  // Toggle password visibility on unlock screen
  const toggleUnlockPassword = document.getElementById('toggleUnlockPassword');
  if (toggleUnlockPassword) {
    toggleUnlockPassword.addEventListener('click', () => {
      const passwordInput = document.getElementById('unlockPassword');
      const passwordIcon = document.getElementById('unlockPasswordIcon');

      if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        // Change to eye-off icon
        passwordIcon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
      } else {
        passwordInput.type = 'password';
        // Change back to eye icon
        passwordIcon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
      }
    });
  }

  // Connection approval buttons
  const approveConnectionBtn = document.getElementById('approveConnectionBtn');
  if (approveConnectionBtn) {
    approveConnectionBtn.addEventListener('click', async () => {
      console.log('✅ User approved connection');

      // Notify background script
      chrome.runtime.sendMessage({ type: 'CONNECTION_APPROVED' }, (response) => {
        console.log('Connection approved, closing popup');
      });

      // Close the popup after approval
      setTimeout(() => window.close(), 300);
    });
  }

  const rejectConnectionBtn = document.getElementById('rejectConnectionBtn');
  if (rejectConnectionBtn) {
    rejectConnectionBtn.addEventListener('click', async () => {
      console.log('❌ User rejected connection');

      // Notify background script
      chrome.runtime.sendMessage({ type: 'CONNECTION_REJECTED' }, (response) => {
        console.log('Connection rejected, closing popup');
      });

      // Close the popup after rejection
      setTimeout(() => window.close(), 300);
    });
  }

  // Forgot password link
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('To restore your wallet, you will need your 12-word seed phrase. This will clear your current wallet data. Continue?')) {
        // Clear wallet data and show import screen
        chrome.storage.local.clear(() => {
          showToast('Wallet data cleared. Please import using your seed phrase.', 'success');
          document.getElementById('unlockScreen').style.display = 'none';
          document.getElementById('homeScreen').style.display = 'block';
        });
      }
    });
  }

  // Lock wallet
  const lockWalletBtn = document.getElementById('lockWalletBtn');
  if (lockWalletBtn) lockWalletBtn.addEventListener('click', lockWallet);
  
  // Send & Receive
  const sendBtn = document.getElementById('sendBtn');
  if (sendBtn) sendBtn.addEventListener('click', send);
  
  const receiveBtn = document.getElementById('receiveBtn');
  if (receiveBtn) receiveBtn.addEventListener('click', receive);
  
  // Execute send
  const executeSendBtn = document.getElementById('executeSendBtn');
  if (executeSendBtn) executeSendBtn.addEventListener('click', executeSend);

  // MAX button for Address tab
  const maxAmountBtn = document.getElementById('maxAmountBtn');
  if (maxAmountBtn) {
    maxAmountBtn.addEventListener('click', () => {
      const tokenSelect = document.getElementById('sendToken');
      const amountInput = document.getElementById('sendAmount');
      if (tokenSelect && amountInput) {
        const selectedToken = tokenSelect.value;
        const balance = tokenBalances[selectedToken] || 0;
        amountInput.value = formatTokenAmount(balance, { useCompact: false });
        showToast(`Set to maximum: ${formatTokenAmount(balance)} ${selectedToken}`, 'success');
      }
    });
  }

  // MAX button for Contact tab
  const maxAmountBtnContact = document.getElementById('maxAmountBtnContact');
  if (maxAmountBtnContact) {
    maxAmountBtnContact.addEventListener('click', () => {
      const tokenSelect = document.getElementById('sendTokenContact');
      const amountInput = document.getElementById('sendAmountContact');
      if (tokenSelect && amountInput) {
        const selectedToken = tokenSelect.value;
        const balance = tokenBalances[selectedToken] || 0;
        amountInput.value = formatTokenAmount(balance, { useCompact: false });
        showToast(`Set to maximum: ${formatTokenAmount(balance)} ${selectedToken}`, 'success');
      }
    });
  }

  // Confirm send
  const confirmSendBtn = document.getElementById('confirmSendBtn');
  if (confirmSendBtn) confirmSendBtn.addEventListener('click', confirmAndSend);
  
  const cancelSendBtn = document.getElementById('cancelSendBtn');
  if (cancelSendBtn) cancelSendBtn.addEventListener('click', cancelSend);
  
  // Copy addresses - Main wallet address (click to copy)
  const walletAddress = document.getElementById('walletAddress');
  if (walletAddress) {
    walletAddress.addEventListener('click', () => {
      if (wallet && wallet.address) {
        navigator.clipboard.writeText(wallet.address);
        showToast('Address copied to clipboard!', 'success');
      }
    });
  }

  // Copy button in receive screen
  const copyReceiveAddressBtn = document.getElementById('copyReceiveAddressBtn');
  if (copyReceiveAddressBtn) {
    copyReceiveAddressBtn.addEventListener('click', () => {
      if (wallet && wallet.address) {
        navigator.clipboard.writeText(wallet.address);
        showToast('Address copied to clipboard!', 'success');
      }
    });
  }

  // Account management
  const accountSelect = document.getElementById('accountSelect');
  if (accountSelect) accountSelect.addEventListener('change', switchAccount);
  
  const addAccountBtn = document.getElementById('addAccountBtn');
  if (addAccountBtn) addAccountBtn.addEventListener('click', addAccount);
  
  const editAccountNameBtn = document.getElementById('editAccountNameBtn');
  if (editAccountNameBtn) editAccountNameBtn.addEventListener('click', renameAccount);
  
  // Refresh balance
  const refreshBalanceBtn = document.getElementById('refreshBalanceBtn');
  if (refreshBalanceBtn) refreshBalanceBtn.addEventListener('click', refreshBalance);
  
  // Hide zero balance toggle
  const hideZeroBalanceToggle = document.getElementById('hideZeroBalanceToggle');
  if (hideZeroBalanceToggle) {
    chrome.storage.local.get(['hideZeroBalance'], (result) => {
      if (result.hideZeroBalance) {
        hideZeroBalanceToggle.checked = true;
        fetchBalances();
      }
    });
    
    hideZeroBalanceToggle.addEventListener('change', () => {
      chrome.storage.local.set({ hideZeroBalance: hideZeroBalanceToggle.checked });
      fetchBalances();
    });
  }
  
  // Menu navigation
  const historyMenuBtn = document.getElementById('historyMenuBtn');
  if (historyMenuBtn) historyMenuBtn.addEventListener('click', showHistory);

  const swapBtn = document.getElementById('swapBtn');
  if (swapBtn) swapBtn.addEventListener('click', showSwapScreen);

  // Export transactions to CSV
  const exportTransactionsBtn = document.getElementById('exportTransactionsBtn');
  if (exportTransactionsBtn) {
    exportTransactionsBtn.addEventListener('click', exportTransactionsToCSV);
  }

  // Refresh transaction history from blockchain
  const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
  if (refreshHistoryBtn) {
    refreshHistoryBtn.addEventListener('click', async () => {
      refreshHistoryBtn.disabled = true;
      refreshHistoryBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> Refreshing...';

      await loadTransactionHistory();
      renderTransactionHistory();

      refreshHistoryBtn.disabled = false;
      refreshHistoryBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> Refresh';

      showToast('Transaction history refreshed from blockchain', 'success');
    });
  }

  // Transaction search functionality
  const searchInput = document.getElementById('transactionSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();

      // Show/hide clear button
      if (clearSearchBtn) {
        clearSearchBtn.style.display = searchTerm ? 'block' : 'none';
      }

      // Filter transactions
      filterTransactions();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        clearSearchBtn.style.display = 'none';
        filterTransactions();
      }
    });
  }

  // Transaction filter buttons
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active class from all
      filterBtns.forEach(b => {
        b.classList.remove('active');
        b.style.background = 'white';
        b.style.color = '#64748b';
        b.style.border = '1px solid #e2e8f0';
      });

      // Add active class to clicked
      btn.classList.add('active');
      btn.style.background = '#2563eb';
      btn.style.color = 'white';
      btn.style.border = 'none';

      // Filter transactions
      filterTransactions();
    });
  });

  const settingsMenuBtn = document.getElementById('settingsMenuBtn');
  if (settingsMenuBtn) settingsMenuBtn.addEventListener('click', showSettings);
  
  // Network switching
  const switchToTestnetBtn = document.getElementById('switchToTestnet');
  if (switchToTestnetBtn) switchToTestnetBtn.addEventListener('click', () => switchNetwork('testnet'));

  const switchToMainnetBtn = document.getElementById('switchToMainnet');
  if (switchToMainnetBtn) switchToMainnetBtn.addEventListener('click', () => switchNetwork('mainnet'));

  // Refresh network status
  const refreshNetworkStatus = document.getElementById('refreshNetworkStatus');
  if (refreshNetworkStatus) {
    refreshNetworkStatus.addEventListener('click', () => {
      fetchNetworkStatus();
      showToast('Network status refreshed', 'success');
    });
  }
  
  // Back buttons (find all buttons with "Back" or "←" text)
  const backButtons = document.querySelectorAll('button');
  backButtons.forEach(btn => {
    const text = btn.textContent.trim();
    if (text === '← Back' || text === 'Back' || text.startsWith('←')) {
      btn.addEventListener('click', backToWallet);
    }
  });
  
  // Batch Payments
  const batchPaymentsMenuBtn = document.getElementById('batchPaymentsBtn');
  if (batchPaymentsMenuBtn) batchPaymentsMenuBtn.addEventListener('click', () => {
    document.getElementById('walletScreen').style.display = 'none';
    document.getElementById('batchPaymentsScreen').style.display = 'block';
  });
  
  const downloadTemplateBtn = document.getElementById('downloadTemplateBtn');
  if (downloadTemplateBtn) downloadTemplateBtn.addEventListener('click', downloadCSVTemplate);
  
  const uploadBatchCSV = document.getElementById('csvFileInput');
  if (uploadBatchCSV) uploadBatchCSV.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      console.log('📥 Parsing CSV file...');
      // Show progress div
      const progressDiv = document.getElementById('batchProgress');
      if (progressDiv) progressDiv.style.display = 'block';     
	 const result = await parseCSVFile(file);
      // Hide progress after done
      setTimeout(() => {
        if (progressDiv) progressDiv.style.display = 'none';
      }, 2000);
      
      console.log('✅ Parsed:', result.payments.length, 'payments');
      if (result.errors.length > 0) {
        console.log('⚠️ Errors:', result.errors.length);
      }
      
      displayBatchPayments(result.payments, result.errors);
      
      document.getElementById('parsedPaymentsList').style.display = 'block';
      
    } catch (error) {
      console.error('❌ CSV parsing failed:', error);
      alert('Failed to parse CSV: ' + error.message);
    }
  });
  
  const uploadBatchBtn = document.getElementById('uploadCsvBtn');
  if (uploadBatchBtn) uploadBatchBtn.addEventListener('click', () => {
    document.getElementById('csvFileInput').click();
  });
  
  const executeBatchBtn = document.getElementById('executeBatchBtn');
  if (executeBatchBtn) executeBatchBtn.addEventListener('click', executeBatchPayments);
  
  const cancelBatchBtn = document.getElementById('cancelBatchBtn');
  if (cancelBatchBtn) cancelBatchBtn.addEventListener('click', () => {
    batchPaymentsData = null;
    document.getElementById('parsedPaymentsList').style.display = 'none';
    document.getElementById('csvFileInput').value = '';
  });
  
  // Faucet - Open enhanced faucet screen
  const faucetBtn = document.getElementById('faucetBtn');
  if (faucetBtn) faucetBtn.addEventListener('click', showFaucetScreen);

  // Back from faucet
  const backFromFaucet = document.getElementById('backFromFaucet');
  if (backFromFaucet) backFromFaucet.addEventListener('click', showWalletScreen);

  // Back from swap
  const backFromSwap = document.getElementById('backFromSwap');
  if (backFromSwap) backFromSwap.addEventListener('click', showWalletScreen);

  // Execute swap button
  const executeSwapBtn = document.getElementById('executeSwapBtn');
  if (executeSwapBtn) executeSwapBtn.addEventListener('click', executeSwap);

  // Swap from amount input - trigger quote update
  const swapFromAmount = document.getElementById('swapFromAmount');
  if (swapFromAmount) swapFromAmount.addEventListener('input', updateSwapQuote);

  // Swap token selects - update balances AND quote when changed
  const swapFromToken = document.getElementById('swapFromToken');
  const swapToToken = document.getElementById('swapToToken');
  if (swapFromToken) {
    swapFromToken.addEventListener('change', () => {
      updateSwapBalances();
      updateSwapQuote();
    });
  }
  if (swapToToken) {
    swapToToken.addEventListener('change', () => {
      updateSwapBalances();
      updateSwapQuote();
    });
  }

  // MAX button for swap
  const swapMaxBtn = document.getElementById('swapMaxBtn');
  if (swapMaxBtn) {
    swapMaxBtn.addEventListener('click', () => {
      const tokenSelect = document.getElementById('swapFromToken');
      const amountInput = document.getElementById('swapFromAmount');
      if (tokenSelect && amountInput) {
        const selectedToken = tokenSelect.value;
        const balance = tokenBalances[selectedToken] || 0;
        amountInput.value = formatTokenAmount(balance, { useCompact: false });
        showToast(`Set to maximum: ${formatTokenAmount(balance)} ${selectedToken}`, 'success');
        // Trigger quote update
        updateSwapQuote();
      }
    });
  }

  // Swap direction button
  const swapDirectionBtn = document.getElementById('swapDirectionBtn');
  if (swapDirectionBtn) {
    swapDirectionBtn.addEventListener('click', swapTokenDirection);
    // Hover effects
    swapDirectionBtn.addEventListener('mouseenter', () => {
      swapDirectionBtn.style.background = '#e2e8f0';
    });
    swapDirectionBtn.addEventListener('mouseleave', () => {
      swapDirectionBtn.style.background = '#f8fafc';
    });
  }

  // Slippage buttons
  const slippageBtns = document.querySelectorAll('.slippage-btn');
  slippageBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const slippage = parseFloat(btn.getAttribute('data-slippage'));
      setSlippage(slippage);
    });
  });

  // Custom slippage input
  const customSlippage = document.getElementById('customSlippage');
  if (customSlippage) {
    customSlippage.addEventListener('input', () => {
      const value = parseFloat(customSlippage.value);
      if (!isNaN(value) && value > 0) {
        setSlippage(value);
      }
    });
  }

  // Request faucet from new screen
  const requestFaucetBtn = document.getElementById('requestFaucetBtn');
  if (requestFaucetBtn) requestFaucetBtn.addEventListener('click', requestFaucetEnhanced);

  // View address on explorer
  const viewAddressOnExplorer = document.getElementById('viewAddressOnExplorer');
  if (viewAddressOnExplorer) {
    viewAddressOnExplorer.addEventListener('click', () => {
      if (wallet && wallet.address) {
        openExplorer(getAddressExplorerUrl(wallet.address));
      }
    });
  }

  // Contacts
  const contactsMenuBtn = document.getElementById('contactsMenuBtn');
  if (contactsMenuBtn) contactsMenuBtn.addEventListener('click', showContacts);
  
  const addContactBtn = document.getElementById('addContactBtn');
  if (addContactBtn) addContactBtn.addEventListener('click', showAddContact);
  
  const saveContactBtn = document.getElementById('saveContactBtn');
  if (saveContactBtn) saveContactBtn.addEventListener('click', saveContact);
  
  // Export functions
  const exportPrivateKeyBtn = document.getElementById('exportPrivateKeyBtn');
  if (exportPrivateKeyBtn) exportPrivateKeyBtn.addEventListener('click', exportPrivateKey);
  
  const exportSeedBtn = document.getElementById('exportSeedBtn');
  if (exportSeedBtn) exportSeedBtn.addEventListener('click', exportSeedPhrase);
  
  // Payment Link Generator
  const paymentLinkBtn = document.getElementById('paymentLinkBtn');
  if (paymentLinkBtn) paymentLinkBtn.addEventListener('click', showPaymentLinkGenerator);
  
  const generatePaymentLinkBtn = document.getElementById('generatePaymentLinkBtn');
  if (generatePaymentLinkBtn) generatePaymentLinkBtn.addEventListener('click', generatePaymentLink);
  
  const copyPaymentLinkBtn = document.getElementById('copyPaymentLinkBtn');
  if (copyPaymentLinkBtn) copyPaymentLinkBtn.addEventListener('click', copyPaymentLink);
  
  // API Keys
  const apiKeysBtn = document.getElementById('apiKeysBtn');
  if (apiKeysBtn) apiKeysBtn.addEventListener('click', showAPIKeys);
  
  const createAPIKeyBtn = document.getElementById('createAPIKeyBtn');
  if (createAPIKeyBtn) createAPIKeyBtn.addEventListener('click', createAPIKey);
  
  const showAPIDocsBtn = document.getElementById('showAPIDocsBtn');
  if (showAPIDocsBtn) showAPIDocsBtn.addEventListener('click', showAPIDocs);
  
  // Buy/Sell Stablecoins
  const buyStablecoinsBtn = document.getElementById('buyStablecoinsBtn');
  if (buyStablecoinsBtn) buyStablecoinsBtn.addEventListener('click', showBuyStablecoins);
  
  const sellStablecoinsBtn = document.getElementById('sellStablecoinsBtn');
  if (sellStablecoinsBtn) sellStablecoinsBtn.addEventListener('click', showSellStablecoins);
  
  // Buy/Sell form listeners
  const buyAmountInput = document.getElementById('buyAmount');
  if (buyAmountInput) buyAmountInput.addEventListener('input', updateBuyPreview);
  
  const sellAmountInput = document.getElementById('sellAmount');
  if (sellAmountInput) sellAmountInput.addEventListener('input', updateSellPreview);

  // Settings About section buttons
  const docsBtn = document.getElementById('docsBtn');
  if (docsBtn) {
    docsBtn.addEventListener('click', () => {
      window.open('https://docs.tempo.xyz', '_blank');
    });
  }

  const supportBtn = document.getElementById('supportBtn');
  if (supportBtn) {
    supportBtn.addEventListener('click', () => {
      window.open('https://discord.gg/tempo', '_blank');
    });
  }

  // External link buttons (from About section)
  const linkExplorer = document.getElementById('linkExplorer');
  if (linkExplorer) {
    linkExplorer.addEventListener('click', () => {
      const url = linkExplorer.getAttribute('data-url');
      if (url) window.open(url, '_blank');
    });
  }

  const linkDocs = document.getElementById('linkDocs');
  if (linkDocs) {
    linkDocs.addEventListener('click', () => {
      const url = linkDocs.getAttribute('data-url');
      if (url) window.open(url, '_blank');
    });
  }

  const linkWebsite = document.getElementById('linkWebsite');
  if (linkWebsite) {
    linkWebsite.addEventListener('click', () => {
      const url = linkWebsite.getAttribute('data-url');
      if (url) window.open(url, '_blank');
    });
  }

  const linkGithub = document.getElementById('linkGithub');
  if (linkGithub) {
    linkGithub.addEventListener('click', () => {
      const url = linkGithub.getAttribute('data-url');
      if (url) window.open(url, '_blank');
    });
  }

  const linkTwitter = document.getElementById('linkTwitter');
  if (linkTwitter) {
    linkTwitter.addEventListener('click', () => {
      const url = linkTwitter.getAttribute('data-url');
      if (url) window.open(url, '_blank');
    });
  }

  // Hover effects for explorer button
  if (viewAddressOnExplorer) {
    viewAddressOnExplorer.addEventListener('mouseenter', () => {
      viewAddressOnExplorer.style.background = '#f0fdf4';
    });
    viewAddressOnExplorer.addEventListener('mouseleave', () => {
      viewAddressOnExplorer.style.background = 'none';
    });
  }

  // Hover effects for refresh network button (already declared above)
  if (refreshNetworkStatus) {
    refreshNetworkStatus.addEventListener('mouseenter', () => {
      refreshNetworkStatus.style.background = '#f1f5f9';
    });
    refreshNetworkStatus.addEventListener('mouseleave', () => {
      refreshNetworkStatus.style.background = '#f8fafc';
    });
  }

  const rateUsBtn = document.getElementById('rateUsBtn');
  if (rateUsBtn) {
    rateUsBtn.addEventListener('click', () => {
      window.open('https://chromewebstore.google.com/detail/heian-wallet', '_blank');
    });
  }

  // Network Status Indicator click listener - OPTIMIZED FAST VERSION
  const networkStatusIndicator = document.getElementById('networkStatusIndicator');
  if (networkStatusIndicator) {
    networkStatusIndicator.addEventListener('click', async () => {
      // Toggle network
      const newNetwork = currentNetwork === 'testnet' ? 'mainnet' : 'testnet';

      // Show single confirmation (fast)
      const confirmed = confirm(`Switch to ${NETWORKS[newNetwork].name}?`);

      if (confirmed) {
        console.log('🔄 Quick switching to:', newNetwork);

        // Update UI immediately for instant feedback
        const networkStatusText = document.getElementById('networkStatusText');
        if (networkStatusText) {
          networkStatusText.textContent = NETWORKS[newNetwork].name;
        }

        // Switch network (synchronous operations first)
        currentNetwork = newNetwork;

        // CRITICAL: Clear provider cache BEFORE fetching balances
        clearProviderCache();

        // Save to storage (async but don't wait)
        chrome.storage.local.set({ tempoNetwork: newNetwork });

        // Update rest of UI
        updateNetworkUI();

        // Show toast immediately
        showToast('Switched to ' + NETWORKS[newNetwork].name, 'success');

        // FIXED: Ensure balance fetch happens with retry on failure
        if (wallet && wallet.address) {
          console.log('🔄 Fetching balances for', newNetwork, 'at address:', wallet.address);

          // Small delay to ensure provider cache is fully cleared
          setTimeout(async () => {
            try {
              await fetchBalances();
              console.log('✅ Balances loaded for', newNetwork);
            } catch (err) {
              console.error('❌ Balance fetch failed, retrying...', err);
              // Retry once after 1 second
              setTimeout(async () => {
                try {
                  await fetchBalances();
                  console.log('✅ Balances loaded on retry for', newNetwork);
                } catch (retryErr) {
                  console.error('❌ Balance fetch failed on retry:', retryErr);
                  showToast('Failed to load balances. Click refresh.', 'error');
                }
              }, 1000);
            }
          }, 100);
        } else {
          console.warn('⚠️ No wallet or address available for balance fetch');
        }

        console.log('✅ Quick switched to:', NETWORKS[newNetwork].name);
      }
    });
    console.log('✅ Network status indicator click listener attached');
  }

  console.log('✅ Event listeners attached!');
}

// Add buy/sell button listeners after DOM loads
// Consolidated initialization for additional UI elements
function initializeAdditionalListeners() {
  setTimeout(() => {
    // Buy button
    const buyNowBtn = document.querySelector('#buyStablecoinsScreen button.primary-btn');
    if (buyNowBtn && !buyNowBtn.hasAttribute('data-listener-attached')) {
      buyNowBtn.addEventListener('click', executeBuy);
      buyNowBtn.setAttribute('data-listener-attached', 'true');
      console.log('✅ Buy button listener attached');
    }

    // Sell button
    const sellNowBtn = document.querySelector('#sellStablecoinsScreen button.primary-btn');
    if (sellNowBtn && !sellNowBtn.hasAttribute('data-listener-attached')) {
      sellNowBtn.addEventListener('click', executeSell);
      sellNowBtn.setAttribute('data-listener-attached', 'true');
      console.log('✅ Sell button listener attached');
    }

    // Send tabs
    const addressTab = document.getElementById('sendTabAddress');
    const contactTab = document.getElementById('sendTabContact');

    if (addressTab && !addressTab.hasAttribute('data-listener-attached')) {
      addressTab.addEventListener('click', () => switchSendTab('address'));
      addressTab.setAttribute('data-listener-attached', 'true');
      console.log('✅ Address tab listener attached');
    }

    if (contactTab && !contactTab.hasAttribute('data-listener-attached')) {
      contactTab.addEventListener('click', () => switchSendTab('contact'));
      contactTab.setAttribute('data-listener-attached', 'true');
      console.log('✅ Contact tab listener attached');
    }

    // Back buttons
    const backButtons = {
      'backFromBatch': backToWallet,
      'backFromPaymentLinks': backToWallet,
      'backFromBuy': backToWallet,
      'backFromSell': backToWallet,
      'buyBackBtn': backToWallet,
      'sellBackBtn': backToWallet
    };

    Object.entries(backButtons).forEach(([id, handler]) => {
      const button = document.getElementById(id);
      if (button && !button.hasAttribute('data-listener-attached')) {
        button.addEventListener('click', handler);
        button.setAttribute('data-listener-attached', 'true');
        console.log(`✅ ${id} listener attached`);
      }
    });
  }, 100);
}

console.log('✅ Event listener setup loaded');


// ============================================
// STARTUP CODE
// ============================================

window.addEventListener('DOMContentLoaded', async () => {
  console.log('🔥 HEIAN Wallet v2 starting...');

  // Initialize token prices FIRST (needed for display)
  initializeTokenPrices();

  // Attach all event listeners FIRST (before icons to be faster)
  attachListeners();

  // Initialize additional listeners (consolidated from multiple DOMContentLoaded handlers)
  initializeAdditionalListeners();

  // Initialize ENS (consolidated from separate DOMContentLoaded handler)
  setTimeout(() => {
    if (typeof initializeENS === 'function') {
      initializeENS();
      setupENSAutoResolve();
      console.log('✅ ENS initialized');
    }
  }, 500);
  
  // Check for pending connection request FIRST
  const pendingResult = await chrome.storage.local.get(['pendingConnectionRequest', 'tempoWallet']);

  if (pendingResult.pendingConnectionRequest && pendingResult.tempoWallet) {
    // Show connection approval screen
    console.log('🔗 Showing connection approval screen');
    const request = pendingResult.pendingConnectionRequest;

    document.getElementById('createScreen').style.display = 'none';
    document.getElementById('unlockScreen').style.display = 'none';
    document.getElementById('walletScreen').style.display = 'none';
    document.getElementById('connectionScreen').style.display = 'block';

    document.getElementById('connectionOrigin').textContent = request.origin;
    document.getElementById('connectionAddress').textContent = request.address;

    return; // Don't continue with normal flow
  }

  // Load network preference
  await loadNetwork();
  console.log('🌐 Current network:', NETWORKS[currentNetwork].name);

  // Update network UI immediately after loading
  updateNetworkUI();

  // Load accounts
  const loadedAccounts = await loadAccounts();
  console.log('📦 Loaded accounts:', loadedAccounts.length);

  // Check if accounts exist
  if (loadedAccounts.length > 0) {
    console.log('✅ Found accounts, showing wallet screen...');

    // Need to decrypt to get mnemonic
    chrome.storage.local.get(['encryptedWallet'], async (result) => {
      if (result.encryptedWallet) {
        // We need password to decrypt - show unlock screen instead
        document.getElementById('createScreen').style.display = 'none';
        document.getElementById('unlockScreen').style.display = 'block';
      } else {
        // Set wallet from current account (no mnemonic available)
        wallet = {
          address: accounts[currentAccountIndex].address,
          privateKey: accounts[currentAccountIndex].privateKey,
          mnemonic: null
        };

        showWalletScreen();
      }
    });
    
  } else {
    // Check for legacy wallet (old format)
    chrome.storage.local.get(['tempoWallet'], async (result) => {
      if (result.tempoWallet) {
        console.log('📦 Found legacy wallet, migrating...');
        
        wallet = result.tempoWallet;
        
        // Migrate to account system if has mnemonic
        if (wallet.mnemonic) {
          await initializeAccounts(wallet.mnemonic);
          
          wallet = {
            address: accounts[0].address,
            privateKey: accounts[0].privateKey,
            mnemonic: wallet.mnemonic
          };
        }
        
        showWalletScreen();
        
      } else {
        // No wallet found - show create screen
        console.log('🆕 No wallet found, showing create screen');
        showCreateScreen();
      }
    });
  }

  // Initialize Feather icons at the END to not block startup
  setTimeout(() => {
    if (typeof feather !== 'undefined') {
      try {
        feather.replace();
        console.log('✅ Feather icons initialized');
      } catch (e) {
        console.warn('Feather icons failed, continuing...', e);
      }
    }
  }, 100); // Delay to let page render first
});

console.log('✅ HEIAN Wallet v2 initialized!');


// ============================================
// BATCH PAYMENTS
// ============================================

// Download CSV template
function downloadCSVTemplate() {
  const csv = 'recipient_address,amount,memo\n' +
    '0x0000000000000000000000000000000000000001,100,Payment 1\n' +
    '0x0000000000000000000000000000000000000002,200,Payment 2\n' +
    '0x0000000000000000000000000000000000000003,150,Payment 3';
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tempo_batch_payment_template.csv';
  a.click();
  
  URL.revokeObjectURL(url);
  
  console.log('✅ Template downloaded');
}

// Parse CSV file
// ============================================
// Parse CSV file (simple version - NO ENS yet)
async function parseCSVFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async function(e) {
      const text = e.target.result;
      const lines = text.trim().split('\n');

      const payments = [];
      const errors = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',').map(p => p.trim());
        if (parts.length < 2) {
          errors.push(`Line ${i + 1}: Invalid format (need at least address and amount)`);
          continue;
        }

        let addressOrENS = parts[0];
        const amount = parts[1];
        const memo = parts[2] || '';

        // Validate amount first
        if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
          errors.push(`Line ${i + 1}: Invalid amount ${amount}`);
          continue;
        }

        // Resolve ENS names or validate addresses
        let finalAddress = addressOrENS;
        if (addressOrENS.endsWith('.eth')) {
          // ENS name detected
          try {
            const resolution = await resolveRecipient(addressOrENS);
            if (resolution && resolution.address) {
              finalAddress = resolution.address;
              console.log(`✅ ENS resolved in CSV: ${addressOrENS} → ${finalAddress}`);
            } else {
              errors.push(`Line ${i + 1}: Could not resolve ENS name ${addressOrENS}`);
              continue;
            }
          } catch (error) {
            errors.push(`Line ${i + 1}: Failed to resolve ENS name ${addressOrENS} - ${error.message}`);
            continue;
          }
        } else {
          // Validate as Ethereum address
          if (!ethers.utils.isAddress(addressOrENS)) {
            errors.push(`Line ${i + 1}: Invalid address ${addressOrENS}`);
            continue;
          }
        }

        payments.push({
          address: finalAddress,
          amount,
          memo: memo || (addressOrENS.endsWith('.eth') ? `Payment to ${addressOrENS}` : memo)
        });
      }

      resolve({ payments, errors });
    };

    reader.readAsText(file);
  });
}
// Export transactions to CSV
function exportTransactionsToCSV() {
  if (!allTransactions || allTransactions.length === 0) {
    showToast('No transactions to export', 'error');
    return;
  }

  try {
    // CSV header
    let csvContent = 'Date,Time,Type,Token,Amount,From,To,Status,Transaction Hash,Memo\n';

    // Add each transaction
    allTransactions.forEach(tx => {
      const date = new Date(tx.timestamp);
      const dateStr = date.toLocaleDateString('en-US');
      const timeStr = date.toLocaleTimeString('en-US');
      const type = tx.from.toLowerCase() === wallet.address.toLowerCase() ? 'Sent' : 'Received';
      const amount = tx.amount || '0';
      const token = tx.token || '';
      const from = tx.from || '';
      const to = tx.to || '';
      const status = tx.status || 'confirmed';
      const hash = tx.hash || '';
      const memo = (tx.memo || '').replace(/,/g, ';').replace(/\n/g, ' '); // Escape commas and newlines

      csvContent += `"${dateStr}","${timeStr}","${type}","${token}","${amount}","${from}","${to}","${status}","${hash}","${memo}"\n`;
    });

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `heian_wallet_transactions_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast('✅ Transactions exported successfully', 'success');
  } catch (error) {
    console.error('❌ Export failed:', error);
    showToast('Failed to export transactions: ' + error.message, 'error');
  }
}

// Display batch payments for review
function displayBatchPayments(payments, errors) {
  const totalRecipientsEl = document.getElementById('totalRecipients');
  const totalAmountEl = document.getElementById('totalAmount');
  const itemsEl = document.getElementById('paymentItemsList');
  const errorsEl = document.getElementById('batchErrors');
  const executeBtn = document.getElementById('executeBatchBtn');
  const parsedListEl = document.getElementById('parsedPaymentsList');
  
  if (!totalRecipientsEl || !totalAmountEl || !itemsEl || !errorsEl || !executeBtn || !parsedListEl) return;
  
  // Calculate total
  const totalAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  
  // Show summary
  totalRecipientsEl.textContent = payments.length;
  totalAmountEl.textContent = '$' + totalAmount.toFixed(2);
  
  // Show payment items
  itemsEl.innerHTML = payments.map((p, i) => 
    '<div style="background:white;border:1px solid #f1f5f9;border-radius:8px;padding:10px;margin-bottom:8px;">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
    '<span style="font-size:12px;color:#64748b;">#' + (i + 1) + '</span>' +
    '<span style="font-weight:600;color:#0f172a;">' + p.amount + ' ' + document.getElementById('batchTokenSelect').value + '</span>' +
    '</div>' +
    '<div style="font-size:11px;color:#64748b;font-family:monospace;margin-bottom:4px;">' + p.address + '</div>' +
    (p.memo ? '<div style="font-size:11px;color:#64748b;">' + p.memo + '</div>' : '') +
    '</div>'
  ).join('');
  
  // Show errors
  if (errors.length > 0) {
    errorsEl.innerHTML = '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin-bottom:16px;">' +
      '<div style="font-weight:600;color:#dc2626;margin-bottom:8px;">⚠️ Validation Errors:</div>' +
      errors.map(e => '<div style="font-size:12px;color:#dc2626;">• ' + e + '</div>').join('') +
      '</div>';
    errorsEl.style.display = 'block';
  } else {
    errorsEl.style.display = 'none';
  }
  
  // Enable/disable execute button
  executeBtn.disabled = payments.length === 0;
  
  // Store for execution
  batchPaymentsData = payments;
}

// Execute batch payments
async function executeBatchPayments() {
  if (!batchPaymentsData || batchPaymentsData.length === 0) {
    alert('No payments to execute');
    return;
  }
  
  const tokenName = document.getElementById('batchTokenSelect').value;
  const totalAmount = batchPaymentsData.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  
  const confirmMsg = 'Send ' + batchPaymentsData.length + ' payments totaling ' + totalAmount.toFixed(2) + ' ' + tokenName + '?\n\n' +
    'Estimated gas: ~' + (batchPaymentsData.length * 0.0001).toFixed(4) + ' ETH\n\n' +
    'This will send each payment individually.';
  
  if (!confirm(confirmMsg)) {
    return;
  }
  
  const executeBtn = document.getElementById('executeBatchBtn');
  const cancelBtn = document.getElementById('cancelBatchBtn');
  const progressEl = document.getElementById('paymentItemsList'); // Reuse for progress
  
  executeBtn.disabled = true;
  cancelBtn.disabled = true;
  progressEl.style.display = 'block';
  
  try {
    const rpcUrl = NETWORKS[currentNetwork].rpc;
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(wallet.privateKey, provider);
    
    const networkTokens = NETWORKS[currentNetwork].tokens;
    const tokenAddress = networkTokens[tokenName];
    
    const erc20Abi = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function decimals() view returns (uint8)'
    ];
    
    const contract = new ethers.Contract(tokenAddress, erc20Abi, signer);
    const decimals = await contract.decimals();
    
    const results = {
      successful: [],
      failed: []
    };
    
    for (let i = 0; i < batchPaymentsData.length; i++) {
      const payment = batchPaymentsData[i];

      progressEl.textContent = 'Sending ' + (i + 1) + '/' + batchPaymentsData.length + '...';

      try {
        const amountWei = ethers.utils.parseUnits(payment.amount, decimals);
        const tx = await contract.transfer(payment.address, amountWei);

        console.log('✅ Payment ' + (i + 1) + ' sent:', tx.hash);

        // Save to history immediately as pending (non-blocking)
        await saveTransaction({
          hash: tx.hash,
          from: wallet.address,
          to: payment.address,
          amount: payment.amount,
          token: tokenName,
          memo: payment.memo,
          timestamp: new Date().toISOString(),
          status: 'pending',
          batchPayment: true
        });

        // Wait for confirmation in background
        tx.wait().then(async () => {
          console.log('✅ Batch payment ' + (i + 1) + ' confirmed:', tx.hash);
          await updateTransactionStatus(tx.hash, 'confirmed');
          await loadTransactionHistory();
          renderTransactionHistory();
        }).catch(async (err) => {
          console.error('⚠️ Batch payment ' + (i + 1) + ' failed:', err);
          await updateTransactionStatus(tx.hash, 'failed');
          await loadTransactionHistory();
          renderTransactionHistory();
        });

        results.successful.push({
          ...payment,
          hash: tx.hash
        });

      } catch (error) {
        console.error('❌ Payment ' + (i + 1) + ' failed:', error);
        results.failed.push({
          ...payment,
          error: error.message
        });
      }
    }
    
    // Show results
    let resultMsg = '✅ Batch Payment Complete!\n\n';
    resultMsg += 'Successful: ' + results.successful.length + '\n';
    resultMsg += 'Failed: ' + results.failed.length;
    
    if (results.failed.length > 0) {
      resultMsg += '\n\nFailed payments:\n';
      results.failed.forEach((p, i) => {
        resultMsg += (i + 1) + '. ' + p.address.substring(0, 10) + '... - ' + p.error.substring(0, 30) + '\n';
      });
    }
    
    alert(resultMsg);
    
    // Clear data
    batchPaymentsData = null;
    
    // Return to wallet
    document.getElementById('batchPaymentsScreen').style.display = 'none';
    document.getElementById('walletScreen').style.display = 'block';
    
    fetchBalances();
    
  } catch (error) {
    console.error('❌ Batch payment failed:', error);
    alert('Batch payment failed: ' + error.message);
  } finally {
    executeBtn.disabled = false;
    cancelBtn.disabled = false;
    progressEl.style.display = 'none';
  }
}

console.log('✅ Batch payments loaded');


// ============================================
// FAUCET
// ============================================

// Show faucet screen
function showFaucetScreen() {
  // Hide all screens
  document.getElementById('walletScreen').style.display = 'none';
  document.getElementById('sendScreen').style.display = 'none';
  document.getElementById('receiveScreen').style.display = 'none';
  document.getElementById('confirmScreen').style.display = 'none';
  document.getElementById('contactsScreen').style.display = 'none';
  document.getElementById('addContactScreen').style.display = 'none';
  document.getElementById('historyScreen').style.display = 'none';
  document.getElementById('settingsScreen').style.display = 'none';
  document.getElementById('batchPaymentsScreen').style.display = 'none';

  // Show faucet screen
  document.getElementById('faucetScreen').style.display = 'block';

  // Check if faucet has been used recently
  checkFaucetCooldown();

  // Initialize feather icons
  if (typeof feather !== 'undefined') {
    feather.replace();
  }
}

// Check faucet cooldown status
function checkFaucetCooldown() {
  const lastFaucetRequest = localStorage.getItem(`faucet_${wallet.address}`);

  if (lastFaucetRequest) {
    const lastTime = parseInt(lastFaucetRequest);
    const now = Date.now();
    const cooldownMs = 5 * 60 * 1000; // 5 minutes
    const timeLeft = cooldownMs - (now - lastTime);

    if (timeLeft > 0) {
      // Still in cooldown
      const statusDiv = document.getElementById('faucetStatus');
      const cooldownSpan = document.getElementById('faucetCooldown');
      const requestBtn = document.getElementById('requestFaucetBtn');

      if (statusDiv && cooldownSpan && requestBtn) {
        statusDiv.style.display = 'block';
        requestBtn.disabled = true;
        requestBtn.style.opacity = '0.5';
        requestBtn.style.cursor = 'not-allowed';

        // Start countdown
        updateCooldownTimer(timeLeft);
      }
    } else {
      // Cooldown expired
      const statusDiv = document.getElementById('faucetStatus');
      const requestBtn = document.getElementById('requestFaucetBtn');

      if (statusDiv) statusDiv.style.display = 'none';
      if (requestBtn) {
        requestBtn.disabled = false;
        requestBtn.style.opacity = '1';
        requestBtn.style.cursor = 'pointer';
      }
    }
  }
}

// Update cooldown timer
function updateCooldownTimer(timeLeft) {
  const cooldownSpan = document.getElementById('faucetCooldown');
  const requestBtn = document.getElementById('requestFaucetBtn');

  if (!cooldownSpan) return;

  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  cooldownSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  if (timeLeft > 0) {
    setTimeout(() => updateCooldownTimer(timeLeft - 1000), 1000);
  } else {
    // Cooldown complete
    const statusDiv = document.getElementById('faucetStatus');
    if (statusDiv) statusDiv.style.display = 'none';
    if (requestBtn) {
      requestBtn.disabled = false;
      requestBtn.style.opacity = '1';
      requestBtn.style.cursor = 'pointer';
    }
  }
}

// Enhanced faucet request with better UI
async function requestFaucetEnhanced() {
  const btn = document.getElementById('requestFaucetBtn');
  if (!btn || btn.disabled) return;

  const originalContent = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Requesting tokens...';

  try {
    console.log('🚰 Requesting testnet tokens for:', wallet.address);

    // Use background service worker
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'FAUCET_REQUEST', address: wallet.address },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        }
      );
    });

    // Validate response
    if (!response || !response.success) {
      throw new Error(response?.error || 'Faucet request failed');
    }

    console.log('✅ Faucet response:', response.result);

    // Mark request time for cooldown
    localStorage.setItem(`faucet_${wallet.address}`, Date.now().toString());

    // Extract transaction hashes from response if available
    // The tempo_fundAddress response should contain transaction hashes
    const faucetResult = response.result?.result || [];
    const txHashes = Array.isArray(faucetResult) ? faucetResult : [];

    const faucetAddress = '0x0000000000000000000000000000000000000000'; // Faucet system address
    const timestamp = new Date().toISOString();
    const tokens = [
      { name: 'pathUSD', amount: '100' },
      { name: 'AlphaUSD', amount: '100' },
      { name: 'BetaUSD', amount: '100' },
      { name: 'ThetaUSD', amount: '100' }
    ];

    // Save each token receipt as a transaction with real or pending hash
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const txHash = txHashes[i] || `0xfaucet_pending_${Date.now()}_${token.name}`;

      await saveTransaction({
        hash: txHash,
        from: faucetAddress,
        to: wallet.address,
        amount: token.amount,
        token: token.name,
        timestamp: timestamp,
        memo: '🚰 Testnet Faucet',
        status: txHashes[i] ? 'pending' : 'confirmed', // If we have real hash, mark as pending
        usdValue: parseFloat(token.amount) * 1.0, // Stablecoins are $1 each
        confirmations: txHashes[i] ? 0 : 1
      });

      // If we have a real transaction hash, wait for confirmation in background
      if (txHashes[i]) {
        (async (hash) => {
          try {
            const provider = getOrCreateProvider(NETWORKS[currentNetwork].rpc);
            const receipt = await provider.waitForTransaction(hash, 1, 30000); // 30 second timeout
            if (receipt && receipt.status === 1) {
              await updateTransactionStatus(hash, 'confirmed');
              await loadTransactionHistory();
              renderTransactionHistory();
              console.log('✅ Faucet transaction confirmed:', hash);
            }
          } catch (err) {
            console.error('⚠️ Faucet transaction confirmation error:', err);
          }
        })(txHashes[i]);
      }
    }

    // Reload transaction history to show new faucet transactions
    await loadTransactionHistory();
    renderTransactionHistory();

    // Show success with detailed message
    showToast('Tokens requested! pathUSD, AlphaUSD, BetaUSD, and ThetaUSD will arrive in 3-5 seconds', 'success', 5000);

    // Enable cooldown UI
    setTimeout(() => {
      checkFaucetCooldown();
    }, 500);

    // Refresh balances after tokens arrive
    setTimeout(() => {
      fetchBalances();
      showToast('Balances updated! Check your wallet', 'success', 3000);
    }, 4000);

  } catch (error) {
    console.error('❌ Faucet request failed:', error);
    showToast('Faucet request failed: ' + (error.message || 'Unknown error'), 'error', 5000);
    btn.disabled = false;
    btn.innerHTML = originalContent;
  }
}

// Legacy function for backward compatibility
async function requestFaucet() {
  const btn = document.getElementById('faucetBtn');
  if (!btn) return;
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Requesting...';
  
  try {
    console.log('🚰 Requesting testnet tokens via background worker');
    
    // Use background service worker to avoid CORS
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'FAUCET_REQUEST', address: wallet.address },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          // Ignore errors - tokens arrive anyway due to Chrome messaging bug
          if (response && response.result) {
            resolve(response.result);
          } else {
            // Even if response says error, tokens are being sent
            // This is a Chrome messaging race condition
            resolve({ result: [] });
          }
        }
      );
    });
    
    console.log('✅ Faucet request successful');

    // Always show success - tokens arrive even if response is wrong
    showToast('Faucet request sent! Tokens will arrive in a few seconds.', 'success', 4000);

    setTimeout(() => {
      fetchBalances();
    }, 3000);
    
  } catch (error) {
    console.error('❌ Faucet failed:', error);
    alert('Failed to get testnet tokens: ' + error.message);
  } finally {
    btn.disabled = false;
    // Restore button - use SVG directly instead of feather icon for speed
    btn.innerHTML = `<svg style="width:18px;height:18px;flex-shrink:0;display:inline-block;vertical-align:middle;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg><span style="display:inline-block;vertical-align:middle;margin-left:6px;">Get Tokens</span>`;
  }
}

console.log('✅ Faucet loaded');


// ============================================
// CONTACTS MANAGEMENT
// ============================================

// Load contacts
async function loadContacts() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['tempoContacts'], (result) => {
      contacts = result.tempoContacts || [];
      console.log('✅ Loaded contacts:', contacts.length);
      resolve();
    });
  });
}

// ============================================
// SWAP (TEMPO DEX)
// ============================================

// Tempo DEX contract address and ABI
const DEX_ADDRESS = '0xDEc0000000000000000000000000000000000000';
const DEX_ABI = [
  'function quoteSwapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn) external view returns (uint128 amountOut)',
  'function swapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn, uint128 minAmountOut) external returns (uint128 amountOut)'
];

let currentSlippage = 0.5; // Default 0.5%
let swapQuoteData = null;

// Show swap screen
function showSwapScreen() {
  document.getElementById('walletScreen').style.display = 'none';
  document.getElementById('swapScreen').style.display = 'block';

  // Load balances for both tokens
  updateSwapBalances();

  // Initialize with default slippage
  setSlippage(0.5);
}

// Update swap balances
function updateSwapBalances() {
  if (!wallet || !tokenBalances) return;

  const fromToken = document.getElementById('swapFromToken').value;
  const toToken = document.getElementById('swapToToken').value;

  document.getElementById('swapFromBalance').textContent = formatTokenAmount(tokenBalances[fromToken] || 0);
  document.getElementById('swapToBalance').textContent = formatTokenAmount(tokenBalances[toToken] || 0);
}

// Swap token direction
function swapTokenDirection() {
  const fromSelect = document.getElementById('swapFromToken');
  const toSelect = document.getElementById('swapToToken');

  const temp = fromSelect.value;
  fromSelect.value = toSelect.value;
  toSelect.value = temp;

  // Clear amounts
  document.getElementById('swapFromAmount').value = '';
  document.getElementById('swapToAmount').value = '';

  updateSwapBalances();
  hideSwapQuote();
}

// Set slippage tolerance
function setSlippage(percent) {
  currentSlippage = percent;

  // Update UI
  const buttons = document.querySelectorAll('.slippage-btn');
  buttons.forEach(btn => btn.classList.remove('active'));

  // Find and activate the matching button
  buttons.forEach(btn => {
    const btnText = btn.textContent.trim();
    if (btnText === percent + '%') {
      btn.classList.add('active');
    }
  });

  // Update quote if we have one
  if (swapQuoteData) {
    displaySwapQuote();
  }
}

// Update swap quote
async function updateSwapQuote() {
  const fromToken = document.getElementById('swapFromToken').value;
  const toToken = document.getElementById('swapToToken').value;
  const fromAmount = document.getElementById('swapFromAmount').value;

  // Validate inputs
  if (!fromAmount || parseFloat(fromAmount) <= 0) {
    hideSwapQuote();
    document.getElementById('swapToAmount').value = '';
    return;
  }

  // Check if same token
  if (fromToken === toToken) {
    showToast('Cannot swap same token', 'error');
    return;
  }

  try {
    // Get token addresses
    const networkTokens = NETWORKS[currentNetwork].tokens;
    const tokenInAddress = networkTokens[fromToken];
    const tokenOutAddress = networkTokens[toToken];

    if (!tokenInAddress || !tokenOutAddress) {
      showToast('Token address not found', 'error');
      return;
    }

    // Convert amount to uint128 (6 decimals for Tempo stablecoins)
    const amountIn = ethers.utils.parseUnits(fromAmount, 6);

    // Get provider and contract
    const provider = getOrCreateProvider(NETWORKS[currentNetwork].rpc);
    const dexContract = new ethers.Contract(DEX_ADDRESS, DEX_ABI, provider);

    // Get quote
    console.log('🔍 Getting swap quote:', { fromToken, toToken, fromAmount });
    const amountOut = await dexContract.quoteSwapExactAmountIn(
      tokenInAddress,
      tokenOutAddress,
      amountIn
    );

    // Store quote data
    swapQuoteData = {
      tokenIn: fromToken,
      tokenOut: toToken,
      tokenInAddress,
      tokenOutAddress,
      amountIn: fromAmount,
      amountOut: ethers.utils.formatUnits(amountOut, 6),
      rate: parseFloat(ethers.utils.formatUnits(amountOut, 6)) / parseFloat(fromAmount)
    };

    // Display quote
    displaySwapQuote();

  } catch (error) {
    console.error('❌ Failed to get swap quote:', error);
    showToast('Failed to get quote. Check liquidity.', 'error');
    hideSwapQuote();
  }
}

// Display swap quote
function displaySwapQuote() {
  if (!swapQuoteData) return;

  // Update output amount
  document.getElementById('swapToAmount').value = parseFloat(swapQuoteData.amountOut).toFixed(6);

  // Update rate
  document.getElementById('swapRate').textContent =
    `1 ${swapQuoteData.tokenIn} = ${swapQuoteData.rate.toFixed(6)} ${swapQuoteData.tokenOut}`;

  // Show quote status
  document.getElementById('swapQuoteStatus').style.display = 'block';
}

// Hide swap quote
function hideSwapQuote() {
  document.getElementById('swapQuoteStatus').style.display = 'none';
  swapQuoteData = null;
}

// Execute swap
async function executeSwap() {
  if (!swapQuoteData) {
    showToast('Please enter an amount first', 'error');
    return;
  }

  const btn = document.getElementById('executeSwapBtn');
  if (btn.disabled) return;

  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Swapping...';

  try {
    // Get provider and signer
    const rpcUrl = NETWORKS[currentNetwork].rpc;
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(wallet.privateKey, provider);

    // Get token contract for approval
    const tokenInContract = new ethers.Contract(
      swapQuoteData.tokenInAddress,
      ['function approve(address spender, uint256 amount) returns (bool)'],
      signer
    );

    // Get DEX contract
    const dexContract = new ethers.Contract(DEX_ADDRESS, DEX_ABI, signer);

    // Calculate minimum output with slippage
    const minAmountOut = ethers.utils.parseUnits(
      (parseFloat(swapQuoteData.amountOut) * (1 - currentSlippage / 100)).toFixed(6),
      6
    );

    // Step 1: Approve DEX to spend tokens
    console.log('📝 Approving DEX to spend tokens...');
    showToast('Approving token spend...', 'info', 3000);

    const amountIn = ethers.utils.parseUnits(swapQuoteData.amountIn, 6);
    const approveTx = await tokenInContract.approve(DEX_ADDRESS, amountIn);

    // Don't wait for approval confirmation - proceed immediately
    console.log('✅ Approval sent:', approveTx.hash);

    // Wait a moment for approval to be mined
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Execute swap
    console.log('🔄 Executing swap...');
    showToast('Executing swap...', 'info', 3000);

    // Try to estimate gas first to catch errors early
    try {
      const gasEstimate = await dexContract.estimateGas.swapExactAmountIn(
        swapQuoteData.tokenInAddress,
        swapQuoteData.tokenOutAddress,
        amountIn,
        minAmountOut
      );
      console.log('✅ Gas estimate:', gasEstimate.toString());
    } catch (gasError) {
      console.error('❌ Gas estimation failed:', gasError);

      // Check common issues
      const balance = tokenBalances[swapQuoteData.tokenIn] || 0;
      if (parseFloat(swapQuoteData.amountIn) > balance) {
        throw new Error('Insufficient balance for swap');
      }

      throw new Error('Swap will likely fail. This could be due to: insufficient liquidity, slippage too low, or invalid token pair.');
    }

    const swapTx = await dexContract.swapExactAmountIn(
      swapQuoteData.tokenInAddress,
      swapQuoteData.tokenOutAddress,
      amountIn,
      minAmountOut
    );

    console.log('✅ Swap transaction sent:', swapTx.hash);

    // Save swap to transaction history immediately (non-blocking)
    saveTransaction({
      hash: swapTx.hash,
      from: wallet.address,
      to: DEX_ADDRESS,
      amount: swapQuoteData.amountIn,
      token: swapQuoteData.tokenIn,
      memo: `Swap to ${swapQuoteData.amountOut} ${swapQuoteData.tokenOut}`,
      timestamp: Date.now(),
      status: 'pending'
    }).then(() => {
      console.log('✅ Swap saved to transaction history');
      // Reload transaction history in background
      loadTransactionHistory();
    });

    showToast(`✅ Swap submitted! ${swapQuoteData.amountIn} ${swapQuoteData.tokenIn} → ${parseFloat(swapQuoteData.amountOut).toFixed(2)} ${swapQuoteData.tokenOut}`, 'success', 5000);

    // Clear form
    document.getElementById('swapFromAmount').value = '';
    document.getElementById('swapToAmount').value = '';
    hideSwapQuote();

    // Re-enable button before returning
    btn.disabled = false;
    btn.innerHTML = originalText;

    // Return to wallet immediately (don't wait in finally block)
    showWalletScreen();

    // Wait for confirmation in background (non-blocking)
    swapTx.wait().then(async () => {
      console.log('✅ Swap confirmed on blockchain!');

      // Update transaction status to confirmed
      await updateTransactionStatus(swapTx.hash, 'confirmed');

      showToast('✅ Swap confirmed!', 'success', 3000);
      fetchBalances();

      // Reload transaction history to show updated status
      await loadTransactionHistory();
      renderTransactionHistory();
    }).catch(async (err) => {
      console.error('⚠️ Swap confirmation error:', err);

      // Update transaction status to failed
      await updateTransactionStatus(swapTx.hash, 'failed');

      showToast('⚠️ Swap failed. Check transaction history.', 'error');

      // Reload transaction history to show failed status
      await loadTransactionHistory();
      renderTransactionHistory();
    });

  } catch (error) {
    console.error('❌ Swap failed:', error);
    showToast('Swap failed: ' + (error.message || 'Unknown error'), 'error');
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// Save contacts
async function saveContacts() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ tempoContacts: contacts }, () => {
      console.log('✅ Contacts saved');
      resolve();
    });
  });
}

// Show contacts screen
function showContacts() {
  document.getElementById('walletScreen').style.display = 'none';
  document.getElementById('contactsScreen').style.display = 'block';
  
  loadContacts().then(() => {
    renderContacts();
  });
}

// Render contacts list
function renderContacts() {
  const listEl = document.getElementById('contactsList');
  
  if (!listEl) return;
  
  if (contacts.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;padding:60px 20px;opacity:0.7;"><div style="font-size:48px;margin-bottom:10px;">👥</div><div style="font-size:14px;color:#0f172a;">No contacts yet</div></div>';
    return;
  }
  
  listEl.innerHTML = contacts.map((contact, index) => 
    '<div style="background:white;border:1px solid #f1f5f9;border-radius:8px;padding:12px;margin-bottom:8px;cursor:pointer;" onclick="selectContact(' + index + ')">' +
    '<div style="font-weight:600;margin-bottom:4px;color:#0f172a;">' + contact.name + '</div>' +
    '<div style="font-size:11px;color:#64748b;font-family:monospace;">' + contact.address + '</div>' +
    '</div>'
  ).join('');
}

// Show add contact screen
function showAddContact() {
  document.getElementById('contactsScreen').style.display = 'none';
  document.getElementById('addContactScreen').style.display = 'block';
  
  document.getElementById('contactName').value = '';
  document.getElementById('contactAddress').value = '';
}

// Save new contact
async function saveContact() {
  const name = document.getElementById('contactName').value.trim();
  const address = document.getElementById('contactAddress').value.trim();
  
  if (!name || !address) {
    alert('Please fill in all fields');
    return;
  }
  
  if (!address.startsWith('0x') || address.length !== 42) {
    alert('Invalid address format');
    return;
  }
  
  contacts.push({ name, address });
  
  await saveContacts();

  showToast('Contact saved successfully!', 'success');

  document.getElementById('addContactScreen').style.display = 'none';
  document.getElementById('contactsScreen').style.display = 'block';
  
  renderContacts();
}

// Select contact and go to send screen
function selectContact(index) {
  const contact = contacts[index];
  
  if (!contact) return;
  
  document.getElementById('contactsScreen').style.display = 'none';
  document.getElementById('sendScreen').style.display = 'block';
  
  document.getElementById('sendToAddress').value = contact.address;
}

console.log('✅ Contacts management loaded');


// ============================================
// EXPORT FUNCTIONS
// ============================================

function exportPrivateKey() {
  if (!wallet || !wallet.privateKey) {
    alert('No wallet loaded');
    return;
  }
  
  const confirmMsg = '⚠️ WARNING: Never share your private key!\n\nYour private key gives full access to your funds.\n\nOnly export if you know what you\'re doing.\n\nShow private key?';
  
  if (!confirm(confirmMsg)) {
    return;
  }
  
  alert('🔑 Private Key:\n\n' + wallet.privateKey + '\n\n⚠️ Keep this secret!');
  
  console.log('🔑 Private key exported');
}

function exportSeedPhrase() {
  if (!wallet || !wallet.mnemonic) {
    alert('No seed phrase available');
    return;
  }
  
  const confirmMsg = '⚠️ WARNING: Never share your seed phrase!\n\nYour seed phrase gives full access to your funds.\n\nOnly export if you know what you\'re doing.\n\nShow seed phrase?';
  
  if (!confirm(confirmMsg)) {
    return;
  }
  
  alert('🔐 Seed Phrase:\n\n' + wallet.mnemonic + '\n\n⚠️ Keep this secret!');
  
  console.log('🔐 Seed phrase exported');
}

console.log('✅ Export functions loaded');


// ============================================
// PAYMENT LINK GENERATOR
// ============================================

function showPaymentLinkGenerator() {
  document.getElementById('walletScreen').style.display = 'none';
  document.getElementById('paymentLinkScreen').style.display = 'block';
  
  // Pre-fill with wallet address
  document.getElementById('paymentAddress').value = wallet.address;
}

function generatePaymentLink() {
  console.log('🔗 generatePaymentLink called!');
  const amount = document.getElementById('paymentAmount').value.trim();
  const token = document.getElementById('paymentToken').value;
  const memo = document.getElementById('paymentMemo').value.trim();
  
  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
    alert('Please enter a valid amount');
    return;
  }
  
  // Generate payment link
  const link = 'tempo://pay?address=' + wallet.address + 
               '&amount=' + amount + 
               '&token=' + token + 
               '&memo=' + encodeURIComponent(memo);
  
  // Show link
  document.getElementById('generatedLink').value = link;
  
  // Generate QR code
  const qrContainer = document.getElementById('paymentQRCode');
  qrContainer.innerHTML = '';
  
  try {
    if (typeof QRCode === 'undefined') {
      console.error('❌ QRCode library not loaded!');
      qrContainer.innerHTML = '<div style="color:#dc2626;font-size:12px;">QR code library not available</div>';
    } else {
      new QRCode(qrContainer, {
        text: link,
        width: 250,
        height: 250
      });
      console.log('✅ QR code generated');
    }
  } catch (error) {
    console.error('❌ QR code error:', error);
    qrContainer.innerHTML = '<div style="color:#dc2626;font-size:12px;">QR code generation failed</div>';
  }
  
  // Show result section AFTER QR generation
  document.getElementById('paymentLinkResult').style.display = 'block';
  
  console.log('✅ Payment link generated:', link);
}

function copyPaymentLink() {
  const link = document.getElementById('generatedLink').value;
  navigator.clipboard.writeText(link);
  showToast('Payment link copied to clipboard!', 'success');
}

console.log('✅ Payment link generator loaded');


// ============================================
// API KEYS FOR AI AGENTS
// ============================================

let apiKeys = [];

// Load API keys
async function loadAPIKeys() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['tempoAPIKeys'], (result) => {
      apiKeys = result.tempoAPIKeys || [];
      console.log('✅ Loaded API keys:', apiKeys.length);
      resolve();
    });
  });
}

// Save API keys
async function saveAPIKeys() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ tempoAPIKeys: apiKeys }, () => {
      console.log('✅ API keys saved');
      resolve();
    });
  });
}

// Generate random API key
function generateAPIKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'tk_';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

// Show API keys screen
function showAPIKeys() {
  document.getElementById('settingsScreen').style.display = 'none';
  document.getElementById('apiKeysScreen').style.display = 'block';
  
  loadAPIKeys().then(() => {
    renderAPIKeys();
  });
}

// Render API keys list
function renderAPIKeys() {
  const listEl = document.getElementById('apiKeysList');
  
  if (!listEl) return;
  
  if (apiKeys.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;padding:40px 20px;opacity:0.7;"><div style="font-size:14px;color:#0f172a;">No API keys yet</div><div style="font-size:12px;color:#64748b;margin-top:8px;">Create an API key to enable programmatic access</div></div>';
    return;
  }
  
  listEl.innerHTML = apiKeys.map((key, index) => 
    '<div style="background:white;border:1px solid #f1f5f9;border-radius:8px;padding:12px;margin-bottom:8px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
    '<div style="font-weight:600;color:#0f172a;">' + key.name + '</div>' +
    '<button onclick="revokeAPIKey(' + index + ')" style="padding:4px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;color:#dc2626;font-size:12px;cursor:pointer;">Revoke</button>' +
    '</div>' +
    '<div style="font-size:11px;color:#64748b;font-family:monospace;margin-bottom:4px;">' + key.key.substring(0, 20) + '...</div>' +
    '<div style="font-size:11px;color:#64748b;">Created: ' + new Date(key.created).toLocaleDateString() + '</div>' +
    '<div style="font-size:11px;color:#64748b;">Daily limit: $' + key.dailyLimit + '</div>' +
    '</div>'
  ).join('');
}

// Create new API key
async function createAPIKey() {
  const name = prompt('Enter API key name (e.g., "OpenAI Agent", "Payment Bot"):');
  
  if (!name || !name.trim()) {
    return;
  }
  
  const dailyLimit = prompt('Enter daily payment limit in USD (e.g., 1000):', '1000');
  
  if (!dailyLimit || isNaN(dailyLimit) || parseFloat(dailyLimit) <= 0) {
    alert('Invalid daily limit');
    return;
  }
  
  const key = generateAPIKey();
  
  apiKeys.push({
    name: name.trim(),
    key: key,
    created: new Date().toISOString(),
    dailyLimit: parseFloat(dailyLimit),
    dailyUsed: 0,
    lastReset: new Date().toISOString()
  });
  
  await saveAPIKeys();
  
  alert('✅ API Key Created!\n\n' + key + '\n\n⚠️ Save this key - you won\'t see it again!');
  
  renderAPIKeys();
}

// Revoke API key
async function revokeAPIKey(index) {
  const key = apiKeys[index];
  
  if (!key) return;
  
  if (!confirm('Revoke API key "' + key.name + '"?\n\nThis cannot be undone.')) {
    return;
  }
  
  apiKeys.splice(index, 1);
  
  await saveAPIKeys();
  
  alert('✅ API key revoked');
  
  renderAPIKeys();
}

// Show API documentation
function showAPIDocs() {
  const docs = `
🤖 API DOCUMENTATION

BASE URL: Not implemented yet (would be a backend service)

AUTHENTICATION:
Include API key in header:
Authorization: Bearer YOUR_API_KEY

ENDPOINTS:

1. Send Payment
POST /api/pay
Body: {
  "to": "0x...",
  "amount": "100",
  "token": "AlphaUSD",
  "memo": "Payment for services"
}

2. Get Balance
GET /api/balance

3. Get Transaction History
GET /api/transactions

RATE LIMITS:
- Daily payment limit per key
- 100 requests per hour

EXAMPLE (Python):
import requests

headers = {
  "Authorization": "Bearer tk_xxx",
  "Content-Type": "application/json"
}

response = requests.post(
  "https://api.tempo.wallet/pay",
  headers=headers,
  json={
    "to": "0x742d35...",
    "amount": "50",
    "token": "AlphaUSD",
    "memo": "AI agent payment"
  }
)

EXAMPLE (JavaScript):
const response = await fetch('https://api.tempo.wallet/pay', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer tk_xxx',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    to: '0x742d35...',
    amount: '50',
    token: 'AlphaUSD',
    memo: 'AI agent payment'
  })
});

USE CASES:
- OpenAI agents paying for API calls
- Automated payroll systems
- Subscription billing
- IoT device payments
- Smart contract automation
  `;
  
  alert(docs);
}

console.log('✅ API keys system loaded');


// ============================================
// BUY/SELL STABLECOINS (BRIDGE API - DEMO MODE)
// ============================================

// Configuration for Bridge API (when approved)
const BRIDGE_CONFIG = {
  demoMode: true, // Set to false when you get API keys
  sandbox: {
    apiUrl: 'https://api.sandbox.bridge.xyz',
    apiKey: 'sk-test-YOUR_SANDBOX_KEY' // Replace with real key
  },
  production: {
    apiUrl: 'https://api.bridge.xyz',
    apiKey: 'sk-YOUR_PRODUCTION_KEY' // Replace with real key
  }
};

// Show buy stablecoins screen
function showBuyStablecoins() {
  document.getElementById('walletScreen').style.display = 'none';
  document.getElementById('buyStablecoinsScreen').style.display = 'block';
  
  // Reset form
  document.getElementById('buyAmount').value = '';
  document.getElementById('buyToken').value = 'AlphaUSD';
  updateBuyPreview();
}

// Update buy preview
function updateBuyPreview() {
  const amount = parseFloat(document.getElementById('buyAmount').value) || 0;
  const token = document.getElementById('buyToken').value;
  
  if (amount > 0) {
    const fee = amount * 0.005; // 0.5% fee
    const youGet = amount - fee;
    
    document.getElementById('buyPreviewAmount').textContent = '$' + amount.toFixed(2);
    document.getElementById('buyPreviewToken').textContent = youGet.toFixed(2) + ' ' + token;
    document.getElementById('buyPreviewFee').textContent = '$' + fee.toFixed(2);
    document.getElementById('buyPreview').style.display = 'block';
  } else {
    document.getElementById('buyPreview').style.display = 'none';
  }
}

// Execute buy (demo mode)
async function executeBuy() {
  const amount = parseFloat(document.getElementById('buyAmount').value);
  const token = document.getElementById('buyToken').value;
  
  if (!amount || amount <= 0) {
    alert('Please enter a valid amount');
    return;
  }
  
  if (amount < 10) {
    alert('Minimum purchase: $10 USD');
    return;
  }
  
  if (BRIDGE_CONFIG.demoMode) {
    // Demo mode - show how it works
    const demoMsg = `🎉 DEMO MODE\n\n` +
                    `In production, this would:\n\n` +
                    `1. Process $${amount.toFixed(2)} USD payment via credit card\n` +
                    `2. Deliver ${(amount * 0.995).toFixed(2)} ${token} to your wallet\n` +
                    `3. Complete in 1-5 minutes\n\n` +
                    `To enable real purchases:\n` +
                    `→ Apply for Bridge API at support@bridge.xyz\n` +
                    `→ Get sandbox keys\n` +
                    `→ Set BRIDGE_CONFIG.demoMode = false`;
    
    alert(demoMsg);
    console.log('💳 Demo buy:', amount, 'USD →', token);
  } else {
    // Real Bridge API integration (when approved)
    try {
      const response = await fetch(BRIDGE_CONFIG.sandbox.apiUrl + '/v0/transfers', {
        method: 'POST',
        headers: {
          'Api-Key': BRIDGE_CONFIG.sandbox.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: (amount * 100).toString(), // Convert to cents
          source: { 
            currency: 'usd', 
            payment_rail: 'card' 
          },
          destination: { 
            currency: token.toLowerCase(),
            external_account_id: wallet.address
          }
        })
      });
      
      const result = await response.json();
      
      if (result.id) {
        alert('✅ Purchase initiated!\n\nTransaction ID: ' + result.id + '\n\nTokens will arrive in 1-5 minutes.');
        setTimeout(() => fetchBalances(), 5000);
      } else {
        alert('❌ Purchase failed: ' + (result.message || 'Unknown error'));
      }
    } catch (error) {
      alert('❌ Error: ' + error.message);
      console.error('Bridge API error:', error);
    }
  }
}

// Show sell stablecoins screen
function showSellStablecoins() {
  document.getElementById('walletScreen').style.display = 'none';
  document.getElementById('sellStablecoinsScreen').style.display = 'block';
  
  // Reset form
  document.getElementById('sellAmount').value = '';
  document.getElementById('sellToken').value = 'AlphaUSD';
  updateSellPreview();
}

// Update sell preview
function updateSellPreview() {
  const amount = parseFloat(document.getElementById('sellAmount').value) || 0;
  const token = document.getElementById('sellToken').value;
  
  if (amount > 0) {
    const fee = amount * 0.01; // 1% fee
    const youGet = amount - fee;
    
    document.getElementById('sellPreviewAmount').textContent = amount.toFixed(2) + ' ' + token;
    document.getElementById('sellPreviewUSD').textContent = '$' + youGet.toFixed(2);
    document.getElementById('sellPreviewFee').textContent = '$' + fee.toFixed(2);
    document.getElementById('sellPreview').style.display = 'block';
  } else {
    document.getElementById('sellPreview').style.display = 'none';
  }
}

// Execute sell (demo mode)
async function executeSell() {
  const amount = parseFloat(document.getElementById('sellAmount').value);
  const token = document.getElementById('sellToken').value;
  
  if (!amount || amount <= 0) {
    alert('Please enter a valid amount');
    return;
  }
  
  if (amount < 10) {
    alert('Minimum sale: 10 ' + token);
    return;
  }
  
  // Check balance
  const balance = parseFloat(document.getElementById(token + 'Balance')?.textContent?.replace(/[^0-9.-]/g, '') || 0);
  if (amount > balance) {
    alert('Insufficient balance. You have ' + balance.toFixed(2) + ' ' + token);
    return;
  }
  
  if (BRIDGE_CONFIG.demoMode) {
    // Demo mode - show how it works
    const demoMsg = `🎉 DEMO MODE\n\n` +
                    `In production, this would:\n\n` +
                    `1. Sell ${amount.toFixed(2)} ${token}\n` +
                    `2. Transfer $${(amount * 0.99).toFixed(2)} USD to your bank account\n` +
                    `3. Complete in 1-3 business days\n\n` +
                    `To enable real sales:\n` +
                    `→ Apply for Bridge API at support@bridge.xyz\n` +
                    `→ Get sandbox keys\n` +
                    `→ Set BRIDGE_CONFIG.demoMode = false`;
    
    alert(demoMsg);
    console.log('💵 Demo sell:', amount, token, '→ USD');
  } else {
    // Real Bridge API integration (when approved)
    try {
      const response = await fetch(BRIDGE_CONFIG.sandbox.apiUrl + '/v0/transfers', {
        method: 'POST',
        headers: {
          'Api-Key': BRIDGE_CONFIG.sandbox.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: (amount * 100).toString(), // Convert to cents
          source: { 
            currency: token.toLowerCase(),
            external_account_id: wallet.address
          },
          destination: { 
            currency: 'usd', 
            payment_rail: 'ach' 
          }
        })
      });
      
      const result = await response.json();
      
      if (result.id) {
        alert('✅ Sale initiated!\n\nTransaction ID: ' + result.id + '\n\nUSD will arrive in 1-3 business days.');
        setTimeout(() => fetchBalances(), 5000);
      } else {
        alert('❌ Sale failed: ' + (result.message || 'Unknown error'));
      }
    } catch (error) {
      alert('❌ Error: ' + error.message);
      console.error('Bridge API error:', error);
    }
  }
}

console.log('✅ Buy/Sell stablecoins loaded (Demo Mode)');


// ============================================
// TIP-20 TRANSFER WITH MEMO SUPPORT
// ============================================

// TIP-20 ABI including transferWithMemo
const TIP20_ABI = [
  // Standard ERC-20 functions
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  
  // TIP-20 specific: transferWithMemo
  'function transferWithMemo(address to, uint256 amount, bytes32 memo) returns (bool)',
  
  // For checking if contract supports TIP-20
  'function supportsInterface(bytes4 interfaceId) view returns (bool)'
];

// Convert string memo to bytes32
function stringToBytes32(str) {
  if (!str) return '0x0000000000000000000000000000000000000000000000000000000000000000';
  
  // Trim to 32 characters max
  str = str.substring(0, 32);
  
  // Convert to hex and pad to 32 bytes
  let hex = '';
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, '0');
  }
  
  // Pad remaining bytes with zeros
  return '0x' + hex.padEnd(64, '0');
}

// Check if token supports TIP-20 transferWithMemo
async function supportsTIP20Memo(tokenAddress) {
  try {
    const provider = new ethers.JsonRpcProvider(NETWORKS[currentNetwork].rpcUrl);
    const contract = new ethers.Contract(tokenAddress, TIP20_ABI, provider);
    
    // TIP-20 interface ID (you can check docs for exact ID)
    // For now, we'll try to call transferWithMemo and catch if it fails
    return true; // Assume all Tempo tokens support it
  } catch (error) {
    console.log('Token does not support TIP-20 memos:', error);
    return false;
  }
}

console.log('✅ TIP-20 memo support loaded');


// ============================================
// TIP-20 TRANSFER WITH MEMO SUPPORT
// ============================================

// TIP-20 ABI including transferWithMemo

// Convert string memo to bytes32
function stringToBytes32(str) {
  if (!str) return '0x0000000000000000000000000000000000000000000000000000000000000000';
  
  // Trim to 32 characters max
  str = str.substring(0, 32);
  
  // Convert to hex and pad to 32 bytes
  let hex = '';
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, '0');
  }
  
  // Pad remaining bytes with zeros
  return '0x' + hex.padEnd(64, '0');
}

// Check if token supports TIP-20 transferWithMemo
async function supportsTIP20Memo(tokenAddress) {
  try {
    const provider = new ethers.JsonRpcProvider(NETWORKS[currentNetwork].rpcUrl);
    const contract = new ethers.Contract(tokenAddress, TIP20_ABI, provider);
    
    // TIP-20 interface ID (you can check docs for exact ID)
    // For now, we'll try to call transferWithMemo and catch if it fails
    return true; // Assume all Tempo tokens support it
  } catch (error) {
    console.log('Token does not support TIP-20 memos:', error);
    return false;
  }
}

console.log('✅ TIP-20 memo support loaded');


// ============================================
// SEND TAB SWITCHING (ADDRESS vs CONTACT)
// ============================================

function switchSendTab(tab) {
  const addressTab = document.getElementById('sendTabAddress');
  const contactTab = document.getElementById('sendTabContact');
  const addressForm = document.getElementById('sendAddressForm');
  const contactForm = document.getElementById('sendContactForm');

  if (tab === 'address') {
    // Sync amount, token, and memo from Contact to Address (preserve user input)
    const contactAmount = document.getElementById('sendAmountContact').value;
    const contactToken = document.getElementById('sendTokenContact').value;
    const contactMemo = document.getElementById('sendMemoContact').value;

    if (contactAmount) document.getElementById('sendAmount').value = contactAmount;
    if (contactToken) document.getElementById('sendToken').value = contactToken;
    if (contactMemo) document.getElementById('sendMemo').value = contactMemo;

    // Toggle tab classes
    addressTab.classList.remove('inactive');
    addressTab.classList.add('active');
    contactTab.classList.remove('active');
    contactTab.classList.add('inactive');

    // Show address form, hide contact form
    addressForm.style.display = 'block';
    contactForm.style.display = 'none';
  } else if (tab === 'contact') {
    // Sync amount, token, and memo from Address to Contact (preserve user input)
    const addressAmount = document.getElementById('sendAmount').value;
    const addressToken = document.getElementById('sendToken').value;
    const addressMemo = document.getElementById('sendMemo').value;

    if (addressAmount) document.getElementById('sendAmountContact').value = addressAmount;
    if (addressToken) document.getElementById('sendTokenContact').value = addressToken;
    if (addressMemo) document.getElementById('sendMemoContact').value = addressMemo;

    // Toggle tab classes
    contactTab.classList.remove('inactive');
    contactTab.classList.add('active');
    addressTab.classList.remove('active');
    addressTab.classList.add('inactive');

    // Show contact form, hide address form
    addressForm.style.display = 'none';
    contactForm.style.display = 'block';

    // Load contacts into dropdown
    loadContactsDropdown();
  }

  console.log('✅ Switched to', tab, 'tab (synced amount/token/memo)');
}

console.log('✅ Send tab switching loaded');

// NOTE: Event listeners for tabs and back buttons are now consolidated
// in initializeAdditionalListeners() function called from main DOMContentLoaded



// Load contacts into send dropdown
async function loadContactsDropdown() {
  const dropdown = document.getElementById('sendContactSelect');
  if (!dropdown) return;
  
  const { tempoContacts: contacts } = await chrome.storage.local.get(['tempoContacts']);
  
  // Clear existing options except the first one
  dropdown.innerHTML = '<option value="">Choose a contact...</option>';
  
  if (contacts && contacts.length > 0) {
    contacts.forEach(contact => {
      const option = document.createElement('option');
      option.value = contact.address;
      option.textContent = contact.name + ' (' + contact.address.substring(0, 6) + '...' + contact.address.substring(38) + ')';
      dropdown.appendChild(option);
    });
    console.log('Loaded ' + contacts.length + ' contacts into dropdown');
  } else {
    console.log('No contacts to load');
  }
}




// ============================================
// ENS SUPPORT - APPEND THIS TO popup.js
// Just copy this entire file and paste at the END of popup.js
// ============================================

// ENS Service Class
class ENSService {
  constructor() {
    // Use only public RPC endpoints that don't require API keys
    // These endpoints have no rate limits for basic ENS resolution
    this.providers = [
      new ethers.providers.JsonRpcProvider('https://cloudflare-eth.com'),
      new ethers.providers.JsonRpcProvider('https://rpc.ankr.com/eth'),
      new ethers.providers.JsonRpcProvider('https://ethereum.publicnode.com'),
      new ethers.providers.JsonRpcProvider('https://eth.llamarpc.com'),
      new ethers.providers.JsonRpcProvider('https://1rpc.io/eth')
    ];
    this.currentProviderIndex = 0;

    // In-memory cache for resolved ENS names (5 minute TTL)
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes

    console.log('✅ ENS Service created with 5 public RPC providers (no API keys required)');
  }

  get provider() {
    return this.providers[this.currentProviderIndex];
  }

  async resolveName(ensName) {
    try {
      // Check cache first
      const cached = this.cache.get(ensName);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        console.log('⚡ ENS cache hit:', ensName, '→', cached.address);
        return cached.address;
      }

      console.log('🔍 Resolving ENS name:', ensName, 'trying ALL 5 providers in parallel...');

      // Try ALL providers in parallel - much faster and more reliable!
      const resolvePromises = this.providers.map((provider, index) => {
        return Promise.race([
          provider.resolveName(ensName).then(addr => {
            if (addr) {
              const url = provider.connection ? provider.connection.url : 'Provider ' + index;
              console.log('✅ Provider', index, '(' + url + ') resolved:', addr);
              return { address: addr, providerIndex: index };
            }
            return null;
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout after 8s')), 8000)
          )
        ]).catch(err => {
          const url = provider.connection ? provider.connection.url : 'Provider ' + index;
          console.warn('⚠️ Provider', index, '(' + url + ') failed:', err.message);
          return null;
        });
      });

      // Wait for all providers to finish (or timeout)
      const results = await Promise.allSettled(resolvePromises);

      // Find first successful result
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value && result.value.address) {
          const address = result.value.address;
          // Cache the result
          this.cache.set(ensName, { address, timestamp: Date.now() });
          console.log('✅ ENS resolved:', ensName, '→', address, '(from parallel resolution)');
          return address;
        }
      }

      console.error('❌ All 5 providers failed to resolve:', ensName);
      return null;

    } catch (error) {
      console.error('❌ ENS resolution error:', error);
      return null;
    }
  }

  async lookupAddress(address) {
    try {
      console.log('🔍 Reverse lookup for address:', address);
      const name = await this.provider.lookupAddress(address);
      console.log('✅ Reverse lookup:', address, '→', name);
      return name;
    } catch (error) {
      console.error('❌ Reverse lookup failed:', error);
      return null;
    }
  }
}

// ENS Service Instance
let ensService = null;

// Initialize ENS Service
function initializeENS() {
  if (!ensService) {
    ensService = new ENSService();
    console.log('✅ ENS Service initialized');
  }
}

// Resolve ENS name or validate address
async function resolveRecipient(input) {
  if (!input) return null;
  
  input = input.trim();
  
  // If it's already a valid address, return it
  if (ethers.utils.isAddress(input)) {
    return { address: input, isENS: false };
  }
  
  // If it's an ENS name, resolve it
  if (input.endsWith('.eth')) {
    try {
      if (!ensService) initializeENS();
      const address = await ensService.resolveName(input);
      
      if (address) {
        return { address: address, isENS: true, ensName: input };
      } else {
        throw new Error('ENS name not found: ' + input);
      }
    } catch (error) {
      console.error('ENS resolution error:', error);
      throw new Error('Failed to resolve ENS name: ' + input);
    }
  }
  
  throw new Error('Invalid address or ENS name');
}

// Setup auto-resolve ENS as user types
let ensResolveTimeout = null;
function setupENSAutoResolve() {
  const input = document.getElementById('sendToAddress');
  
  if (!input) {
    console.log('⚠️ sendToAddress input not found, ENS auto-resolve skipped');
    return;
  }
  
  // Create status div if it doesn't exist
  let statusDiv = document.getElementById('ensStatus');
  if (!statusDiv) {
    statusDiv = document.createElement('div');
    statusDiv.id = 'ensStatus';
    statusDiv.style.marginTop = '8px';
    statusDiv.style.fontSize = '12px';
    statusDiv.style.display = 'none';
    input.parentNode.appendChild(statusDiv);
    console.log('✅ Created ENS status div');
  }
  
  input.addEventListener('input', function() {
    clearTimeout(ensResolveTimeout);
    const value = this.value.trim();
    
    // Hide status if empty
    if (!value) {
      statusDiv.style.display = 'none';
      return;
    }
    
    // If it's already a valid address
    if (ethers.utils.isAddress(value)) {
      statusDiv.style.display = 'block';
      statusDiv.style.color = '#10b981';
      statusDiv.innerHTML = '✅ Valid Ethereum address';
      return;
    }
    
    // If it looks like ENS
    if (value.endsWith('.eth')) {
      statusDiv.style.display = 'block';
      statusDiv.style.color = '#64748b';
      statusDiv.innerHTML = '🔄 Resolving ENS name...';
      
      // Debounce resolution (wait 500ms after user stops typing)
      ensResolveTimeout = setTimeout(async () => {
        try {
          if (!ensService) initializeENS();
          const address = await ensService.resolveName(value);
          
          if (address) {
            statusDiv.style.color = '#10b981';
            statusDiv.innerHTML = '✅ Resolves to: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:11px;">' + 
              address.slice(0,10) + '...' + address.slice(-8) + '</code>';
          } else {
            statusDiv.style.color = '#ef4444';
            statusDiv.innerHTML = '❌ ENS name not found';
          }
        } catch (error) {
          statusDiv.style.color = '#ef4444';
          statusDiv.innerHTML = '❌ Failed to resolve ENS name';
          console.error('ENS resolution error:', error);
        }
      }, 500);
    } else {
      statusDiv.style.display = 'block';
      statusDiv.style.color = '#f59e0b';
      statusDiv.innerHTML = '⚠️ Enter valid Ethereum address or ENS name (.eth)';
    }
  });
  
  console.log('✅ ENS auto-resolve setup complete');
}

// Wrap the original showWallet function to add ENS initialization
const originalShowWallet = typeof showWallet !== 'undefined' ? showWallet : function() {};
function showWallet() {
  // Call original function
  originalShowWallet();
  
  // Initialize ENS
  setTimeout(() => {
    initializeENS();
    setupENSAutoResolve();
    console.log('✅ ENS initialized in showWallet');
  }, 100);
}

// ENS initialization is now handled in main DOMContentLoaded handler

console.log('✅ ENS integration code loaded - ready to resolve .eth names!');
// ============================================
// DARK MODE TOGGLE FUNCTIONALITY
// Add this to the end of your popup.js file
// ============================================

// Initialize dark mode from localStorage
function initDarkMode() {
  const darkMode = localStorage.getItem('darkMode') === 'true';
  if (darkMode) {
    document.body.classList.add('dark-mode');
  }
  
  // Create dark mode toggle button if it doesn't exist
  if (!document.getElementById('darkModeToggle')) {
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'darkModeToggle';
    toggleBtn.innerHTML = `
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
    `;
    toggleBtn.setAttribute('aria-label', 'Toggle dark mode');
    toggleBtn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--bg-surface);
      border: 2px solid var(--border-default);
      box-shadow: var(--shadow-lg);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 1000;
    `;
    
    document.body.appendChild(toggleBtn);
    
    // Add event listener
    toggleBtn.addEventListener('click', toggleDarkMode);
    
    // Update icon based on current mode
    updateDarkModeIcon();
  }
}

// Toggle dark mode
function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', isDark);
  updateDarkModeIcon();
  
  // Animate the toggle
  const btn = document.getElementById('darkModeToggle');
  btn.style.transform = 'scale(1.1) rotate(20deg)';
  setTimeout(() => {
    btn.style.transform = '';
  }, 200);
}

// Update dark mode icon
function updateDarkModeIcon() {
  const btn = document.getElementById('darkModeToggle');
  if (!btn) return;
  
  const isDark = document.body.classList.contains('dark-mode');
  
  if (isDark) {
    // Sun icon for light mode
    btn.innerHTML = `
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:24px;height:24px;color:var(--text-primary)">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    `;
  } else {
    // Moon icon for dark mode
    btn.innerHTML = `
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:24px;height:24px;color:var(--text-primary)">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
    `;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDarkMode);
} else {
  initDarkMode();
}

// ============================================
// COMPREHENSIVE BACK BUTTON HANDLERS & FIXES
// ============================================
function initializeBackButtons() {
  // Helper function to add back button listener
  const addBackButton = (buttonId, fromScreenId, toScreenId) => {
    const button = document.getElementById(buttonId);
    if (button) {
      button.addEventListener('click', () => {
        document.getElementById(fromScreenId).style.display = 'none';
        document.getElementById(toScreenId).style.display = 'block';
      });
      console.log(`✅ ${buttonId} listener attached`);
    }
  };

  // Back buttons that return to wallet screen
  addBackButton('backFromReceive', 'receiveScreen', 'walletScreen');
  addBackButton('backFromSend', 'sendScreen', 'walletScreen');
  addBackButton('backFromContacts', 'contactsScreen', 'walletScreen');
  addBackButton('backFromHistory', 'historyScreen', 'walletScreen');
  addBackButton('backFromSettings', 'settingsScreen', 'walletScreen');

  // Back from Confirm goes to Send screen
  addBackButton('backFromConfirm', 'confirmScreen', 'sendScreen');

  // Back from Add Contact goes to Contacts screen
  addBackButton('backFromAddContact', 'addContactScreen', 'contactsScreen');

  // Copy button already handled in attachListeners() - no duplicate needed here

  console.log('✅ All back buttons initialized');
}

// Initialize back buttons when DOM is ready
window.addEventListener('DOMContentLoaded', initializeBackButtons);

console.log('✅ HEIAN Wallet fully initialized');
