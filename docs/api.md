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
| `verifyLicense()` | `async verifyLicense(): Promise<LicenseVerificationResult>` | Verify the connected wallet's license (uses the cache). Resolves with a verdict; if the license cannot be verified it throws, reports the error and moves to `error`, and nothing is cached (see [Verification failures](#verification-failures)) |
| `verifyLicenseFresh()` | `async verifyLicenseFresh(): Promise<LicenseVerificationResult>` | `verifyLicense()` bypassing the cache |
| `verifyAndPlay()` | `async verifyAndPlay(): Promise<LicenseVerificationResult>` | Connect + verify in one call; opens the minting portal only for `no_license_found` / `license_expired`, then verifies again. Rejects if the license cannot be verified, before or after the portal |
| `checkLicenseForAddress()` | `async checkLicenseForAddress(address: string): Promise<LicenseVerificationResult>` | Verify any address (read-only): resolves with a verdict; a verification failure is reported and thrown without changing the state or the cache |
| `getLicenseDetails()` | `async getLicenseDetails(tokenId: string): Promise<LicenseNFT>` | A license's owner and metadata; read failures are reported and thrown as in `checkLicenseForAddress()` |
| `getAllLicenses()` | `async getAllLicenses(): Promise<LicenseNFT[]>` | All licenses of the connected wallet; read failures are reported and thrown as in `checkLicenseForAddress()` |
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

A result is always a verdict about the license:

| `isValid` | `reason` | Meaning | `verifyAndPlay()` |
|:---------:|----------|---------|-------------------|
| `true` | — | The wallet owns a license that has not expired | Resolves; state `license_valid` |
| `false` | `no_license_found` | The wallet owns no license token | Opens the minting portal |
| `false` | `license_expired` | The wallet's license has expired (`license` is set) | Opens the minting portal |

`verifyLicense()` caches verdicts for `cacheConfig.ttlSeconds` (5 minutes by default).

#### Verification failures

A verification that cannot complete says nothing about the license, so it is not a result. It is
thrown as a `GLWMError`. Its `details` is a JSON-safe summary of the underlying error (`message`,
`name`, and the ethers `code`, `shortMessage` and `reason` when present), so it can be logged or
sent to telemetry as is:

| Code | When |
|------|------|
| `RPC_ERROR` | An RPC call fails after the configured retries and fallbacks: the block number, `balanceOf`, `tokenOfOwnerByIndex`, `tokenURI` (or `ownerOf` in `getLicenseDetails()`). Has a `suggestedAction` |
| `CONTRACT_ERROR` | A contract read reverts because the license contract is paused. `recoverable: true`, since the contract can be unpaused; the minting portal is not opened, since minting on a paused contract cannot work |
| `VERIFICATION_FAILED` | The license verifier returned a result that is not a verdict (a deprecated or unknown `reason`). Guards against ever treating such a result as "no license" |

The error reaches `onError` and the `ERROR` event exactly once, and is the error the call rejects
with. It is never cached and never moves the state to `no_license`. `verifyLicense()` and
`verifyAndPlay()` move to the `error` state (call `initialize()` to retry); the read-only
`checkLicenseForAddress()`, `getLicenseDetails()` and `getAllLicenses()` leave the state unchanged.
A token's metadata that cannot be fetched is not a failure: default metadata is used.

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

Only `no_license_found` and `license_expired` are produced. `contract_paused` and
`verification_failed` are deprecated: a paused contract and a failed RPC call are now thrown (see
[Verification failures](#verification-failures)). They stay in the type so that code checking for
them still compiles, and will be removed in a future breaking release. `wrong_chain` is not
produced (a wallet on the wrong chain is reported as `CHAIN_MISMATCH`).

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
| `CONTRACT_ERROR` | no (yes when the license contract is paused) | Smart contract call failed, or the license contract is paused |
| `VERIFICATION_FAILED` | yes | The license verifier returned a result that is not a verdict (see [Verification failures](#verification-failures)) |
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
