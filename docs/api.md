# GLWM SDK API Reference

## GLWM Class

Main entry point for the SDK.

```typescript
import { GLWM } from '@glwm/sdk';
const glwm = new GLWM(config);
```

### Static Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `getVersion()` | `static getVersion(): string` | Returns SDK version (e.g., `"0.1.0"`) |
| `validateConfig()` | `static validateConfig(config: GLWMConfig): { valid: boolean; errors: string[] }` | Validates config without creating an instance |

### Instance Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `initialize()` | `async initialize(): Promise<void>` | Connects to RPC provider, transitions to `awaiting_wallet`. Called again (e.g. to retry after an error), it first releases the previous session: disconnects a connected wallet (`WALLET_DISCONNECTED` fires) and closes an open minting portal. Other methods called while it runs are rejected with `CONFIGURATION_ERROR` |
| `dispose()` | `async dispose(): Promise<void>` | Disconnects wallet, cleans up resources |
| `getState()` | `getState(): GLWMState` | Returns current SDK state |
| `subscribe()` | `subscribe(listener: (state: GLWMState) => void): () => void` | Subscribe to state changes; returns unsubscribe fn |
| `on()` | `on<T>(event: T, handler: EventHandler<T>): () => void` | Subscribe to specific events |
| `connectWallet()` | `async connectWallet(provider?: WalletProvider): Promise<WalletConnection>` | Connect a wallet |
| `disconnectWallet()` | `async disconnectWallet(): Promise<void>` | Disconnect the current wallet |
| `getWalletSession()` | `getWalletSession(): WalletSession` | Get current wallet session info |
| `verifyLicense()` | `async verifyLicense(address?: string): Promise<LicenseVerificationResult>` | Verify NFT license ownership |
| `verifyAndPlay()` | `async verifyAndPlay(provider?: WalletProvider): Promise<LicenseVerificationResult>` | Connect + verify in one call; opens portal if no license |
| `openMintingPortal()` | `async openMintingPortal(): Promise<void>` | Opens the minting portal (iframe or redirect); the state becomes `minting_portal_open` once it is open. If it cannot open, the state is unchanged and the error is thrown |
| `closeMintingPortal()` | `closeMintingPortal(): void` | Closes the minting portal; does nothing if it is not open |
| `getAvailableProviders()` | `getAvailableProviders(): WalletProvider[]` | List detected wallet providers |
| `isProviderAvailable()` | `isProviderAvailable(provider: WalletProvider): boolean` | Check if a specific provider is available |
| `clearCache()` | `clearCache(): void` | Clear the verification cache |

---

## Configuration Types

### GLWMConfig

```typescript
interface GLWMConfig {
  licenseContract: string;              // ERC-721 contract address
  chainId: ChainId;                     // EIP-155 chain ID (e.g. 137)
  rpcProvider: RPCConfig;
  mintingPortal: MintingPortalConfig;
  cacheConfig?: CacheConfig;
  analytics?: AnalyticsConfig;
  onLicenseVerified?: (result: LicenseVerificationResult) => void;
  onWalletConnected?: (connection: WalletConnection) => void;
  onError?: (error: GLWMError) => void;
}
```

### RPCConfig

```typescript
interface RPCConfig {
  provider: 'alchemy' | 'infura' | 'custom';
  apiKey?: string;            // Required for alchemy/infura
  customUrl?: string;         // Required for custom
  fallbackUrls?: string[];
  timeout?: number;           // ms, default 30000
  retryAttempts?: number;     // default 3
}
```

### MintingPortalConfig

```typescript
interface MintingPortalConfig {
  url: string;                // Minting page URL
  mode: 'iframe' | 'redirect';
  width?: number;             // iframe dimensions
  height?: number;
  onClose?: () => void;
  autoCloseOnMint?: boolean;  // default true
}
```

### CacheConfig

```typescript
interface CacheConfig {
  enabled: boolean;
  ttlSeconds: number;
  storageKey: string;         // localStorage key prefix
}
```

