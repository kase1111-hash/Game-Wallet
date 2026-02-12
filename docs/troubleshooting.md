# GLWM SDK - Troubleshooting Guide

## Quick Diagnosis

Before diving into specific issues, check these common problems:

```typescript
// 1. Validate your configuration
const result = GLWM.validateConfig(myConfig);
console.log('Config valid:', result.valid);
console.log('Config errors:', result.errors);

// 2. Check SDK state
console.log('Current state:', glwm.getState());

// 3. Subscribe to state changes for debugging
glwm.subscribe((state) => {
  console.log('State:', state.status);
});
```

---

## Initialization Issues

### Error: "Invalid configuration"

**Symptoms:**
- SDK throws error immediately on `new GLWM(config)`

**Causes & Solutions:**

1. **Invalid contract address**
   ```typescript
   // Wrong
   licenseContract: '0x123'
   licenseContract: 'my-contract'

   // Correct (40 hex characters after 0x)
   licenseContract: '0x1234567890123456789012345678901234567890'
   ```

2. **Invalid chain ID**
   ```typescript
   // Wrong
   chainId: 0
   chainId: -1
   chainId: '137' // String instead of number

   // Correct
   chainId: 137
   ```

3. **Missing RPC provider config**
   ```typescript
   // Wrong
   rpcProvider: { provider: 'alchemy' } // Missing apiKey

   // Correct
   rpcProvider: { provider: 'alchemy', apiKey: 'your-key' }
   // Or
   rpcProvider: { provider: 'custom', customUrl: 'https://...' }
   ```

### Error: "Failed to connect to RPC provider"

**Symptoms:**
- `initialize()` throws error
- State stuck in "initializing"

**Causes & Solutions:**

1. **Invalid API key**
   ```typescript
   // Check your API key is correct and active
   rpcProvider: {
     provider: 'alchemy',
     apiKey: process.env.ALCHEMY_API_KEY, // Ensure this is set
   }
   ```

2. **Wrong network for API key**
   - Alchemy/Infura API keys are network-specific
   - Ensure your key supports the `chainId` you're using

3. **Network connectivity**
   ```typescript
   // Test RPC endpoint directly
   const response = await fetch('https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY', {
     method: 'POST',
     body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
   });
   console.log(await response.json());
   ```

4. **Rate limiting**
   - Check if you've exceeded your RPC provider's rate limits
   - Consider upgrading your plan or using fallback URLs

---

## Wallet Connection Issues

### Error: "Wallet provider not found"

**Symptoms:**
- `connectWallet()` fails immediately
- `getAvailableProviders()` returns empty array

**Solutions:**

1. **MetaMask not installed**
   ```typescript
   if (!glwm.isProviderAvailable('metamask')) {
     // Prompt user to install MetaMask
     window.open('https://metamask.io/download/', '_blank');
   }
   ```

2. **Check for wallet injection timing**
   ```typescript
   // Wait for wallet provider to inject
   await new Promise(resolve => setTimeout(resolve, 1000));
   const providers = glwm.getAvailableProviders();
   ```

3. **Mobile browser issues**
   - Some mobile browsers block wallet injections
   - Consider using the wallet's built-in browser

### Error: "User rejected the request"

**Symptoms:**
- Wallet popup appears but connection fails
- Error code: `WALLET_CONNECTION_REJECTED`

**Solutions:**
- This is expected behavior when user clicks "Cancel"
- Handle gracefully:
  ```typescript
  try {
    await glwm.connectWallet();
  } catch (error) {
    if (error.code === 'WALLET_CONNECTION_REJECTED') {
      // Show friendly message
      console.log('Please connect your wallet to continue');
    }
  }
  ```

### Error: "Chain mismatch"

**Symptoms:**
- Wallet connects but on wrong network
- Error code: `CHAIN_MISMATCH`

**Solutions:**

1. **Prompt user to switch networks**
   ```typescript
   glwm.on('ERROR', async (event) => {
     if (event.error.code === 'CHAIN_MISMATCH') {
       // Use the SDK's switchChain method
       try {
         await glwm.switchChain(137); // Polygon
       } catch (switchError) {
         console.log('Please switch to Polygon network manually');
       }
     }
   });
   ```

2. **Verify chainId configuration**
   - Ensure `config.chainId` matches your contract's deployment network

---

## License Verification Issues

### Error: "License verification failed"

**Symptoms:**
- `verifyLicense()` throws error
- State shows "error" status

**Causes & Solutions:**

1. **Contract not deployed on target chain**
   ```typescript
   // Verify contract exists
   const provider = new ethers.JsonRpcProvider(rpcUrl);
   const code = await provider.getCode(contractAddress);
   console.log('Contract code:', code); // Should not be '0x'
   ```

2. **Contract doesn't implement ERC721Enumerable**
   - Ensure your contract implements `balanceOf(address)`
   - Ensure your contract implements `tokenOfOwnerByIndex(address, uint256)`

3. **Wrong contract address**
   - Double-check the address is correct for the target network
   - Addresses are different on mainnet vs testnet

### Verification returns `isValid: false` when user has license

**Causes & Solutions:**

1. **Stale cache**
   ```typescript
   // Clear cache and re-verify
   glwm.clearCache();
   const result = await glwm.verifyLicenseFresh();
   ```

2. **Wrong address being checked**
   ```typescript
   // Verify which address is connected
   const session = glwm.getWalletSession();
   console.log('Connected address:', session.connection?.address);
   ```

