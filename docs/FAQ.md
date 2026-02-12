# GLWM SDK - Frequently Asked Questions

## General Questions

### What is GLWM SDK?

GLWM (Game License Wallet Module) is a TypeScript SDK that enables game developers to implement NFT-based license verification. It handles wallet authentication, on-chain license verification, and provides a seamless minting flow when no license exists.

### What blockchains are supported?

GLWM supports the following networks:

| Network | Chain ID | Type |
|---------|----------|------|
| Ethereum Mainnet | 1 | Production |
| Polygon | 137 | Production |
| Arbitrum One | 42161 | Production |
| Optimism | 10 | Production |
| Base | 8453 | Production |
| Sepolia | 11155111 | Testnet |
| Mumbai | 80001 | Testnet |

### What wallet providers are supported?

- **MetaMask** - Browser extension and mobile
- **Phantom** - Primarily Solana, with EVM support
- **Coinbase Wallet** - Browser extension and mobile
- **Custom** - Any EIP-1193 compatible provider

### Is GLWM free to use?

GLWM SDK is open source under the MIT license. However, you'll need:
- An RPC provider (Alchemy, Infura, or custom) - may have costs
- A deployed ERC721 contract for licenses
- A minting portal/service

---

## Integration Questions

### How do I install the SDK?

```bash
npm install @glwm/sdk
# or
yarn add @glwm/sdk
# or
pnpm add @glwm/sdk
```

### What's the minimum configuration needed?

```typescript
import { GLWM } from '@glwm/sdk';

const glwm = new GLWM({
  licenseContract: '0x...', // Your ERC721 contract address
  chainId: 137,              // Target chain ID
  rpcProvider: {
    provider: 'alchemy',
    apiKey: 'your-api-key',
  },
  mintingPortal: {
    url: 'https://your-mint-site.com',
    mode: 'iframe',
  },
});
```

### Can I use GLWM without a minting portal?

Yes. If you only need license verification without minting, configure a placeholder URL:

```typescript
mintingPortal: {
  url: 'https://placeholder.com',
  mode: 'redirect', // Won't be used if you never call openMintingPortal()
}
```

### How do I validate my configuration before initializing?

```typescript
const result = GLWM.validateConfig(myConfig);

if (!result.valid) {
  console.error('Configuration errors:', result.errors);
} else {
  const glwm = new GLWM(myConfig);
}
```

### Does GLWM work in Node.js (server-side)?

GLWM is primarily designed for client-side use where wallet interactions occur. For server-side license verification, you can use the `RPCProvider` and `LicenseVerifier` components directly to query the blockchain, but wallet connection features require a browser environment.

---

## Wallet Questions

### How do I let users choose their wallet?

```typescript
// Get available providers
const providers = glwm.getAvailableProviders();
// Returns: ['metamask', 'coinbase', ...]

// Check specific provider
if (glwm.isProviderAvailable('metamask')) {
  await glwm.connectWallet('metamask');
}
```

### What happens if the user is on the wrong chain?

GLWM will emit a `CHAIN_MISMATCH` error. You can handle this:

```typescript
glwm.on('ERROR', async (event) => {
  if (event.error.code === 'CHAIN_MISMATCH') {
    // Request chain switch via the SDK
    await glwm.switchChain(137); // Switch to Polygon
  }
});
```

### How do I detect when the user disconnects their wallet?

```typescript
glwm.on('WALLET_DISCONNECTED', () => {
  // Handle disconnection
  console.log('Wallet disconnected');
});

// Or use the onWalletConnected callback in config
const glwm = new GLWM({
  ...config,
  onWalletConnected: (connection) => {
    console.log('Connected:', connection.address);
  },
});
```

### Can users stay connected across page refreshes?

The SDK supports verification result caching through the cache configuration:

```typescript
cacheConfig: {
  enabled: true,
  ttlSeconds: 86400, // 24 hours
  storageKey: 'my-game-glwm',
}
```

Note: Actual wallet reconnection depends on the wallet provider's behavior.

---

## License Verification Questions

### How does license verification work?

GLWM queries your ERC721 contract to check if the connected wallet owns any tokens:

1. Calls `balanceOf(address)` to check ownership
2. If balance > 0, calls `tokenOfOwnerByIndex(address, 0)` to get token ID
3. Returns a `LicenseVerificationResult` object with verification results

### Can I verify a license for a different address?

```typescript
// Verify connected wallet
const result = await glwm.verifyLicense();

// Verify a specific address (read-only, no wallet connection needed)
const result = await glwm.checkLicenseForAddress('0x1234...');
```

### How long are verification results cached?

By default, results are cached for 5 minutes (300 seconds) based on your `cacheConfig.ttlSeconds` setting. You can:

```typescript
// Clear cache manually
glwm.clearCache();

// Force a fresh verification
const result = await glwm.verifyLicenseFresh();

// Or disable caching entirely
cacheConfig: {
  enabled: false,
  ttlSeconds: 0,
  storageKey: 'glwm',
}
```

### What if verification fails?

```typescript
const result = await glwm.verifyLicense();

if (!result.isValid) {
  console.log('Reason:', result.reason);
  // Open minting portal for user to get a license
  await glwm.openMintingPortal();
}
```

---

## Minting Portal Questions

### What minting portal modes are available?

| Mode | Description | Best For |
|------|-------------|----------|
| `iframe` | Embedded in page | Web apps with space |
| `redirect` | Full page navigation | Simple integrations |

### How do I handle minting events?

```typescript
// Listen for mint completion
glwm.on('MINT_COMPLETED', async (event) => {
  console.log('Minted token:', event.result.tokenId);
  // Re-verify license
  const result = await glwm.verifyLicenseFresh();
});

// Listen for portal close
glwm.on('CLOSE_MINTING_PORTAL', () => {
  console.log('Portal closed');
});
```

### How does the minting portal communicate with the SDK?

The minting portal should send `postMessage` events:

```javascript
// From minting portal
window.parent.postMessage({
  type: 'GLWM_MINT_SUCCESS',
  tokenId: '123',
  transactionHash: '0x...',
}, '*');

// Or for cancellation
window.parent.postMessage({
  type: 'GLWM_MINT_CANCELLED',
}, '*');
```

---

## Performance Questions

### How do I reduce RPC calls?

1. **Enable caching** with appropriate TTL
2. **Use premium RPC providers** with higher rate limits
3. **Batch verification** - verify once per session, not per action

### What's the typical verification latency?

- Cached result: < 1ms
- RPC call (Alchemy/Infura): 100-500ms
- Public RPC: 500ms-2s (varies)

### How do I handle slow connections?

Configure timeouts in your RPC provider setup and handle errors gracefully:

```typescript
const glwm = new GLWM({
  ...config,
  rpcProvider: {
    provider: 'alchemy',
    apiKey: 'your-key',
    timeout: 15000,       // 15 second timeout
    retryAttempts: 5,     // Retry up to 5 times
  },
  onError: (error) => {
    if (error.code === 'RPC_ERROR') {
      // Show retry option to user
    }
  },
});
```

---

## Security Questions

### Does GLWM have access to private keys?

**No.** GLWM never has access to private keys. All signing operations are delegated to the user's wallet provider (MetaMask, etc.).

### How are API keys protected?

- Store API keys in environment variables
- Never commit `.env` files to version control
- Use server-side proxies for sensitive operations if needed

### Is the verification tamper-proof?

Verification queries the blockchain directly, making results trustworthy. However:
- Cache can be manipulated locally (use server-side verification for critical checks)
- Client-side SDK is visible to users (don't rely solely on client-side checks for security)

---

## Debugging Questions

### How do I track SDK state changes?

```typescript
glwm.subscribe((state) => {
  console.log('State changed:', state.status);

  // Use discriminated union to access status-specific data
  if (state.status === 'error') {
    console.log('Error:', state.error);
  }
  if (state.status === 'license_valid') {
    console.log('License:', state.license);
  }
});
```

### How do I use the Logger utility?

```typescript
import { Logger, LogLevel } from '@glwm/sdk';

const logger = new Logger({
  level: LogLevel.DEBUG,
  prefix: 'MyGame',
});

logger.debug('SDK initialized');
logger.error('Something went wrong', { details: '...' });
```