---

## State Types

### GLWMState (discriminated union)

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

The minting states (`minting_portal_open`, `minting_in_progress`) are reported only while the minting portal is open. If the SDK is in a minting state when the portal closes, however it closes (close button, overlay click, the portal's `PORTAL_CLOSED` message, auto-close after a mint, the 10-minute `verifyAndPlay()` timeout, `closeMintingPortal()`), the state becomes `no_license` if a wallet is connected, else `awaiting_wallet`. A state reached while the portal was open (for example `license_valid` from `verifyLicense()`, or `error`) is kept. The state changes first, then `CLOSE_MINTING_PORTAL` fires, then `mintingPortal.onClose` runs.

### WalletProvider

```typescript
type WalletProvider = 'metamask' | 'phantom' | 'coinbase' | 'custom';
```

### WalletConnection

```typescript
interface WalletConnection {
  address: string;      // Checksummed (0x...)
  chainId: ChainId;
  provider: WalletProvider;
  connectedAt: number;  // Unix timestamp
  sessionId: string;    // UUID
}
```

### WalletSession

```typescript
interface WalletSession {
  connection: WalletConnection | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: WalletError | null;
}
```

---

## License Types

### LicenseVerificationResult

```typescript
interface LicenseVerificationResult {
  isValid: boolean;
  license: LicenseNFT | null;
  checkedAt: number;
  blockNumber: number;
  reason?: LicenseInvalidReason;
}
```

### LicenseNFT

```typescript
interface LicenseNFT {
  tokenId: string;
  contractAddress: string;
  owner: string;
  metadata: LicenseMetadata;
  mintedAt?: number;
  transactionHash?: string;
}
```

### LicenseMetadata & Attributes

```typescript
interface LicenseMetadata {
  name: string;
  description: string;
  image?: string;             // IPFS URI or HTTP URL
  attributes: LicenseAttributes;
}

interface LicenseAttributes {
  version: string;
  edition: LicenseEdition;
  mintedBy: string;
  gameId: string;
  soulbound?: boolean;
  expiresAt?: number;
  tier?: string;
  crossGameAccess?: string[];
}

type LicenseEdition = 'standard' | 'deluxe' | 'ultimate' | 'founders' | 'limited';
type LicenseInvalidReason = 'no_license_found' | 'license_expired' | 'wrong_chain' | 'contract_paused' | 'verification_failed';
```

---

## Error Types

### GLWMError

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

| Code | Recoverable | Description |
|------|:-----------:|-------------|
| `WALLET_NOT_FOUND` | no | Wallet provider not detected |
| `WALLET_CONNECTION_REJECTED` | yes | User rejected connection |
| `WALLET_DISCONNECTED` | yes | Wallet disconnected unexpectedly |
| `CHAIN_MISMATCH` | yes | Wrong chain, needs switch |
| `RPC_ERROR` | yes | RPC provider call failed |
| `CONTRACT_ERROR` | no | Smart contract call failed |
| `VERIFICATION_FAILED` | yes | License check failed |
| `MINT_FAILED` | no | Mint transaction reverted |
| `MINT_REJECTED` | yes | User rejected mint transaction |
| `INSUFFICIENT_FUNDS` | yes | Not enough ETH/MATIC for mint |
| `USER_CANCELLED` | yes | User cancelled action |
| `NETWORK_ERROR` | yes | General network failure |
| `CONFIGURATION_ERROR` | no | Invalid SDK configuration |

---

## Events

### GLWMEvent (discriminated union)

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

---

## Supported Chains

| Chain | ID | Network |
|-------|----|---------|
| Ethereum | 1 | Mainnet |
| Polygon | 137 | Mainnet |
| Arbitrum | 42161 | One |
| Optimism | 10 | Mainnet |
| Base | 8453 | Mainnet |
| Sepolia | 11155111 | Testnet |
| Mumbai | 80001 | Testnet |
