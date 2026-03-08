# Changelog

All notable changes to HEIAN Wallet will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-03-08

### 🎉 Initial Public Release - Live on Chrome Web Store

#### Added
- **Multi-Account HD Wallet** - BIP-39/44 standard implementation with 12-word mnemonic
- **5 Tempo Stablecoins** - Full support for AlphaUSD, BetaUSD, pathUSD, ThetaUSD, KlarnaUSD
- **Built-in Token Swap** - Swap between stablecoins with configurable slippage control
- **Batch CSV Payments** - Send to 100+ addresses simultaneously (perfect for payroll/DAO distributions)
- **ENS Resolution** - Send to .eth names without needing full addresses
- **dApp Connector** - Full Web3 provider with EIP-6963 support for seamless dApp integration
- **TIP-20 Memo Support** - Invoice tracking and compliance built-in
- **Transaction History** - Auto-refreshing every 15 seconds with CSV export
- **Contact Management** - Save and manage frequently used addresses
- **Payment Links** - Generate shareable payment request links
- **AES-256-GCM Encryption** - Military-grade local key protection
- **Auto-Lock** - Configurable wallet lock timer for security
- **Dark Mode** - Full theme support with CSS variables
- **Responsive Design** - Works at any browser popup size
- **Smart Number Formatting** - Displays "1.5M" instead of "1,500,000"
- **20 Polished Screens** - Complete UI for all wallet operations
- **Chrome Extension Manifest V3** - Latest Chrome extension standard compliance
- **Non-Custodial Architecture** - User controls private keys at all times
- **No Remote Code** - All code bundled locally, no external dependencies at runtime

#### Technical Stats
- 8,441 lines of production code
- 8-day development cycle
- 596 KB package size
- Ethers.js v6 integration
- Web Crypto API for encryption

#### Distribution
- ✅ Published on Chrome Web Store
- ✅ Open source on GitHub

---

## [Unreleased]

### Planned
- Hardware wallet support (Ledger, Trezor)
- Mobile app version (iOS & Android)
- Multi-language support
- Price charts and analytics dashboard
- Gas optimization suggestions
- NFT support
- Staking integration
- Multi-signature wallet support

---

[1.0.0]: https://github.com/DE-LIGHTPRO/heian-wallet/releases/tag/v1.0.0
