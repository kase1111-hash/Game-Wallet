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
- When the minting portal closes, `CLOSE_MINTING_PORTAL` now fires before
  `mintingPortal.onClose` (it used to fire after), and `MintingPortal` runs its owner's `onClose`
  callback before `config.onClose`
- `closeMintingPortal()` no longer resets a non-minting state such as `license_valid` or `error`
  (call `initialize()` to recover from `error`)
- License verification resolves only with a verdict (valid, `no_license_found`,
  `license_expired`). When the license cannot be verified, `verifyLicense()`,
  `verifyLicenseFresh()`, `verifyAndPlay()`, `checkLicenseForAddress()` and
  `LicenseVerifier.verifyLicense()` now reject with a `GLWMError` instead of resolving with
  `{ isValid: false, reason: 'verification_failed' }` or `'contract_paused'`: `RPC_ERROR` when an
  RPC call fails, `CONTRACT_ERROR` (`recoverable: true`) when the license contract is paused.
  `onLicenseVerified` and `LICENSE_VERIFIED` no longer fire for such a failure, and
  `verifyLicense()` / `verifyAndPlay()` move to the `error` state (call `initialize()` to retry)
- `getLicenseDetails()`, `getAllLicenses()` and the matching `LicenseVerifier` methods report a
  paused license contract as `CONTRACT_ERROR` (was `RPC_ERROR`)
- The `RPC_ERROR` thrown when an RPC call fails (`RPCProvider.call()`) carries a JSON-safe summary
  of the last underlying error as `details` (message, name, and the ethers code / shortMessage /
  reason), and a `suggestedAction`
- A verifier result that is not a verdict (a deprecated or unknown `reason`) is rejected as
  `VERIFICATION_FAILED` instead of being treated as "no license"

### Deprecated
- `LicenseInvalidReason` values `contract_paused` and `verification_failed`: no longer produced
  (see above). They remain in the type so that code checking for them still compiles

### Fixed
- `onError` is now called for every error the SDK surfaces, exactly once, with the error that is
  thrown. It used to miss every error from a component (`initialize()`, `connectWallet()` and
  `verifyLicense()` failures, `switchChain()`, `checkLicenseForAddress()`, `getLicenseDetails()`,
  `getAllLicenses()`, `openMintingPortal()`, portal `MINT_FAILED`) and fired twice on a chain
  mismatch. The documented `ERROR` event is now emitted alongside it. A throwing `onError` or
  `ERROR` handler is logged instead of replacing the SDK's error
- `connectWallet()` reports `WALLET_NOT_FOUND` when no wallet is installed and
  `WALLET_CONNECTION_REJECTED` when the wallet returns no accounts (both were `NETWORK_ERROR`)
- A malformed error from the minting portal (e.g. a string in `MINT_COMPLETED`) no longer breaks
  mint-failure handling and leaves the portal open; portal errors are normalized, and the
  documented `MINT_FAILED` payload gets `recoverable: true`
- Calling `initialize()` again now releases the previous session: it disconnects a connected
  wallet (`WALLET_DISCONNECTED` fires), removes the old wallet listeners and closes an open minting
  portal, so their events are no longer handled twice. `connectWallet()` while already connected no
  longer attaches a second set of wallet listeners
- Calls made while `initialize()` is running are rejected with `CONFIGURATION_ERROR` ("SDK is
  still initializing") instead of failing with internal errors
- The SDK no longer stays in `minting_portal_open` / `minting_in_progress` after the minting
  portal fails to open or closes on its own (close button, overlay click, `PORTAL_CLOSED`,
  auto-close after a mint, the `verifyAndPlay()` timeout), which made every later
  `verifyAndPlay()` throw "Minting is already in progress". A minting state is now reported only
  while the portal is open: `minting_portal_open` and `OPEN_MINTING_PORTAL` come after the portal
  opens (not before, and not at all if it fails to open), and a close that finds the SDK in a
  minting state moves it to `no_license` (wallet connected) or `awaiting_wallet`, before
  `mintingPortal.onClose` runs
- `openMintingPortal()` while the portal is already open (or still opening, e.g. a double-click)
  no longer resets `minting_in_progress`, emits a second `OPEN_MINTING_PORTAL`, or stacks a second
  portal overlay; `closeMintingPortal()` with no portal open no longer changes the state
- A failed RPC call while verifying a license (`balanceOf`, `tokenOfOwnerByIndex`, `tokenURI`) or a
  paused license contract was treated as "no license": it never reached `onError` or the `ERROR`
  event, was cached for the cache TTL, moved the state to `no_license`, and made `verifyAndPlay()`
  open the minting portal, offering a mint to a user who may already own a license (also after a
  mint, when the re-verification failed). It is now an error on every RPC call of the
  verification (see Changed): reported once, never cached, and `verifyAndPlay()` rejects without
  opening the portal. A `verification_failed` / `contract_paused` result cached by an earlier
  version is ignored, and the license is verified again

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
