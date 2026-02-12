# GLWM SDK Architecture

## System Overview

The Game License Wallet Module (GLWM) SDK provides a complete solution for NFT-based game license verification.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Game Application                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                           GLWM SDK                                   │   │
│  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────────────────┐  │   │
│  │  │    State      │ │    Event      │ │      Configuration        │  │   │
│  │  │   Manager     │ │   Emitter     │ │        Validation         │  │   │
│  │  └───────────────┘ └───────────────┘ └───────────────────────────┘  │   │
│  │                                                                      │   │
│  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────────────────┐  │   │
│  │  │    Wallet     │ │   License     │ │       Minting             │  │   │
│  │  │  Connector    │ │   Verifier    │ │       Portal              │  │   │
│  │  └───────────────┘ └───────────────┘ └───────────────────────────┘  │   │
│  │                                                                      │   │
│  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────────────────┐  │   │
│  │  │     RPC       │ │    Cache      │ │       Logger              │  │   │
│  │  │   Provider    │ │   Manager     │ │                           │  │   │
│  │  └───────────────┘ └───────────────┘ └───────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            External Services                                 │
├─────────────────┬─────────────────┬─────────────────────────────────────────┤
│   Wallet        │   Blockchain    │   Minting                               │
│   Providers     │   RPC Nodes     │   Portal                                │
│  (MetaMask,     │  (Alchemy,      │   (External                             │
│   Phantom,      │   Infura)       │    Service)                             │
│   Coinbase)     │                 │                                         │
└─────────────────┴─────────────────┴─────────────────────────────────────────┘
```

## Component Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                           GLWM (Main Class)                      │
│                                                                  │
│  Responsibilities:                                               │
│  • SDK initialization and lifecycle management                   │
│  • Configuration validation                                      │
│  • Component orchestration                                       │
│  • Public API exposure                                           │
└──────────────────────────────┬──────────────────────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ WalletConnector  │ │ LicenseVerifier  │ │  MintingPortal   │
│                  │ │                  │ │                  │
│ • Provider       │ │ • Contract       │ │ • URL management │
│   detection      │ │   interaction    │ │ • Mode handling  │
│ • Connection     │ │ • Balance check  │ │   (iframe,       │
│   management     │ │ • Token lookup   │ │    redirect)     │
│ • Chain switch   │ │ • Ownership      │ │ • postMessage    │
│ • Event handling │ │   verification   │ │   communication  │
└────────┬─────────┘ └────────┬─────────┘ └──────────────────┘
         │                    │
         │                    │
         ▼                    ▼
┌─────────────────────────────────────────┐
│              RPCProvider                 │
│                                         │
│ • Provider abstraction (Alchemy/Infura) │
│ • Connection management                 │
│ • Request handling with retry           │
│ • Fallback URL support                  │
└─────────────────────────────────────────┘
```

### Support Components

```
┌───────────────────┐  ┌───────────────────┐
│       Cache       │  │      Logger       │
│                   │  │                   │
│ • TTL-based cache │  │ • Log levels      │
│ • Verification    │  │ • Custom handlers │
│   result storage  │  │ • Context support │
│ • Per-address     │  │ • Formatting      │
│   invalidation    │  │ • Log history     │
└───────────────────┘  └───────────────────┘
```

## Data Flow Diagrams

### 1. SDK Initialization Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Game    │     │   GLWM   │     │   RPC    │     │Blockchain│
│  App     │     │   SDK    │     │ Provider │     │  Node    │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ new GLWM(cfg)  │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ Validate config│                │
     │                │───────┐        │                │
     │                │       │        │                │
     │                │<──────┘        │                │
     │                │                │                │
     │ initialize()   │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ Connect to RPC │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │                │ eth_chainId    │
     │                │                │───────────────>│
     │                │                │                │
     │                │                │<───────────────│
     │                │                │   chainId      │
     │                │<───────────────│                │
     │                │  Connected     │                │
     │                │                │                │
     │<───────────────│                │                │
     │  Ready         │                │                │
     │                │                │                │
```

### 2. Wallet Connection Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Game    │     │   GLWM   │     │  Wallet  │     │  User    │
│  App     │     │   SDK    │     │ Provider │     │          │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │connectWallet() │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ Detect provider│                │
     │                │───────────────>│                │
     │                │                │                │
     │                │<───────────────│                │
     │                │ Provider found │                │
     │                │                │                │
     │                │ Request connect│                │
     │                │───────────────>│                │
     │                │                │                │
     │                │                │ Show popup     │
     │                │                │───────────────>│
     │                │                │                │
     │                │                │<───────────────│
     │                │                │ User approves  │
     │                │                │                │
     │                │<───────────────│                │
     │                │ Address, Chain │                │
     │                │                │                │
     │<───────────────│                │                │
     │ WALLET_CONNECTED                │                │
     │ event          │                │                │
     │                │                │                │
```

### 3. License Verification Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Game    │     │   GLWM   │     │  Cache   │     │ Contract │
│  App     │     │   SDK    │     │          │     │ (ERC721) │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │verifyLicense() │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ Check cache    │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │<───────────────│                │
     │                │ Cache miss     │                │
     │                │                │                │
     │                │ balanceOf()    │                │
     │                │───────────────────────────────>│
     │                │                │                │
     │                │<───────────────────────────────│
     │                │ balance > 0    │                │
     │                │                │                │
     │                │ tokenOfOwnerByIndex()          │
     │                │───────────────────────────────>│
     │                │                │                │
     │                │<───────────────────────────────│
     │                │ tokenId        │                │
     │                │                │                │
     │                │ Store in cache │                │
     │                │───────────────>│                │
     │                │                │                │
     │<───────────────│                │                │
     │ LicenseVerification             │                │
     │ Result         │                │                │
     │ {isValid: true}│                │                │
     │                │                │                │
