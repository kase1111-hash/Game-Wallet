---
name: Bug Report
about: Report a bug to help us improve GLWM SDK
title: '[BUG] '
labels: bug
assignees: ''
---

## Bug Description

A clear and concise description of what the bug is.

## Steps to Reproduce

1. Initialize SDK with '...'
2. Call method '...'
3. Pass parameters '...'
4. See error

## Expected Behavior

A clear and concise description of what you expected to happen.

## Actual Behavior

What actually happened instead.

## Error Messages

```
Paste any error messages, stack traces, or console output here
```

## Environment

- **GLWM SDK Version**: [e.g., 0.1.0]
- **Node.js Version**: [e.g., 18.19.0]
- **Operating System**: [e.g., macOS 14.2, Ubuntu 22.04, Windows 11]
- **Browser** (if applicable): [e.g., Chrome 120, Firefox 121]
- **Wallet Provider**: [e.g., MetaMask, WalletConnect, Phantom]

## Blockchain Context

- **Chain**: [e.g., Ethereum Mainnet, Polygon, Arbitrum]
- **Chain ID**: [e.g., 1, 137, 42161]
- **RPC Provider**: [e.g., Alchemy, Infura, Custom]

## Code Example

```typescript
// Minimal code example that reproduces the issue
import { GLWM } from '@glwm/sdk';

const sdk = new GLWM({
  // your config
});

// Code that triggers the bug
```

## Additional Context

Add any other context about the problem here (screenshots, logs, related issues, etc.).

## Possible Solution

If you have suggestions on how to fix the bug, please describe them here.

## Checklist

- [ ] I have searched existing issues to ensure this bug hasn't been reported
- [ ] I have provided a minimal reproducible example
- [ ] I have included all relevant environment information
- [ ] I am using the latest version of the SDK
