// Minimal test version
console.log('🔥 Service worker starting...');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message:', request);
  sendResponse({ ok: true });
  return true;
});

console.log('✅ Service worker ready!');