```

### 4. Minting Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Game    │     │   GLWM   │     │ Minting  │     │  User    │
│  App     │     │   SDK    │     │ Portal   │     │          │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │openMinting     │                │                │
     │Portal()        │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ Open portal    │                │
     │                │ (iframe/redirect)               │
     │                │───────────────>│                │
     │                │                │                │
     │                │                │ Display mint UI│
     │                │                │───────────────>│
     │                │                │                │
     │                │                │<───────────────│
     │                │                │ User mints     │
     │                │                │                │
     │                │<───────────────│                │
     │                │ postMessage    │                │
     │                │ {tokenId, tx}  │                │
     │                │                │                │
     │<───────────────│                │                │
     │ MINT_COMPLETED │                │                │
     │ event          │                │                │
     │                │                │                │
```

## State Machine

```
                              ┌─────────────────┐
                              │  UNINITIALIZED  │
                              └────────┬────────┘
                                       │
                                       │ initialize()
                                       ▼
                              ┌─────────────────┐
                              │  INITIALIZING   │
                              └────────┬────────┘
                                       │
                         ┌─────────────┴─────────────┐
                         │                           │
                    Success                        Error
                         │                           │
                         ▼                           ▼
              ┌─────────────────┐          ┌─────────────────┐
              │ AWAITING_WALLET │          │      ERROR      │
              └────────┬────────┘          └─────────────────┘
                       │
                       │ connectWallet()
                       ▼
              ┌─────────────────┐
              │CONNECTING_WALLET│
              └────────┬────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
    Success                        Error
         │                           │
         ▼                           │
┌─────────────────┐                  │
│VERIFYING_LICENSE│                  │
└────────┬────────┘                  │
         │                           │
    ┌────┴────┐                      │
    │         │                      │
  Valid    No license                │
    │         │                      │
    ▼         ▼                      │
┌────────┐  ┌────────────┐          │
│LICENSE │  │ NO_LICENSE  │◄─────────┘
│_VALID  │  └─────┬──────┘  (retry/reconnect)
└────────┘        │
                  │ openMintingPortal()
                  ▼
         ┌──────────────────┐
         │ MINTING_PORTAL   │
         │ _OPEN            │
         └────────┬─────────┘
                  │
                  │ mint started
                  ▼
         ┌──────────────────┐
         │ MINTING_IN       │
         │ _PROGRESS        │
         └────────┬─────────┘
                  │
                  │ complete/cancel
                  ▼
         (re-verify → LICENSE_VALID or NO_LICENSE)
```

## Directory Structure

```
Game-Wallet/
├── src/
│   ├── index.ts              # Public exports
│   ├── GLWM.ts               # Main SDK class
│   ├── types/
│   │   └── index.ts          # Type definitions
│   ├── rpc/
│   │   ├── RPCProvider.ts    # RPC abstraction
│   │   └── index.ts
│   ├── wallet/
│   │   ├── WalletConnector.ts # Wallet management
│   │   └── index.ts
│   ├── license/
│   │   ├── LicenseVerifier.ts # License verification
│   │   └── index.ts
│   ├── minting/
│   │   ├── MintingPortal.ts  # Minting portal
│   │   └── index.ts
│   └── utils/
│       ├── Cache.ts          # TTL-based caching
│       ├── Logger.ts         # Logging system
│       ├── helpers.ts        # Helper functions
│       └── index.ts
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   ├── acceptance/           # Acceptance tests
│   ├── regression/           # Regression tests
│   ├── performance/          # Performance benchmarks
│   └── mocks/                # Test mocks
├── docs/
│   ├── api.md                # API documentation
│   ├── architecture.md       # This file
│   ├── quickstart.md         # Getting started guide
│   ├── FAQ.md                # Frequently asked questions
│   ├── troubleshooting.md    # Common issues & solutions
│   ├── user-stories.md       # User stories
│   ├── compliance.md         # Compliance docs
│   └── code-audit.md         # Code audit findings
└── .github/
    └── workflows/
        ├── ci.yml            # CI pipeline
        └── release.yml       # Release pipeline
```

## Security Model

```
┌─────────────────────────────────────────────────────────────────┐
│                      Security Layers                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Input Validation                                         │   │
│  │ • Address format validation (checksummed Ethereum)       │   │
│  │ • Chain ID validation                                    │   │
│  │ • URL validation for minting portal                      │   │
│  │ • Configuration schema validation                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Secure Configuration                                     │   │
│  │ • Environment variables for secrets                      │   │
│  │ • Sensitive value masking in logs                        │   │
│  │ • No hardcoded API keys                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Wallet Security                                          │   │
│  │ • User-controlled signing (no private key access)        │   │
│  │ • Chain verification before transactions                 │   │
│  │ • Clear user prompts for all actions                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Error Handling                                           │   │
│  │ • Sanitized error messages (no sensitive data)           │   │
│  │ • Structured error codes                                 │   │
│  │ • Graceful degradation                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```
