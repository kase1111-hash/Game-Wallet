# Changelog

All notable changes to the GLWM SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Unit tests for all 4 core modules: RPCProvider, WalletConnector, LicenseVerifier, MintingPortal
- Integration test for `verifyAndPlay()` orchestration flow
- Shared test mocks for EIP-1193 provider, RPC provider, ERC-721 contract, browser globals

### Changed
- README replaced with focused developer README (~3KB, down from 97KB)
- `docs/quickstart.md` rewritten with accurate API and troubleshooting
- `docs/api.md` rewritten with accurate types matching actual source code

### Fixed
- The SDK no longer stays in `minting_portal_open` / `minting_in_progress` after the minting
  portal fails to open or closes on its own (close button, overlay click, `PORTAL_CLOSED`,
  auto-close after a mint, the `verifyAndPlay()` timeout), which made every later
  `verifyAndPlay()` throw "Minting is already in progress". A minting state is now reported only
  while the portal is open: `minting_portal_open` and `OPEN_MINTING_PORTAL` come after the portal
  opens (not before, and not at all if it fails to open), and every close leaves the minting state
  the way `closeMintingPortal()` always did, before `mintingPortal.onClose` runs
- `openMintingPortal()` while the portal is already open (or still opening, e.g. a double-click)
  no longer resets `minting_in_progress`, emits a second `OPEN_MINTING_PORTAL`, or stacks a second
  portal overlay; `closeMintingPortal()` with no portal open no longer changes the state

### Removed
- Unused utilities: `Metrics.ts`, `ErrorReporter.ts`, `Config.ts` and their tests
- Stub methods: `getMintConfig()`, `mint()`, `fetchMintConfig()`, `executeMint()`
- Phantom `webview` portal mode (was just an alias for iframe)
- `walletconnect` provider type (no implementation existed)
- Infrastructure files: `Dockerfile`, `docker-compose.yml`, `Makefile`, `config/` directory
- Obsolete docs: `architecture.md`, `FAQ.md`, `troubleshooting.md`, `user-stories.md`, `compliance.md`, `code-audit.md`
- Redundant community files: `SUPPORT.md`, `LICENSE.md` (MIT license remains in `LICENSE`)

## [0.1.0] - 2024-01-10

### Added

#### Core Features
- **GLWM Class**: Main SDK entry point with full lifecycle management
- **Wallet Connection**: Support for MetaMask, Phantom, and Coinbase Wallet
- **License Verification**: ERC721-based NFT license ownership verification
- **Minting Portal**: Integrated minting experience via iframe or redirect modes
- **Multi-Chain Support**: Ethereum, Polygon, Arbitrum, Optimism, and Base networks

#### State Management
- Reactive state management with subscription support
- Event-driven architecture with typed events

#### Developer Experience
- TypeScript-first API with full type definitions
- Comprehensive configuration validation
- Static `validateConfig()` method for pre-initialization checks

#### Infrastructure
- RPC Provider abstraction (Alchemy, Infura, custom endpoints)
- Configurable caching with TTL support
- Logging system with configurable levels
- Jest test framework with TypeScript support
- GitHub Actions CI pipeline (lint, typecheck, test, build)
- tsup build for dual CJS/ESM output

### Dependencies
- ethers.js v6.x for blockchain interactions
- TypeScript 5.x for type safety
- Jest for testing
- ESLint + Prettier for code quality

---

## Links

- [GitHub Repository](https://github.com/kase1111-hash/Game-Wallet)
- [npm Package](https://www.npmjs.com/package/@glwm/sdk)
