# GLWM SDK - Quickstart Guide

Get up and running with the Game License Wallet Module in minutes.

## Installation

```bash
npm install @glwm/sdk
```

## Basic Setup

```typescript
import { GLWM } from '@glwm/sdk';

// Create SDK instance
const glwm = new GLWM({
  licenseContract: '0x1234567890123456789012345678901234567890',
  chainId: 137, // Polygon
  rpcProvider: {
    provider: 'alchemy',
    apiKey: 'your-alchemy-api-key',
  },
  mintingPortal: {
    url: 'https://your-mint-site.com',
    mode: 'iframe',
  },
});

// Initialize
await glwm.initialize();
```

## Connect Wallet

```typescript
// Connect wallet (defaults to MetaMask)
const connection = await glwm.connectWallet();
console.log('Connected:', connection.address);

// Or specify provider
await glwm.connectWallet('metamask');
```

## Verify License

```typescript
const result = await glwm.verifyLicense();

if (result.isValid) {
  console.log('License found! Token ID:', result.license?.tokenId);
  // Grant access to game
} else {
  console.log('No license found, reason:', result.reason);
  // Show minting option
}
```

## Open Minting Portal

```typescript
// Open the minting portal (configured in GLWMConfig)
await glwm.openMintingPortal();

// Listen for mint completion
glwm.on('MINT_COMPLETED', (event) => {
  console.log('License minted:', event.result.tokenId);
});

// Close portal programmatically if needed
glwm.closeMintingPortal();
```

## Listen to Events

```typescript
// Subscribe to all state changes
glwm.subscribe((state) => {
  console.log('State:', state.status);
});

// Listen to specific events
glwm.on('WALLET_CONNECTED', (event) => {
  console.log('Wallet connected:', event.connection.address);
});

glwm.on('LICENSE_VERIFIED', (event) => {
  console.log('License valid:', event.result.isValid);
});
```

## Complete Example

```typescript
import { GLWM } from '@glwm/sdk';

async function initGame() {
  // 1. Create and initialize SDK
  const glwm = new GLWM({
    licenseContract: process.env.LICENSE_CONTRACT!,
    chainId: 137,
    rpcProvider: {
      provider: 'alchemy',
      apiKey: process.env.ALCHEMY_KEY!,
    },
    mintingPortal: {
      url: process.env.MINT_PORTAL_URL!,
      mode: 'iframe',
    },
    onError: (error) => console.error('GLWM Error:', error.message),
  });

  await glwm.initialize();

  // 2. Connect wallet
  try {
    await glwm.connectWallet();
  } catch (error) {
    console.log('Please connect your wallet');
    return;
  }

  // 3. Verify license
  const result = await glwm.verifyLicense();

  if (result.isValid) {
    // 4a. Start game
    startGame();
  } else {
    // 4b. Open minting portal and wait for completion
    glwm.on('MINT_COMPLETED', async () => {
      // Re-verify after minting
      const freshResult = await glwm.verifyLicenseFresh();
      if (freshResult.isValid) {
        startGame();
      }
    });
    await glwm.openMintingPortal();
  }
}

// Or use the convenience method that handles the full flow:
async function initGameSimple() {
  const glwm = new GLWM({ /* config */ });
  await glwm.initialize();

  const result = await glwm.verifyAndPlay();
  if (result.isValid) {
    startGame();
  }
}

function startGame() {
  console.log('Starting game...');
}

initGame();
```

## React Example

```tsx
import { useEffect, useState, useCallback } from 'react';
import { GLWM, type GLWMState } from '@glwm/sdk';

const config = {
  licenseContract: '0x...',
  chainId: 137,
  rpcProvider: { provider: 'alchemy' as const, apiKey: 'your-key' },
  mintingPortal: { url: 'https://mint.example.com', mode: 'iframe' as const },
};

function App() {
  const [glwm] = useState(() => new GLWM(config));
  const [state, setState] = useState<GLWMState>({ status: 'uninitialized' });

  useEffect(() => {
    glwm.initialize();
    const unsubscribe = glwm.subscribe(setState);
    return () => {
      unsubscribe();
      glwm.dispose();
    };
  }, [glwm]);

  const handleConnect = useCallback(() => glwm.connectWallet(), [glwm]);
  const handleVerify = useCallback(() => glwm.verifyLicense(), [glwm]);
  const handleMint = useCallback(() => glwm.openMintingPortal(), [glwm]);

  return (
    <div>
      <p>Status: {state.status}</p>
      {state.status === 'license_valid' && (
        <p>License: {state.license.tokenId}</p>
      )}
      {state.status === 'error' && (
        <p>Error: {state.error.message}</p>
      )}
      <button onClick={handleConnect}>Connect Wallet</button>
      <button onClick={handleVerify}>Verify License</button>
      <button onClick={handleMint}>Get License</button>
    </div>
  );
}
```

## Next Steps

- [API Reference](./api.md) - Complete API documentation
- [Architecture](./architecture.md) - System design and data flows
- [FAQ](./FAQ.md) - Common questions answered
- [Troubleshooting](./troubleshooting.md) - Solve common issues
