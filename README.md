# GLWM SDK

NFT-based license verification for games. One call to connect a wallet, verify an ERC-721 license, and mint if needed.

## Install

```bash
npm install @glwm/sdk
```

## Quick Start

```typescript
import { GLWM } from '@glwm/sdk';

const glwm = new GLWM({
  licenseContract: '0x1234...5678',
  chainId: 137, // Polygon
  rpcProvider: { provider: 'alchemy', apiKey: 'YOUR_KEY' },
  mintingPortal: { url: 'https://mint.mygame.com', mode: 'iframe' },
});

await glwm.initialize();
const result = await glwm.verifyAndPlay();

if (result.isValid) {
  startGame();
}
```

`verifyAndPlay()` handles the entire flow: connect wallet, check license, open minting portal if needed, re-verify after mint.

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `licenseContract` | `string` | Yes | ERC-721 contract address |
| `chainId` | `number` | Yes | Target chain ID (see supported chains) |
| `rpcProvider` | `RPCConfig` | Yes | RPC provider settings |
| `mintingPortal` | `MintingPortalConfig` | Yes | Minting portal settings |
| `cacheConfig` | `CacheConfig` | No | Verification result caching |
| `onLicenseVerified` | `(result) => void` | No | Called after license check |
| `onWalletConnected` | `(connection) => void` | No | Called after wallet connects |
| `onError` | `(error) => void` | No | Called on any error |

### RPC Provider

```typescript
// Alchemy or Infura
{ provider: 'alchemy', apiKey: 'YOUR_KEY' }
{ provider: 'infura', apiKey: 'YOUR_KEY' }

// Custom RPC endpoint
{ provider: 'custom', customUrl: 'https://your-rpc.com' }

// Optional: fallback URLs, timeout (default 30s), retry attempts (default 3)
```

### Minting Portal

```typescript
{ url: 'https://mint.mygame.com', mode: 'iframe' }  // Opens in overlay
{ url: 'https://mint.mygame.com', mode: 'redirect' } // Redirects to portal
```

## API

### Lifecycle

| Method | Description |
|--------|-------------|
| `new GLWM(config)` | Create SDK instance (validates config) |
| `initialize()` | Connect to RPC, set up components |
| `dispose()` | Clean up all resources |
| `getState()` | Get current SDK state |
| `subscribe(listener)` | Subscribe to state changes (returns unsubscribe fn) |
| `on(event, handler)` | Listen for specific events (returns unsubscribe fn) |

### Wallet

| Method | Description |
|--------|-------------|
| `connectWallet(provider?)` | Connect wallet (MetaMask, Coinbase, Phantom, or custom) |
| `disconnectWallet()` | Disconnect and clear session |
| `getWalletSession()` | Get current wallet session |
| `switchChain(chainId)` | Request chain switch |
| `getAvailableProviders()` | List detected wallet providers |
| `isProviderAvailable(name)` | Check if a specific provider is available |

### License

| Method | Description |
|--------|-------------|
| `verifyAndPlay()` | Full flow: connect, verify, mint if needed |
| `verifyLicense()` | Verify license for connected wallet (uses cache) |
| `verifyLicenseFresh()` | Verify license bypassing cache |
| `checkLicenseForAddress(addr)` | Check license for any address (read-only) |
| `getLicenseDetails(tokenId)` | Get full license metadata |
| `getAllLicenses()` | Get all licenses owned by connected wallet |

### Minting

| Method | Description |
|--------|-------------|
| `openMintingPortal()` | Open the minting portal |
| `closeMintingPortal()` | Close the minting portal |

### Utilities

| Method | Description |
|--------|-------------|
| `clearCache()` | Clear verification cache |
| `GLWM.getVersion()` | Get SDK version |
| `GLWM.validateConfig(config)` | Validate config without creating instance |

## Error Codes

| Code | Recoverable | Description |
|------|-------------|-------------|
| `CONFIGURATION_ERROR` | No | Invalid config or SDK not initialized |
| `WALLET_NOT_FOUND` | No | Wallet extension not installed |
| `WALLET_CONNECTION_REJECTED` | Yes | User rejected connection or request pending |
| `WALLET_DISCONNECTED` | Yes | Wallet not connected |
| `CHAIN_MISMATCH` | Yes | Connected to wrong chain |
| `RPC_ERROR` | Yes | RPC call failed after retries |
| `CONTRACT_ERROR` | No | License contract error |
| `NETWORK_ERROR` | Yes | General network failure |
| `USER_CANCELLED` | Yes | User cancelled an action |

## Supported Chains

| Chain | ID | Testnet | Testnet ID |
|-------|----|---------|------------|
| Ethereum | 1 | Sepolia | 11155111 |
| Polygon | 137 | Amoy | 80002 |
| Arbitrum | 42161 | Sepolia | 421614 |
| Optimism | 10 | Sepolia | 11155420 |
| Base | 8453 | Sepolia | 84532 |

## Docs

- [Quick Start Guide](docs/quickstart.md) — step-by-step integration with React example
- [API Reference](docs/api.md) — full API documentation with types

## License

MIT
