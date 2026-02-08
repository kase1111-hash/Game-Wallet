# Basic GLWM SDK Example

Minimal browser example showing `verifyAndPlay()` with MetaMask on Sepolia testnet.

## Setup

1. Build the SDK:
   ```bash
   npm run build
   ```

2. Edit `app.js` — set `CONTRACT` to your deployed ERC-721 license contract address.

3. Serve the example with any static server:
   ```bash
   npx serve .
   ```

4. Open `http://localhost:3000` in a browser with MetaMask installed.

5. Click **Verify & Play** — MetaMask will prompt for connection, then the SDK verifies license ownership on-chain.
