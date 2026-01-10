# GLWM SDK API Reference

Complete API documentation for the Game License Wallet Module SDK.

## Table of Contents

- [GLWM Class](#glwm-class)
  - [Constructor](#constructor)
  - [Static Methods](#static-methods)
  - [Instance Methods](#instance-methods)
- [Configuration](#configuration)
  - [GLWMConfig](#glwmconfig)
  - [RPCProviderConfig](#rpcproviderconfig)
  - [MintingPortalConfig](#mintingportalconfig)
  - [CacheConfig](#cacheconfig)
- [Types](#types)
  - [GLWMState](#glwmstate)
  - [WalletSession](#walletsession)
  - [LicenseStatus](#licensestatus)
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
- `GLWMError` - If configuration is invalid

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
    mode: 'webview',
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

Initializes the SDK, connecting to the RPC provider.

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

Cleans up resources and disconnects.

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

**Returns:** Current state object

**Example:**
```typescript
const state = glwm.getState();
console.log(state.status); // 'uninitialized' | 'initializing' | 'awaiting_wallet' | etc.
```

---

#### `subscribe()`

Subscribes to state changes.

```typescript
subscribe(listener: (state: GLWMState) => void): () => void
```

**Parameters:**
- `listener` - Callback function called on state changes

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
  handler: EventHandler<T>
): () => void
```

**Parameters:**
- `event` - Event type to listen for
- `handler` - Event handler function

**Returns:** Unsubscribe function

**Example:**
```typescript
const unsubscribe = glwm.on('WALLET_CONNECTED', (event) => {
  console.log('Wallet connected:', event.address);
});
```

---

#### `connectWallet()`

Initiates wallet connection.

```typescript
async connectWallet(provider?: WalletProvider): Promise<WalletConnection>
```

**Parameters:**
- `provider` (optional) - Specific wallet provider to use

**Returns:** Wallet connection details

**Example:**
```typescript
const connection = await glwm.connectWallet('metamask');
console.log('Connected:', connection.address);
```

---

#### `disconnectWallet()`

Disconnects the current wallet.

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

#### `verifyLicense()`

Verifies NFT license ownership.

```typescript
async verifyLicense(address?: string): Promise<LicenseStatus>
```

**Parameters:**
- `address` (optional) - Address to check (defaults to connected wallet)

**Returns:** License verification result

**Example:**
```typescript
const status = await glwm.verifyLicense();
if (status.isValid) {
  console.log('License valid! Token ID:', status.tokenId);
}
```

---

#### `openMintingPortal()`

Opens the minting portal.

```typescript
openMintingPortal(options?: MintingPortalOptions): void
```

**Parameters:**
- `options` (optional) - Portal configuration overrides

**Example:**
```typescript
glwm.openMintingPortal({
  onSuccess: (tokenId) => console.log('Minted:', tokenId),
  onCancel: () => console.log('Minting cancelled'),
});
```

---

#### `closeMintingPortal()`

Closes the minting portal.

```typescript
closeMintingPortal(): void
```

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
// ['metamask', 'walletconnect', ...]
```

---

#### `isProviderAvailable()`

Checks if a specific wallet provider is available.

```typescript
isProviderAvailable(provider: WalletProvider): boolean
```

**Parameters:**
- `provider` - Provider name to check

**Returns:** Whether the provider is available

---

#### `clearCache()`

Clears the verification cache.

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
  licenseContract: string;        // ERC721 contract address
  chainId: number;                // Target chain ID
  rpcProvider: RPCProviderConfig; // RPC configuration
  mintingPortal: MintingPortalConfig; // Minting portal config

  // Optional
  cacheConfig?: CacheConfig;      // Cache settings
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent';

  // Callbacks
  onError?: (error: GLWMError) => void;
  onWalletConnected?: (connection: WalletConnection) => void;
  onWalletDisconnected?: () => void;
  onLicenseVerified?: (status: LicenseStatus) => void;
}
```

### RPCProviderConfig

RPC provider configuration.

```typescript
type RPCProviderConfig =
  | { provider: 'alchemy'; apiKey: string }
  | { provider: 'infura'; apiKey: string }
  | { provider: 'custom'; customUrl: string };
```

**Examples:**
```typescript
// Alchemy
{ provider: 'alchemy', apiKey: 'your-key' }

// Infura
{ provider: 'infura', apiKey: 'your-key' }

// Custom RPC
{ provider: 'custom', customUrl: 'https://your-rpc.com' }
```

### MintingPortalConfig

Minting portal configuration.

```typescript
interface MintingPortalConfig {
  url: string;                           // Portal URL
  mode: 'webview' | 'iframe' | 'redirect'; // Display mode
  width?: number;                        // Portal width (iframe/webview)
  height?: number;                       // Portal height (iframe/webview)
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

---

## Types

### GLWMState

SDK state object.

```typescript
interface GLWMState {
  status:
    | 'uninitialized'
    | 'initializing'
    | 'awaiting_wallet'
    | 'connecting_wallet'
    | 'verifying_license'
    | 'minting'
    | 'ready'
    | 'error';
  error: GLWMError | null;
  wallet: WalletConnection | null;
  license: LicenseStatus | null;
}
```

### WalletSession

Wallet session information.

```typescript
interface WalletSession {
  isConnected: boolean;
  isConnecting: boolean;
  connection: WalletConnection | null;
  error: Error | null;
}
```

### WalletConnection

Connected wallet details.

```typescript
interface WalletConnection {
  address: string;
  chainId: number;
  provider: WalletProvider;
}
```

### WalletProvider

Supported wallet providers.

```typescript
type WalletProvider =
  | 'metamask'
  | 'walletconnect'
  | 'phantom'
  | 'coinbase';
```

### LicenseStatus

License verification result.

```typescript
interface LicenseStatus {
  isValid: boolean;
  tokenId: string | null;
  owner: string | null;
  expiresAt: Date | null;
  metadata: Record<string, unknown> | null;
}
```

### Events

Available event types.

```typescript
type GLWMEventType =
  | 'WALLET_CONNECTED'
  | 'WALLET_DISCONNECTED'
  | 'LICENSE_VERIFIED'
  | 'MINT_STARTED'
  | 'MINT_COMPLETED'
  | 'MINT_FAILED'
  | 'OPEN_MINTING_PORTAL'
  | 'CLOSE_MINTING_PORTAL'
  | 'ERROR';
```

**Event Payloads:**

```typescript
// WALLET_CONNECTED
{ type: 'WALLET_CONNECTED'; address: string; chainId: number; provider: string }

// LICENSE_VERIFIED
{ type: 'LICENSE_VERIFIED'; isValid: boolean; tokenId: string | null }

// MINT_COMPLETED
{ type: 'MINT_COMPLETED'; tokenId: string; transactionHash: string }

// ERROR
{ type: 'ERROR'; error: GLWMError }
```

---

## Errors

### GLWMError

Base error class for SDK errors.

```typescript
class GLWMError extends Error {
  code: string;
  details?: Record<string, unknown>;
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_CONFIG` | Configuration validation failed |
| `RPC_CONNECTION_FAILED` | Failed to connect to RPC provider |
| `WALLET_CONNECTION_FAILED` | Failed to connect wallet |
| `WALLET_NOT_FOUND` | Requested wallet provider not found |
| `CHAIN_MISMATCH` | Connected to wrong chain |
| `LICENSE_VERIFICATION_FAILED` | License verification failed |
| `MINTING_FAILED` | Minting transaction failed |
| `USER_REJECTED` | User rejected the action |

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
  GLWMError,
  WalletConnection,
  WalletSession,
  WalletProvider,
  LicenseStatus,
  GLWMEvent,
} from '@glwm/sdk';
```
