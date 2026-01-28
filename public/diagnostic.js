// Diagnostic script to check if everything is loading correctly
console.log('==== HEIAN WALLET DIAGNOSTIC ====');
console.log('1. Diagnostic script loaded ✓');
console.log('2. Document ready state:', document.readyState);
console.log('3. Checking for required libraries...');
console.log('   - ethers:', typeof ethers !== 'undefined' ? '✓' : '✗ MISSING');
console.log('   - feather:', typeof feather !== 'undefined' ? '✓' : '✗ MISSING');
console.log('   - QRCode:', typeof QRCode !== 'undefined' ? '✓' : '✗ MISSING');

console.log('4. Checking for buttons...');
setTimeout(() => {
  const createBtn = document.getElementById('createBtn');
  const importBtn = document.getElementById('importBtn');

  console.log('   - createBtn:', createBtn ? '✓ Found' : '✗ NOT FOUND');
  console.log('   - importBtn:', importBtn ? '✓ Found' : '✗ NOT FOUND');

  if (createBtn) {
    console.log('   - createBtn has click listener:', createBtn.onclick ? 'inline' : 'addEventListener');
    console.log('   - createBtn is visible:', createBtn.offsetParent !== null);
    console.log('   - createBtn is disabled:', createBtn.disabled);
  }

  console.log('5. Checking for popup.js functions...');
  console.log('   - createWallet2:', typeof createWallet2 !== 'undefined' ? '✓' : '✗ MISSING');
  console.log('   - importWallet:', typeof importWallet !== 'undefined' ? '✓' : '✗ MISSING');
  console.log('   - attachListeners:', typeof attachListeners !== 'undefined' ? '✓' : '✗ MISSING');

  console.log('==== END DIAGNOSTIC ====');
}, 500);
