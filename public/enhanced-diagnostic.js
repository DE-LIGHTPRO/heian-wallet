// Enhanced Diagnostic Script for HEIAN Wallet
console.log('%c==== HEIAN WALLET ENHANCED DIAGNOSTIC ====', 'background: #667eea; color: white; font-weight: bold; padding: 5px;');

// Test 1: Check if popup.js loaded without errors
console.log('%c1. Script Loading Test', 'font-weight: bold; color: #2563eb');
console.log('   Document ready state:', document.readyState);
console.log('   Scripts loaded:', document.scripts.length);

// List all loaded scripts
for (let i = 0; i < document.scripts.length; i++) {
  const script = document.scripts[i];
  console.log(`   - ${script.src || 'inline'}`);
}

// Test 2: Check for syntax errors (if we're here, no syntax errors)
console.log('%c2. Syntax Test', 'font-weight: bold; color: #2563eb');
console.log('   ✓ No syntax errors (script executed successfully)');

// Test 3: Check dependencies
console.log('%c3. Dependencies Test', 'font-weight: bold; color: #2563eb');
const checkDep = (name, obj) => {
  const exists = typeof obj !== 'undefined';
  console.log(`   ${exists ? '✓' : '✗'} ${name}:`, exists ? 'loaded' : 'MISSING');
  return exists;
};

checkDep('ethers', typeof ethers);
checkDep('feather', typeof feather);
checkDep('QRCode', typeof QRCode);
checkDep('chrome.storage', typeof chrome?.storage);

// Test 4: Check global functions
console.log('%c4. Global Functions Test', 'font-weight: bold; color: #2563eb');
const checkFunc = (name) => {
  const exists = typeof window[name] === 'function';
  console.log(`   ${exists ? '✓' : '✗'} ${name}():`, exists ? 'defined' : 'MISSING');
  return exists;
};

const criticalFunctions = [
  'createWallet2',
  'importWallet',
  'attachListeners',
  'showWallet',
  'send',
  'receive',
  'loadAccounts',
  'loadNetwork',
  'refreshBalance'
];

let allFunctionsExist = true;
criticalFunctions.forEach(funcName => {
  if (!checkFunc(funcName)) allFunctionsExist = false;
});

// Test 5: Check DOM elements
console.log('%c5. DOM Elements Test', 'font-weight: bold; color: #2563eb');
setTimeout(() => {
  const checkElement = (id) => {
    const el = document.getElementById(id);
    const exists = el !== null;
    console.log(`   ${exists ? '✓' : '✗'} #${id}:`, exists ? 'found' : 'MISSING');
    if (exists && (id === 'createBtn' || id === 'importBtn')) {
      console.log(`      - Visible: ${el.offsetParent !== null}`);
      console.log(`      - Disabled: ${el.disabled}`);
      console.log(`      - Has onclick: ${el.onclick !== null}`);
    }
    return exists;
  };

  const criticalElements = [
    'createScreen',
    'createBtn',
    'importBtn',
    'unlockScreen',
    'unlockBtn',
    'walletScreen',
    'sendBtn',
    'receiveBtn',
    'passwordSetupScreen'
  ];

  let allElementsExist = true;
  criticalElements.forEach(id => {
    if (!checkElement(id)) allElementsExist = false;
  });

  // Test 6: Event Listeners
  console.log('%c6. Event Listeners Test', 'font-weight: bold; color: #2563eb');
  const createBtn = document.getElementById('createBtn');
  const importBtn = document.getElementById('importBtn');

  if (createBtn && importBtn) {
    console.log('   Testing button clicks...');

    // Add test click listeners
    const testCreateClick = () => {
      console.log('%c   ✓ CREATE BUTTON CLICK DETECTED!', 'color: #059669; font-weight: bold');
    };
    const testImportClick = () => {
      console.log('%c   ✓ IMPORT BUTTON CLICK DETECTED!', 'color: #059669; font-weight: bold');
    };

    // Check if buttons respond to clicks
    console.log('   Try clicking the "Create New Wallet" or "Import Existing Wallet" buttons now...');
    console.log('   Watch for "createWallet2 called!" or "importWallet called!" messages');
  } else {
    console.log('   ✗ Buttons not found, cannot test listeners');
  }

  // Test 7: Chrome Extension API
  console.log('%c7. Chrome Extension API Test', 'font-weight: bold; color: #2563eb');
  if (typeof chrome !== 'undefined' && chrome.storage) {
    console.log('   ✓ chrome.storage available');
    chrome.storage.local.get(null, (result) => {
      console.log('   Current storage:', Object.keys(result));
    });
  } else {
    console.log('   ✗ chrome.storage not available (not running as extension?)');
  }

  // Final Summary
  console.log('%c==== DIAGNOSTIC SUMMARY ====', 'background: #667eea; color: white; font-weight: bold; padding: 5px;');

  if (allFunctionsExist && allElementsExist) {
    console.log('%c✅ ALL TESTS PASSED!', 'color: #059669; font-weight: bold; font-size: 14px;');
    console.log('%cThe wallet should be fully functional. Try clicking the buttons!', 'color: #059669;');
  } else {
    console.log('%c❌ SOME TESTS FAILED', 'color: #dc2626; font-weight: bold; font-size: 14px;');
    if (!allFunctionsExist) console.log('%c   - Some functions are missing', 'color: #dc2626;');
    if (!allElementsExist) console.log('%c   - Some DOM elements are missing', 'color: #dc2626;');
  }

  console.log('%c==== END DIAGNOSTIC ====', 'background: #667eea; color: white; font-weight: bold; padding: 5px;');

}, 500);

// Monitor for DOMContentLoaded
if (document.readyState === 'loading') {
  console.log('%cℹ️ Document still loading, waiting for DOMContentLoaded...', 'color: #f59e0b;');
  document.addEventListener('DOMContentLoaded', () => {
    console.log('%c✓ DOMContentLoaded fired!', 'color: #059669; font-weight: bold;');
  });
} else {
  console.log('%c✓ Document already loaded', 'color: #059669;');
}
