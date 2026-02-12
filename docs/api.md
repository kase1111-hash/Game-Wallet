# GLWM SDK API Reference

Complete API documentation for the Game License Wallet Module SDK.

## Table of Contents

- [GLWM Class](#glwm-class)
  - [Constructor](#constructor)
  - [Static Methods](#static-methods)
  - [Instance Methods](#instance-methods)
- [Configuration](#configuration)
  - [GLWMConfig](#glwmconfig)
  - [RPCConfig](#rpcconfig)
  - [MintingPortalConfig](#mintingportalconfig)
  - [CacheConfig](#cacheconfig)
- [Types](#types)
  - [GLWMState](#glwmstate)
  - [WalletSession](#walletsession)
  - [LicenseVerificationResult](#licenseverificationresult)
  - [Events](#events)
- [Errors](#errors)

---

## GLWM Class

The main entry point for the SDK.

```typescript
import { GLWM } from '@glwm/sdk';
```

### Constructor

```typescript
new GLWM(config: GLWMConfig)
```

Creates a new GLWM instance.

**Parameters:**
- `config` (GLWMConfig) - Configuration object for the SDK

**Throws:**
- `Error` - If configuration is invalid

**Example:**
```typescript
const glwm = new GLWM({
  licenseContract: '0x1234567890123456789012345678901234567890',
  chainId: 137,
  rpcProvider: {
    provider: 'alchemy',
    apiKey: 'your-api-key',
  },
  mintingPortal: {
    url: 'https://mint.example.com',
    mode: 'iframe',
  },
});
```

### Static Methods

#### `getVersion()`

Returns the SDK version string.

```typescript
static getVersion(): string
```

**Returns:** Version string in semver format (e.g., "0.1.0")

**Example:**
```typescript
console.log(GLWM.getVersion()); // "0.1.0"
```

---

#### `validateConfig()`

Validates a configuration object without creating an instance.

```typescript
static validateConfig(config: GLWMConfig): { valid: boolean; errors: string[] }
```

**Parameters:**
- `config` (GLWMConfig) - Configuration object to validate

**Returns:** Object with:
- `valid` (boolean) - Whether the configuration is valid
- `errors` (string[]) - Array of validation error messages

**Example:**
```typescript
const result = GLWM.validateConfig(myConfig);
if (!result.valid) {
  console.error('Config errors:', result.errors);
}
```

### Instance Methods

#### `initialize()`

Initializes the SDK, connecting to the RPC provider and setting up all internal components.
Must be called before any other instance methods.

```typescript
async initialize(): Promise<void>
```

**Throws:**
- `GLWMError` - If initialization fails

**Example:**
```typescript
await glwm.initialize();
```

---

#### `dispose()`

Cleans up resources, disconnects wallet, closes portals, and clears all listeners.

```typescript
async dispose(): Promise<void>
```

**Example:**
```typescript
await glwm.dispose();
```

---

#### `getState()`

Returns the current SDK state.

```typescript
getState(): GLWMState
```

**Returns:** A copy of the current state object (discriminated union by `status`)

**Example:**
```typescript
const state = glwm.getState();
console.log(state.status);
// Possible values: 'uninitialized' | 'initializing' | 'awaiting_wallet'
//   | 'connecting_wallet' | 'verifying_license' | 'license_valid'
//   | 'no_license' | 'minting_portal_open' | 'minting_in_progress' | 'error'
```

---

#### `subscribe()`

Subscribes to state changes.

```typescript
subscribe(listener: (state: GLWMState) => void): () => void
```

**Parameters:**
- `listener` - Callback function called on every state change

**Returns:** Unsubscribe function

**Example:**
```typescript
const unsubscribe = glwm.subscribe((state) => {
  console.log('State changed:', state.status);
});

// Later...
unsubscribe();
```

---

#### `on()`

Subscribes to specific events.

```typescript
on<T extends GLWMEvent['type']>(
  event: T,
  handler: (payload: Extract<GLWMEvent, { type: T }>) => void
): () => void
```

**Parameters:**
- `event` - Event type to listen for
- `handler` - Event handler function

**Returns:** Unsubscribe function

**Example:**
```typescript
const unsubscribe = glwm.on('WALLET_CONNECTED', (event) => {
  console.log('Wallet connected:', event.connection.address);
});
```

---

#### `connectWallet()`

Initiates wallet connection.

```typescript
async connectWallet(preferredProvider?: WalletProvider): Promise<WalletConnection>
```

**Parameters:**
- `preferredProvider` (optional) - Specific wallet provider to use. Defaults to `'metamask'`.

**Returns:** Wallet connection details

**Throws:**
- `GLWMError` - If connection fails

**Example:**
```typescript
const connection = await glwm.connectWallet('metamask');
console.log('Connected:', connection.address);
```

---

#### `disconnectWallet()`

Disconnects the current wallet and clears cached verification for that address.

```typescript
async disconnectWallet(): Promise<void>
```

**Example:**
```typescript
await glwm.disconnectWallet();
```

---

#### `getWalletSession()`

Returns current wallet session information.

```typescript
getWalletSession(): WalletSession
```

**Returns:** Current wallet session

**Example:**
```typescript
const session = glwm.getWalletSession();
if (session.isConnected) {
  console.log('Address:', session.connection?.address);
}
```

---

#### `isProviderAvailable()`

Checks if a specific wallet provider is available in the current environment.

```typescript
isProviderAvailable(provider: WalletProvider): boolean
```

**Parameters:**
- `provider` - Provider name to check

**Returns:** Whether the provider is available

---

#### `getAvailableProviders()`

Returns list of available wallet providers.

```typescript
getAvailableProviders(): WalletProvider[]
```

**Returns:** Array of available provider names

**Example:**
```typescript
const providers = glwm.getAvailableProviders();
// ['metamask', 'coinbase', ...]
```

---

#### `switchChain()`

Requests a chain switch if the wallet is connected to the wrong network.

```typescript
async switchChain(chainId: ChainId): Promise<void>
```

**Parameters:**
- `chainId` - The EIP-155 chain ID to switch to

**Example:**
```typescript
await glwm.switchChain(137); // Switch to Polygon
```

---

#### `verifyLicense()`

Verifies NFT license ownership for the connected wallet. Uses cache if available and not expired.

```typescript
async verifyLicense(): Promise<LicenseVerificationResult>
```

**Returns:** License verification result

**Throws:**
- `GLWMError` with code `WALLET_DISCONNECTED` if no wallet is connected

**Example:**
```typescript
const result = await glwm.verifyLicense();
if (result.isValid) {
  console.log('License valid! Token ID:', result.license?.tokenId);
}
```

---

#### `verifyLicenseFresh()`

Forces a fresh license verification, bypassing the cache.

```typescript
async verifyLicenseFresh(): Promise<LicenseVerificationResult>
```

**Returns:** License verification result

**Example:**
```typescript
// After minting, force a fresh check
const result = await glwm.verifyLicenseFresh();
```

---

#### `checkLicenseForAddress()`

Checks license ownership for an arbitrary address (read-only, does not require a connected wallet).

```typescript
async checkLicenseForAddress(address: string): Promise<LicenseVerificationResult>
```

**Parameters:**
- `address` - Ethereum address to check

**Returns:** License verification result

**Example:**
```typescript
const result = await glwm.checkLicenseForAddress('0x1234...');
```

---

#### `getLicenseDetails()`

Gets full license details including metadata for a specific token ID.

```typescript
async getLicenseDetails(tokenId: string): Promise<LicenseNFT>
```

**Parameters:**
- `tokenId` - The token ID to look up

**Returns:** Full license NFT details

---

#### `getAllLicenses()`

Gets all licenses owned by the connected wallet (for multi-license scenarios).

```typescript
async getAllLicenses(): Promise<LicenseNFT[]>
```

**Returns:** Array of license NFTs

**Throws:**
- `GLWMError` with code `WALLET_DISCONNECTED` if no wallet is connected

---

#### `verifyAndPlay()`

Primary convenience method that handles the full flow: ensure wallet is connected, verify license, open minting portal if needed, and re-verify after minting.

```typescript
async verifyAndPlay(): Promise<LicenseVerificationResult>
```

**Returns:** License verification result

**Throws:**
- `GLWMError` - If the flow cannot complete

**Example:**
```typescript
const result = await glwm.verifyAndPlay();
if (result.isValid) {
  startGame();
}
```

---

#### `openMintingPortal()`

Opens the minting portal using the configured URL and mode.

```typescript
async openMintingPortal(): Promise<void>
```

**Example:**
```typescript
await glwm.openMintingPortal();
```

---

#### `closeMintingPortal()`

Closes the minting portal.

```typescript
closeMintingPortal(): void
```

---

#### `clearCache()`

Clears all entries in the verification cache.

```typescript
clearCache(): void
```

---

## Configuration

### GLWMConfig

Main configuration interface.

```typescript
interface GLWMConfig {
  // Required
  licenseContract: string;          // ERC721 contract address
  chainId: ChainId;                 // Target chain ID (EIP-155)
  rpcProvider: RPCConfig;           // RPC configuration
  mintingPortal: MintingPortalConfig; // Minting portal config

  // Optional
  cacheConfig?: CacheConfig;        // Cache settings
  analytics?: AnalyticsConfig;      // Analytics configuration

  // Callbacks
  onLicenseVerified?: (result: LicenseVerificationResult) => void;
  onWalletConnected?: (connection: WalletConnection) => void;
  onError?: (error: GLWMError) => void;
}
```

### RPCConfig

RPC provider configuration.

```typescript
interface RPCConfig {
  provider: 'alchemy' | 'infura' | 'custom';
  apiKey?: string;        // Required for 'alchemy' and 'infura'
  customUrl?: string;     // Required for 'custom'
  fallbackUrls?: string[];
  timeout?: number;       // ms, default 30000
  retryAttempts?: number; // default 3
}
```

**Examples:**
```typescript
// Alchemy
{ provider: 'alchemy', apiKey: 'your-key' }

// Infura
{ provider: 'infura', apiKey: 'your-key' }

// Custom RPC
{ provider: 'custom', customUrl: 'https://your-rpc.com' }

// With fallback
{
  provider: 'alchemy',
  apiKey: 'your-key',
  fallbackUrls: ['https://backup-rpc.com'],
  timeout: 15000,
  retryAttempts: 5,
}
```

### MintingPortalConfig

Minting portal configuration.

```typescript
interface MintingPortalConfig {
  url: string;                 // Portal URL
  mode: 'iframe' | 'redirect'; // Display mode
  width?: number;              // Portal width (iframe mode)
  height?: number;             // Portal height (iframe mode)
  onClose?: () => void;        // Called when portal closes
  autoCloseOnMint?: boolean;   // Auto-close after mint (default true)
}
```

### CacheConfig

Cache configuration.

```typescript
interface CacheConfig {
  enabled: boolean;    // Enable/disable caching
  ttlSeconds: number;  // Cache TTL in seconds
  storageKey: string;  // LocalStorage key prefix
}
```

Default cache config (when not specified):
```typescript
{
  enabled: true,
  ttlSeconds: 300,    // 5 minutes
  storageKey: 'glwm',
}
```

---

## Types

### GLWMState

SDK state is a discriminated union based on `status`. Different statuses carry different payload data:

```typescript
type GLWMState =
  | { status: 'uninitialized' }
  | { status: 'initializing' }
  | { status: 'awaiting_wallet' }
  | { status: 'connecting_wallet'; provider: WalletProvider }
  | { status: 'verifying_license'; address: string }
  | { status: 'license_valid'; license: LicenseNFT }
  | { status: 'no_license'; address: string }
  | { status: 'minting_portal_open' }
  | { status: 'minting_in_progress'; transactionHash: string }
  | { status: 'error'; error: GLWMError };
```

**Usage:**
```typescript
const state = glwm.getState();

switch (state.status) {
  case 'license_valid':
    console.log('License:', state.license.tokenId);
    break;
  case 'error':
    console.log('Error:', state.error.message);
    break;
  case 'connecting_wallet':
    console.log('Connecting via:', state.provider);
    break;
}
```

### WalletSession

Wallet session information.

```typescript
interface WalletSession {
  isConnected: boolean;
  isConnecting: boolean;
  connection: WalletConnection | null;
  error: WalletError | null;
}
```

### WalletConnection

Connected wallet details.

```typescript
interface WalletConnection {
  address: string;       // Checksummed wallet address (0x...)
  chainId: ChainId;
  provider: WalletProvider;
  connectedAt: number;   // Unix timestamp
  sessionId: string;     // UUID for session tracking
}
```

### WalletProvider

Supported wallet providers.

```typescript
type WalletProvider =
  | 'metamask'
  | 'phantom'
  | 'coinbase'
  | 'custom';
```

### LicenseVerificationResult

License verification result.

```typescript
interface LicenseVerificationResult {
  isValid: boolean;
  license: LicenseNFT | null;
  checkedAt: number;              // Unix timestamp
  blockNumber: number;
  reason?: LicenseInvalidReason;  // Present when isValid is false
}

type LicenseInvalidReason =
  | 'no_license_found'
  | 'license_expired'
  | 'wrong_chain'
  | 'contract_paused'
  | 'verification_failed';
```

### LicenseNFT

Full license NFT details.

```typescript
interface LicenseNFT {
  tokenId: string;           // BigNumber as string
  contractAddress: string;   // License collection contract
  owner: string;             // Current owner address
  metadata: LicenseMetadata;
  mintedAt?: number;         // Block timestamp (requires event query)
  transactionHash?: string;  // Mint transaction hash (requires event query)
}
```

### Events

Available event types.

```typescript
type GLWMEvent =
  | { type: 'INITIALIZE'; config: GLWMConfig }
  | { type: 'CONNECT_WALLET'; provider: WalletProvider }
  | { type: 'WALLET_CONNECTED'; connection: WalletConnection }
  | { type: 'WALLET_DISCONNECTED' }
  | { type: 'VERIFY_LICENSE' }
  | { type: 'LICENSE_VERIFIED'; result: LicenseVerificationResult }
  | { type: 'OPEN_MINTING_PORTAL' }
  | { type: 'MINT_STARTED'; transactionHash: string }
  | { type: 'MINT_COMPLETED'; result: MintResult }
  | { type: 'CLOSE_MINTING_PORTAL' }
  | { type: 'ERROR'; error: GLWMError }
  | { type: 'RESET' };
```

**Event payload examples:**

```typescript
// WALLET_CONNECTED
glwm.on('WALLET_CONNECTED', (event) => {
  console.log(event.connection.address);
  console.log(event.connection.chainId);
});

// LICENSE_VERIFIED
glwm.on('LICENSE_VERIFIED', (event) => {
  console.log(event.result.isValid);
  console.log(event.result.license?.tokenId);
});

// MINT_COMPLETED
glwm.on('MINT_COMPLETED', (event) => {
  console.log(event.result.tokenId);
  console.log(event.result.transactionHash);
});

// ERROR
glwm.on('ERROR', (event) => {
  console.log(event.error.code);
  console.log(event.error.message);
});
```

---

## Errors

### GLWMError

Error interface for SDK errors.

```typescript
interface GLWMError {
  code: GLWMErrorCode;
  message: string;
  details?: unknown;
  recoverable: boolean;
  suggestedAction?: string;
}
```

### Error Codes

```typescript
type GLWMErrorCode =
  | 'WALLET_NOT_FOUND'
  | 'WALLET_CONNECTION_REJECTED'
  | 'WALLET_DISCONNECTED'
  | 'CHAIN_MISMATCH'
  | 'RPC_ERROR'
  | 'CONTRACT_ERROR'
  | 'VERIFICATION_FAILED'
  | 'MINT_FAILED'
  | 'MINT_REJECTED'
  | 'INSUFFICIENT_FUNDS'
  | 'USER_CANCELLED'
  | 'NETWORK_ERROR'
  | 'CONFIGURATION_ERROR';
```

| Code | Description |
|------|-------------|
| `WALLET_NOT_FOUND` | Requested wallet provider not detected in the environment |
| `WALLET_CONNECTION_REJECTED` | User rejected the wallet connection request |
| `WALLET_DISCONNECTED` | Operation requires a connected wallet but none is connected |
| `CHAIN_MISMATCH` | Connected to a different chain than configured |
| `RPC_ERROR` | Failed to communicate with the RPC provider |
| `CONTRACT_ERROR` | Smart contract call failed |
| `VERIFICATION_FAILED` | License verification could not complete |
| `MINT_FAILED` | Minting transaction failed on-chain |
| `MINT_REJECTED` | User rejected the minting transaction |
| `INSUFFICIENT_FUNDS` | Wallet has insufficient funds for the transaction |
| `USER_CANCELLED` | User cancelled an in-progress operation |
| `NETWORK_ERROR` | General network connectivity error |
| `CONFIGURATION_ERROR` | SDK configuration is invalid or SDK not initialized |

---

## Supported Chains

| Chain | Chain ID | Network |
|-------|----------|---------|
| Ethereum | 1 | Mainnet |
| Polygon | 137 | Mainnet |
| Arbitrum | 42161 | One |
| Optimism | 10 | Mainnet |
| Base | 8453 | Mainnet |
| Sepolia | 11155111 | Testnet |
| Mumbai | 80001 | Testnet |

---

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions.

```typescript
import {
  GLWM,
  GLWMConfig,
  GLWMState,
  GLWMEvent,
  GLWMError,
  GLWMErrorCode,
  WalletConnection,
  WalletSession,
  WalletProvider,
  LicenseVerificationResult,
  LicenseNFT,
  LicenseMetadata,
  LicenseAttributes,
  LicenseEdition,
  LicenseInvalidReason,
  MintConfig,
  MintEdition,
  MintRequest,
  MintResult,
  MintError,
  WalletError,
  RPCConfig,
  MintingPortalConfig,
  CacheConfig,
  AnalyticsConfig,
  ChainId,
} from '@glwm/sdk';

// Utilities
import {
  RPCProvider,
  WalletConnector,
  LicenseVerifier,
  MintingPortal,
  Cache,
  Logger,
  LogLevel,
  logger,
} from '@glwm/sdk';

import type { LoggerConfig, LogEntry } from '@glwm/sdk';
```
