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
// Connect wallet
const connection = await glwm.connectWallet();
console.log('Connected:', connection.address);

// Or specify provider
await glwm.connectWallet('metamask');
```

## Verify License

```typescript
const status = await glwm.verifyLicense();

if (status.isValid) {
  console.log('License found! Token ID:', status.tokenId);
  // Grant access to game
} else {
  console.log('No license found');
  // Show minting option
}
```

## Open Minting Portal

```typescript
glwm.openMintingPortal({
  onSuccess: (tokenId) => {
    console.log('License minted:', tokenId);
  },
  onCancel: () => {
    console.log('Minting cancelled');
  },
});
```

## Listen to Events

```typescript
// Subscribe to all state changes
glwm.subscribe((state) => {
  console.log('State:', state.status);
});

// Listen to specific events
glwm.on('WALLET_CONNECTED', (event) => {
  console.log('Wallet connected:', event.address);
});

glwm.on('LICENSE_VERIFIED', (event) => {
  console.log('License valid:', event.isValid);
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
    onError: (error) => console.error('GLWM Error:', error),
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
  const status = await glwm.verifyLicense();

  if (status.isValid) {
    // 4a. Start game
    startGame();
  } else {
    // 4b. Prompt to mint
    glwm.openMintingPortal({
      onSuccess: () => startGame(),
    });
  }
}

function startGame() {
  console.log('Starting game...');
}

initGame();
```

## React Example

```tsx
import { useEffect, useState } from 'react';
import { GLWM, GLWMState } from '@glwm/sdk';

function App() {
  const [glwm] = useState(() => new GLWM(config));
  const [state, setState] = useState<GLWMState>(glwm.getState());

  useEffect(() => {
    glwm.initialize();
    return glwm.subscribe(setState);
  }, [glwm]);

  const handleConnect = () => glwm.connectWallet();
  const handleVerify = () => glwm.verifyLicense();
  const handleMint = () => glwm.openMintingPortal();

  return (
    <div>
      <p>Status: {state.status}</p>
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
