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
│  │  │   Manager     │ │   Emitter     │ │        Manager            │  │   │
│  │  └───────────────┘ └───────────────┘ └───────────────────────────┘  │   │
│  │                                                                      │   │
│  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────────────────┐  │   │
│  │  │    Wallet     │ │   License     │ │       Minting             │  │   │
│  │  │  Connector    │ │   Verifier    │ │       Portal              │  │   │
│  │  └───────────────┘ └───────────────┘ └───────────────────────────┘  │   │
│  │                                                                      │   │
│  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────────────────┐  │   │
│  │  │     RPC       │ │    Cache      │ │       Logger /            │  │   │
│  │  │   Provider    │ │   Manager     │ │    Error Reporter         │  │   │
│  │  └───────────────┘ └───────────────┘ └───────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            External Services                                 │
├─────────────────┬─────────────────┬─────────────────┬───────────────────────┤
│   Wallet        │   Blockchain    │   Minting       │    Error              │
│   Providers     │   RPC Nodes     │   Portal        │    Reporting          │
│  (MetaMask,     │  (Alchemy,      │   (External     │    (Sentry)           │
│   WalletConnect)│   Infura)       │    Service)     │                       │
└─────────────────┴─────────────────┴─────────────────┴───────────────────────┘
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
│ • Connection     │ │ • Balance check  │ │   (webview,      │
│   management     │ │ • Token lookup   │ │    iframe,       │
│ • Chain switch   │ │ • Ownership      │ │    redirect)     │
│ • Event handling │ │   verification   │ │ • Callbacks      │
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
│ • Rate limiting                         │
└─────────────────────────────────────────┘
```

### Support Components

```
┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│       Cache       │  │      Logger       │  │   ErrorReporter   │
│                   │  │                   │  │                   │
│ • TTL-based cache │  │ • Log levels      │  │ • Sentry support  │
│ • Verification    │  │ • Custom handlers │  │ • Breadcrumbs     │
│   result storage  │  │ • Context support │  │ • User context    │
│ • LocalStorage    │  │ • Formatting      │  │ • Error wrapping  │
└───────────────────┘  └───────────────────┘  └───────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│                            Config                                  │
│                                                                   │
│ • Environment variable loading                                    │
│ • Sensitive value masking                                         │
│ • Configuration building                                          │
│ • Validation                                                      │
└───────────────────────────────────────────────────────────────────┘
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
     │ LicenseStatus  │                │                │
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
     │                │ (iframe/webview)               │
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
         ▼                           │
┌─────────────────┐                  │
│      READY      │◄─────────────────┘
└────────┬────────┘    (retry/reconnect)
         │
         │ openMintingPortal()
         ▼
┌─────────────────┐
│    MINTING      │
└────────┬────────┘
         │
         │ complete/cancel
         ▼
┌─────────────────┐
│      READY      │
└─────────────────┘
```

## Directory Structure

```
glwm-sdk/
├── src/
│   ├── index.ts              # Public exports
│   ├── GLWM.ts               # Main SDK class
│   ├── types/
│   │   └── index.ts          # Type definitions
│   ├── rpc/
│   │   └── RPCProvider.ts    # RPC abstraction
│   ├── wallet/
│   │   └── WalletConnector.ts # Wallet management
│   ├── license/
│   │   └── LicenseVerifier.ts # License verification
│   ├── minting/
│   │   └── MintingPortal.ts  # Minting portal
│   └── utils/
│       ├── Cache.ts          # Caching utility
│       ├── Logger.ts         # Logging system
│       ├── ErrorReporter.ts  # Error reporting
│       ├── Config.ts         # Configuration
│       └── helpers.ts        # Helper functions
├── config/
│   ├── index.ts              # Config loader
│   ├── development.ts        # Dev settings
│   ├── staging.ts            # Staging settings
│   └── production.ts         # Production settings
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── acceptance/           # Acceptance tests
├── docs/
│   ├── api.md                # API documentation
│   ├── architecture.md       # This file
│   └── user-stories.md       # User stories
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

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Development                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Local     │  │   Docker    │  │    Testnet RPC          │  │
│  │   Build     │  │   Compose   │  │    (Mumbai/Sepolia)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Staging                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   GitHub    │  │   Docker    │  │    Testnet RPC          │  │
│  │   Actions   │  │   Registry  │  │    (with API keys)      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Production                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │    npm      │  │    GHCR     │  │    Mainnet RPC          │  │
│  │   Registry  │  │   (Docker)  │  │    (Alchemy/Infura)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```
