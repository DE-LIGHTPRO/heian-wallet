# 🏦 HEIAN Wallet

**A secure, non-custodial Chrome extension wallet for Tempo blockchain stablecoins.**

<div align="center">

[![Install from Chrome Web Store](https://img.shields.io/badge/Install_from-Chrome_Web_Store-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/heian-wallet/bgepdfmijeimlkckojgdgakapabjmdpc)

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Live on Chrome Store](https://img.shields.io/badge/Status-Live-success)](https://chromewebstore.google.com/detail/heian-wallet/bgepdfmijeimlkckojgdgakapabjmdpc)

</div>

---

## ✨ Features

### Core Functionality
- 🪙 **5 Tempo Stablecoins** - AlphaUSD, BetaUSD, pathUSD, ThetaUSD, KlarnaUSD
- 🔄 **Built-in Token Swap** - Swap between stablecoins with slippage control
- 📊 **Batch CSV Payments** - Send to 100+ addresses at once (perfect for payroll)
- 👤 **Multi-Account HD Wallet** - BIP-39/44 standard implementation
- 🌐 **ENS Resolution** - Use .eth names for easy payments
- 🔌 **dApp Connector** - Works with Uniswap and all Web3 apps
- 📜 **Transaction History** - Auto-refresh every 15 seconds
- 📤 **CSV Export** - Export transactions for accounting

### Security
- 🔐 **AES-256-GCM Encryption** - Military-grade key protection
- 🔑 **Non-Custodial** - You control your private keys
- 🔒 **Password Protected** - With auto-lock feature
- 🚫 **No Data Transmission** - Everything stays local
- ✅ **No Remote Code Loading** - All code bundled in extension

### User Experience
- 🌙 **Dark Mode** - Full theme support
- 🎨 **Greek Letter Icons** - α, β, π, θ for visual clarity
- 📱 **Responsive Design** - Works at any browser size
- ⚡ **Smart Number Formatting** - Shows "1.5M" instead of "1,500,000"
- 💼 **Contact Management** - Save frequently used addresses
- 🔗 **Payment Links** - Generate shareable payment requests

---

## 📸 Screenshots

### Main Dashboard
Clean interface showing all token balances with quick access to Send/Receive/Swap.

### Token Swap
Built-in swap with real-time exchange rates and slippage control.

### Batch Payments
Import CSV and send to 100+ addresses with one click.

### dApp Integration
Seamless connection to any Web3 application.

---

## 🚀 Installation

### From Chrome Web Store (Recommended) ⭐

**[Install HEIAN Wallet from Chrome Web Store](https://chromewebstore.google.com/detail/heian-wallet/bgepdfmijeimlkckojgdgakapabjmdpc)** - One-click installation!

### Manual Installation (For Developers)

1. **Download this repository**
   ```bash
   git clone https://github.com/yourusername/heian-wallet.git
   cd heian-wallet
   ```

2. **Load in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable **"Developer mode"** (top right)
   - Click **"Load unpacked"**
   - Select the `heian-wallet` folder
   - Done! The wallet icon appears in your toolbar

3. **First Use**
   - Click the HEIAN Wallet icon
   - Choose "Create New Wallet" or "Import Existing"
   - Set a strong password
   - **IMPORTANT:** Save your 12-word recovery phrase securely
   - You're ready to go!

---

## 🔧 Technical Details

### Built With
- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **Blockchain:** ethers.js v6
- **Encryption:** Web Crypto API (AES-256-GCM)
- **Storage:** Chrome Storage API
- **Standards:** BIP-39 (mnemonic), BIP-44 (HD paths)

### Architecture
- **Manifest V3** - Latest Chrome extension standard
- **Local-First** - No backend required
- **Modular Code** - Clean, maintainable structure
- **8,441 lines of code** - Production-ready implementation

### Project Structure
```
heian-wallet/
├── manifest.json          # Extension configuration
├── privacy-policy.html    # Privacy policy
├── public/
│   ├── popup.html        # Main UI (110KB)
│   ├── popup.js          # Core logic (191KB)
│   ├── background.js     # Background service worker
│   ├── content.js        # Content script for dApp injection
│   ├── inpage.js         # Web3 provider injection
│   ├── ethers.min.js     # Blockchain library
│   └── icons/            # Extension icons
└── README.md             # This file
```

---

## 📖 Usage Guide

### Creating Your First Wallet
1. Click the HEIAN Wallet icon
2. Select "Create New Wallet"
3. Set a secure password (8+ characters)
4. Write down your 12-word recovery phrase **on paper**
5. Confirm your recovery phrase
6. Done!

### Sending Tokens
1. Go to the **Send** tab
2. Enter recipient address (or ENS name like `vitalik.eth`)
3. Select token and amount
4. Review transaction details
5. Confirm and sign

### Swapping Tokens
1. Go to the **Swap** tab
2. Select "From" token and amount
3. Select "To" token
4. Review exchange rate and slippage
5. Confirm swap

### Batch Payments (CSV)
1. Go to **Send** → **Batch** tab
2. Upload CSV file or paste addresses
   ```
   0x1234...,10.5
   0x5678...,20.0
   ```
3. Review payment list
4. Confirm and send to all

### Connecting to dApps
1. Visit any Web3 app (e.g., Uniswap)
2. Click "Connect Wallet"
3. Select HEIAN Wallet from the list
4. Approve connection
5. Start using the dApp!

---

## 🔐 Security Best Practices

### DO:
✅ Write your recovery phrase on paper
✅ Store it in a safe place (not on your computer)
✅ Use a strong password
✅ Enable auto-lock
✅ Verify addresses before sending

### DON'T:
❌ Share your recovery phrase with anyone
❌ Store recovery phrase digitally (photos, notes, cloud)
❌ Use the same password as other services
❌ Trust unsolicited messages asking for your phrase
❌ Send all your funds at once (test with small amounts first)

**Remember:** Your recovery phrase = your funds. If someone gets it, they can take your money. If you lose it, your funds are gone forever.

---

## 🛣️ Roadmap

### Current Status
- ✅ Core wallet functionality
- ✅ All 5 Tempo stablecoins supported
- ✅ Built-in swap
- ✅ Batch CSV payments
- ✅ dApp connector
- ✅ **LIVE on Chrome Web Store** 🎉

### Planned Features
- [ ] Hardware wallet support (Ledger, Trezor)
- [ ] Mobile app version
- [ ] Multi-language support
- [ ] Price charts and analytics
- [ ] Gas optimization suggestions
- [ ] NFT support
- [ ] Staking integration

---

## 📊 Stats

| Metric | Value |
|--------|-------|
| Development Time | 8 days |
| Lines of Code | 8,441 |
| Screens | 20 |
| Package Size | 596 KB |
| Supported Tokens | 5 stablecoins |
| Security Standard | AES-256-GCM |

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Report Bugs** - Open an issue with details
2. **Suggest Features** - Share your ideas
3. **Improve Documentation** - Fix typos, add examples
4. **Code Contributions** - Submit pull requests

### Development Setup
```bash
# Clone the repository
git clone https://github.com/yourusername/heian-wallet.git
cd heian-wallet

# Load in Chrome for testing
# chrome://extensions/ → Load unpacked → select folder

# Make changes to files in public/

# Reload extension to see changes
# chrome://extensions/ → Click reload button
```

---

## 📝 License

MIT License - See [LICENSE](LICENSE) file for details

---

## 📧 Support

- **Email:** heianwallet@gmail.com
- **Website:** https://tempo.xyz
- **Privacy Policy:** https://de-lightpro.github.io/heian-wallet-privacy-policy/
- **Issues:** [GitHub Issues](https://github.com/yourusername/heian-wallet/issues)

---

## ⚠️ Disclaimer

This wallet is provided "as is" without warranty of any kind. Use at your own risk. Always:
- Test with small amounts first
- Verify transaction details carefully
- Keep your recovery phrase secure
- Never share your private keys

The developers are not responsible for any loss of funds.

---

## 🙏 Acknowledgments

- Built for the [Tempo](https://tempo.xyz) blockchain ecosystem
- Powered by [ethers.js](https://docs.ethers.org/)
- Icons by [Feather Icons](https://feathericons.com/)
- Follows [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) and [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki) standards

---

## 📈 Status

🟢 **LIVE ON CHROME WEB STORE**

**[→ Install Now](https://chromewebstore.google.com/detail/heian-wallet/bgepdfmijeimlkckojgdgakapabjmdpc)** - Available for public download!

Built with ❤️ for the Tempo community

---

**⭐ Star this repo if you find it useful!**
