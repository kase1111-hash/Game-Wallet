# Quick Start Guide

Get from `npm install` to a working integration in 5 minutes.

## 1. Install

```bash
npm install @glwm/sdk
```

## 2. Initialize

```typescript
import { GLWM } from '@glwm/sdk';

const glwm = new GLWM({
  licenseContract: '0x1234567890123456789012345678901234567890',
  chainId: 137, // Polygon
  rpcProvider: {
    provider: 'alchemy',
    apiKey: process.env.ALCHEMY_KEY!,
  },
  mintingPortal: {
    url: 'https://mint.mygame.com',
    mode: 'iframe',
  },
  onError: (error) => console.error('[GLWM]', error.code, error.message),
});

await glwm.initialize();
```

## 3. Verify and Play

The simplest integration — one call handles everything:

```typescript
const result = await glwm.verifyAndPlay();

if (result.isValid) {
  console.log('License valid! Token:', result.license?.tokenId);
  startGame();
} else {
  console.log('No valid license.', result.reason);
}
```

`verifyAndPlay()` automatically:
1. Connects the wallet if not already connected
2. Checks for a valid license NFT
3. Opens the minting portal if no license exists
4. Re-verifies after the portal closes

## 4. Step-by-Step (Advanced)

For more control, call each method individually:

```typescript
// Connect wallet
const connection = await glwm.connectWallet('metamask');
console.log('Connected:', connection.address, 'on chain', connection.chainId);

// Verify license
const result = await glwm.verifyLicense();

if (result.isValid) {
  startGame();
} else {
  // Open minting portal manually
  await glwm.openMintingPortal();
}
```

## React Example

```tsx
import { useEffect, useState } from 'react';
import { GLWM, GLWMState } from '@glwm/sdk';

const config = {
  licenseContract: '0x1234567890123456789012345678901234567890',
  chainId: 137,
  rpcProvider: { provider: 'alchemy' as const, apiKey: 'YOUR_KEY' },
  mintingPortal: { url: 'https://mint.mygame.com', mode: 'iframe' as const },
};

function App() {
  const [glwm] = useState(() => new GLWM(config));
  const [state, setState] = useState<GLWMState>(glwm.getState());

  useEffect(() => {
    glwm.initialize();
    const unsubscribe = glwm.subscribe(setState);
    return () => {
      unsubscribe();
      glwm.dispose();
    };
  }, [glwm]);

  const handlePlay = async () => {
    const result = await glwm.verifyAndPlay();
    if (result.isValid) {
      // Start your game
    }
  };

  return (
    <div>
      <p>Status: {state.status}</p>
      <button onClick={handlePlay} disabled={state.status === 'uninitialized'}>
        Play
      </button>
    </div>
  );
}
```

## Listening to Events

```typescript
// Subscribe to all state changes
const unsubscribe = glwm.subscribe((state) => {
  console.log('State:', state.status);
});

// Listen to specific events
glwm.on('WALLET_CONNECTED', (event) => {
  console.log('Wallet connected:', event.connection.address);
});

glwm.on('LICENSE_VERIFIED', (event) => {
  console.log('License valid:', event.result.isValid);
});

glwm.on('MINT_COMPLETED', (event) => {
  console.log('Mint result:', event.result);
});
```

## Minting Portal Protocol

Your minting portal communicates with the SDK via `postMessage`. The SDK sends wallet info when the portal is ready, and the portal sends back mint events:

```javascript
// Portal → SDK messages:
{ type: 'PORTAL_READY' }
{ type: 'MINT_STARTED', payload: { transactionHash: '0x...' } }
{ type: 'MINT_COMPLETED', payload: { success: true, tokenId: '42' } }
{ type: 'MINT_FAILED', payload: { code: 'MINT_FAILED', message: '...' } }
{ type: 'PORTAL_CLOSED' }

// SDK → Portal message (sent after PORTAL_READY):
{ type: 'WALLET_INFO', wallet: '0x...' }
```

## Troubleshooting

**"Invalid configuration"** — Check that `licenseContract` is a valid 42-character hex address, `chainId` is a positive number, and `rpcProvider` has either `apiKey` (for Alchemy/Infura) or `customUrl` (for custom). Use `GLWM.validateConfig(config)` to see specific errors.

**"Failed to connect to RPC provider"** — Verify your API key is correct and supports the configured `chainId`. Test the endpoint directly with a `curl` or `fetch` call.

**Wallet not found** — The user doesn't have the wallet extension installed. Check with `glwm.isProviderAvailable('metamask')` before attempting connection.

**Chain mismatch** — The wallet is on a different chain than `chainId`. Use `glwm.switchChain(chainId)` to prompt the user to switch, or handle via the `onError` callback.

**Stale verification** — Clear the cache with `glwm.clearCache()` or use `glwm.verifyLicenseFresh()` to bypass it.

## Next Steps

- [API Reference](./api.md) — full method signatures and type definitions
