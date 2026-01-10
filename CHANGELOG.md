# Changelog

All notable changes to the GLWM SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial SDK architecture and core components

## [0.1.0] - 2024-01-10

### Added

#### Core Features
- **GLWM Class**: Main SDK entry point with full lifecycle management
- **Wallet Connection**: Support for MetaMask, WalletConnect, Phantom, and Coinbase Wallet
- **License Verification**: ERC721-based NFT license ownership verification
- **Minting Portal**: Integrated minting experience via webview, iframe, or redirect modes
- **Multi-Chain Support**: Ethereum, Polygon, Arbitrum, Optimism, and Base networks

#### State Management
- Reactive state management with subscription support
- Event-driven architecture with typed events
- Automatic state persistence and recovery

#### Developer Experience
- TypeScript-first API with full type definitions
- Comprehensive configuration validation
- Static `validateConfig()` method for pre-initialization checks
- Version information via `getVersion()` static method

#### Infrastructure
- RPC Provider abstraction (Alchemy, Infura, custom endpoints)
- Configurable caching with TTL support
- Logging system with configurable levels and custom handlers
- Error reporting with Sentry integration support
- Secure configuration management with environment variables

#### Testing
- Unit tests for all core components (107+ tests)
- Integration tests for SDK lifecycle
- Acceptance tests for user flows
- Jest test framework with TypeScript support

#### Build & CI/CD
- Makefile for build automation
- GitHub Actions CI pipeline (lint, typecheck, test, build)
- GitHub Actions release pipeline (npm publish, Docker, GitHub releases)
- Docker support for containerized development
- Semantic versioning implementation

#### Configuration
- Environment-specific configurations (development, staging, production)
- Support for multiple RPC providers
- Flexible minting portal configuration

#### Documentation
- Comprehensive README with quickstart guide
- User stories documentation
- API documentation
- Environment configuration guide

### Security
- Input validation for all configuration options
- Address validation for Ethereum addresses
- Secure storage of sensitive configuration
- No hardcoded secrets or API keys

### Dependencies
- ethers.js v6.x for blockchain interactions
- TypeScript 5.x for type safety
- Jest for testing
- ESLint + Prettier for code quality

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 0.1.0 | 2024-01-10 | Initial release with core SDK functionality |

---

## Migration Guides

### Upgrading to 0.1.0

This is the initial release. No migration required.

---

## Links

- [GitHub Repository](https://github.com/kase1111-hash/Game-Wallet)
- [npm Package](https://www.npmjs.com/package/@glwm/sdk)
- [Documentation](https://github.com/kase1111-hash/Game-Wallet#readme)
- [Issue Tracker](https://github.com/kase1111-hash/Game-Wallet/issues)
