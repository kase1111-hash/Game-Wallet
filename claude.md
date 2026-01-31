# Claude.md - GLWM SDK

## Project Overview

Game License Wallet Module (GLWM) is a TypeScript SDK for implementing NFT-based license verification for game developers. It enables wallet authentication, on-chain NFT license verification, and seamless minting flows.

**Package**: `@glwm/sdk` | **Version**: 0.1.0 | **License**: MIT

## Key Commands

```bash
# Development
npm install          # Install dependencies
npm run build        # Build to dist/ (CJS + ESM)
npm run dev          # Build with watch mode

# Testing
npm test             # Run all tests (212 tests)
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report

# Code Quality
npm run lint         # Run ESLint
npm run lint:fix     # Auto-fix lint issues
npm run format       # Format with Prettier
npm run typecheck    # TypeScript type checking

# Convenience (Makefile)
make validate        # Full CI: lint, typecheck, test, build
make pre-commit      # Pre-commit checks
```

## Architecture

```
src/
├── GLWM.ts              # Main orchestrator class (entry point)
├── wallet/              # Wallet connection (MetaMask, Coinbase, Phantom)
│   └── WalletConnector.ts
├── license/             # On-chain ERC-721 verification
│   └── LicenseVerifier.ts
├── minting/             # Minting portal UI (webview/iframe/redirect)
│   └── MintingPortal.ts
├── rpc/                 # RPC provider with fallback and retry
│   └── RPCProvider.ts
├── types/               # TypeScript type definitions
│   └── index.ts
└── utils/               # Utilities (Cache, Logger, Metrics, ErrorReporter)
```

**State Flow**: `uninitialized → initializing → awaiting_wallet → connecting_wallet → verifying_license → license_valid/no_license → minting_portal_open → minting_in_progress`

## Code Style

- **TypeScript strict mode** with all strict checks enabled
- **ESLint** + **Prettier** for formatting
- Explicit function return types required
- No `any` types allowed
- Use `===` for equality checks
- Prefer `const` over `let`
- Unused variables prefixed with `_`
- JSDoc comments for public APIs

## Testing Guidelines

- Test files in `tests/` directory (unit, integration, acceptance, regression, performance)
- Jest with ts-jest for TypeScript support
- Mock external dependencies (wallets, RPC providers)
- Test all state transitions and error cases
- Coverage target: maintain existing levels

## Key Files

| File | Purpose |
|------|---------|
| `src/GLWM.ts` | Main SDK class - orchestrates all components |
| `src/types/index.ts` | All TypeScript interfaces and types |
| `src/wallet/WalletConnector.ts` | EIP-1193 wallet integration |
| `src/license/LicenseVerifier.ts` | ERC-721 license verification |
| `src/rpc/RPCProvider.ts` | Resilient RPC with fallback |
| `tests/unit/GLWM.test.ts` | Main test suite |
| `.env.example` | Environment configuration template |

## Configuration

Copy `.env.example` to `.env` and configure:
- `GLWM_RPC_PROVIDER`: alchemy, infura, or custom
- `GLWM_LICENSE_CONTRACT`: NFT contract address
- `GLWM_CHAIN_ID`: Target chain (1=Mainnet, 137=Polygon)
- `GLWM_MINTING_PORTAL_URL`: Minting UI URL

## Development Notes

- **Dependencies**: ethers.js 6.9.0 for blockchain interaction
- **Node.js**: >= 18.0.0 required
- **Output**: CJS (`dist/index.js`) + ESM (`dist/index.mjs`) + types
- **Event-driven**: Subscribe to state changes via `glwm.subscribe()` or `glwm.on()`
- **Caching**: Verification results cached 5 minutes by default
- **Error handling**: Typed `GLWMError` with recovery indicators

## Not Yet Implemented

- WalletConnect provider support
- Direct minting (use `openMintingPortal()` instead)
- Native WebView support (falls back to iframe)

## Commit Convention

Use Conventional Commits: `feat(scope):`, `fix(scope):`, `docs:`, `test:`, `chore:`