3. **NFT on different network**
   - User may have NFT on mainnet but SDK configured for testnet
   - Check chainId configuration

---

## Minting Portal Issues

### Portal doesn't open

**Symptoms:**
- `openMintingPortal()` does nothing
- No iframe appears

**Solutions:**

1. **Invalid portal URL**
   ```typescript
   // Verify URL is accessible
   fetch(config.mintingPortal.url)
     .then(r => console.log('Portal reachable:', r.ok))
     .catch(e => console.log('Portal error:', e));
   ```

2. **Popup blocked**
   - For `redirect` mode, ensure it's called from user interaction
   - Check browser popup blocker settings

3. **CSP restrictions**
   - For `iframe` mode, ensure your site's CSP allows framing the portal URL

### Portal callbacks not firing

**Symptoms:**
- Minting completes but no events received
- No `MINT_COMPLETED` event

**Solutions:**

1. **Portal not sending postMessage**
   - Ensure your minting portal sends the correct message format:
   ```javascript
   // From minting portal
   window.parent.postMessage({
     type: 'GLWM_MINT_SUCCESS',
     tokenId: '123',
     transactionHash: '0x...',
   }, '*');
   ```

2. **Origin mismatch**
   - Check browser console for postMessage errors
   - Verify portal is loaded from the configured URL

3. **Event listener not registered**
   ```typescript
   // Ensure you're listening for events before opening the portal
   glwm.on('MINT_COMPLETED', (event) => {
     console.log('Mint completed:', event);
   });

   await glwm.openMintingPortal();
   ```

---

## State Management Issues

### State not updating

**Symptoms:**
- `subscribe()` callback not firing
- UI not reflecting SDK state

**Solutions:**

1. **Subscription lost**
   ```typescript
   // Store unsubscribe function and call only when needed
   const unsubscribe = glwm.subscribe((state) => {
     console.log('State:', state);
   });

   // Don't call unsubscribe() until you're done
   ```

2. **React state issue**
   ```typescript
   // Use useEffect properly in React
   useEffect(() => {
     const unsubscribe = glwm.subscribe((state) => {
       setGlwmState(state);
     });
     return () => unsubscribe();
   }, [glwm]);
   ```

### State stuck in "initializing"

**Solutions:**

1. **RPC connection timeout**
   - Check network connectivity
   - Verify RPC provider is responsive

2. **Check for unhandled errors**
   ```typescript
   const glwm = new GLWM({
     ...config,
     onError: (error) => {
       console.error('SDK Error:', error.code, error.message);
     },
   });
   ```

---

## Performance Issues

### Slow verification

**Causes & Solutions:**

1. **Cache disabled**
   ```typescript
   // Enable caching
   cacheConfig: {
     enabled: true,
     ttlSeconds: 300, // 5 minutes
     storageKey: 'glwm-cache',
   }
   ```

2. **Slow RPC provider**
   - Use premium RPC providers (Alchemy, Infura)
   - Consider using fallback URLs:
   ```typescript
   rpcProvider: {
     provider: 'alchemy',
     apiKey: 'your-key',
     fallbackUrls: ['https://backup-rpc.com'],
   }
   ```

3. **Multiple unnecessary calls**
   - Use `verifyLicense()` which checks the cache first
   - Only use `verifyLicenseFresh()` when you specifically need a fresh result

### High RPC usage

**Solutions:**

1. **Increase cache TTL**
   ```typescript
   cacheConfig: {
     enabled: true,
     ttlSeconds: 3600, // 1 hour instead of 5 minutes
     storageKey: 'glwm',
   }
   ```

2. **Verify only when needed**
   - Don't verify on every page load
   - Verify once per session, re-verify only on specific actions

---

## Common Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| `CONFIGURATION_ERROR` | Configuration validation failed or SDK not initialized | Check config against documentation, ensure `initialize()` was called |
| `RPC_ERROR` | Cannot connect to RPC | Verify API key and network |
| `WALLET_CONNECTION_REJECTED` | User rejected wallet connection | Handle gracefully, allow retry |
| `WALLET_NOT_FOUND` | No wallet provider detected | Prompt user to install wallet |
| `WALLET_DISCONNECTED` | No wallet connected for operation | Connect wallet first |
| `CHAIN_MISMATCH` | Wrong blockchain network | Use `switchChain()` or prompt user |
| `VERIFICATION_FAILED` | Contract query failed | Verify contract address and deployment |
| `CONTRACT_ERROR` | Smart contract call error | Check contract ABI compatibility |
| `MINT_FAILED` | Minting transaction failed | Check transaction details |
| `MINT_REJECTED` | User rejected mint transaction | Handle gracefully, allow retry |
| `INSUFFICIENT_FUNDS` | Wallet balance too low | Prompt user to add funds |
| `USER_CANCELLED` | User cancelled operation | Handle gracefully, allow retry |
| `NETWORK_ERROR` | General network issue | Check connectivity, retry |

---

## Getting Help

If you're still having issues:

1. **Subscribe to state and error events**
   ```typescript
   glwm.subscribe((state) => console.log('State:', state));
   const glwm = new GLWM({
     ...config,
     onError: (error) => console.error('Error:', error),
   });
   ```

2. **Review documentation**
   - [API Reference](./api.md)
   - [Architecture](./architecture.md)
   - [FAQ](./FAQ.md)

3. **Report an issue**
   - [GitHub Issues](https://github.com/kase1111-hash/Game-Wallet/issues)
   - Include: SDK version, config (without secrets), error messages, steps to reproduce
