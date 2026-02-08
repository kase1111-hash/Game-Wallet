// GLWM SDK — Basic Example
// Prerequisites: MetaMask installed, npm run build completed

const CONTRACT = '0x0000000000000000000000000000000000000000'; // Replace with your contract
const CHAIN_ID = 11155111; // Sepolia testnet

const statusEl = document.getElementById('status');
const btn = document.getElementById('verify-btn');

function log(msg) {
  statusEl.textContent += '\n' + msg;
  statusEl.scrollTop = statusEl.scrollHeight;
}

// Initialize SDK
const glwm = new GLWM({
  licenseContract: CONTRACT,
  chainId: CHAIN_ID,
  rpcProvider: {
    provider: 'custom',
    customUrl: 'https://rpc.sepolia.org',
  },
  mintingPortal: {
    url: 'https://mint.example.com',
    mode: 'iframe',
  },
  onError: (err) => log('Error: ' + err.message),
  onWalletConnected: (conn) => log('Wallet: ' + conn.address),
  onLicenseVerified: (result) => log('License valid: ' + result.isValid),
});

// Subscribe to state changes
glwm.subscribe((state) => {
  log('State: ' + state.status);
});

btn.addEventListener('click', async () => {
  btn.disabled = true;
  statusEl.textContent = 'Starting...';

  try {
    await glwm.initialize();
    const result = await glwm.verifyAndPlay();

    if (result.isValid) {
      log('License verified — launching game!');
    } else {
      log('No valid license. Reason: ' + (result.reason ?? 'unknown'));
    }
  } catch (err) {
    log('Failed: ' + (err.message || err));
  } finally {
    btn.disabled = false;
  }
});
