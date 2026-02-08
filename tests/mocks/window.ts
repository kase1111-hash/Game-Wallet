/**
 * Mock browser globals for testing DOM-dependent modules
 */

import { MockEthereumProvider, MockProviderOptions } from './ethereum-provider';

/**
 * Set up a mock window.ethereum (MetaMask-like)
 */
export function setupMetaMask(options: Omit<MockProviderOptions, 'isMetaMask'> = {}): MockEthereumProvider {
  const provider = new MockEthereumProvider({ ...options, isMetaMask: true });
  (globalThis as Record<string, unknown>).window = {
    ...(globalThis as Record<string, unknown>).window as object,
    ethereum: provider,
  };
  return provider;
}

/**
 * Set up a mock window.ethereum (Coinbase-like)
 */
export function setupCoinbase(options: Omit<MockProviderOptions, 'isCoinbaseWallet'> = {}): MockEthereumProvider {
  const provider = new MockEthereumProvider({ ...options, isCoinbaseWallet: true });
  (globalThis as Record<string, unknown>).window = {
    ...(globalThis as Record<string, unknown>).window as object,
    ethereum: provider,
  };
  return provider;
}

/**
 * Set up a mock window.phantom.ethereum (Phantom-like)
 */
export function setupPhantom(options: Omit<MockProviderOptions, 'isPhantom'> = {}): MockEthereumProvider {
  const provider = new MockEthereumProvider({ ...options, isPhantom: true });
  (globalThis as Record<string, unknown>).window = {
    ...(globalThis as Record<string, unknown>).window as object,
    phantom: { ethereum: provider },
  };
  return provider;
}

/**
 * Clean up all mock window globals
 */
export function cleanupWindow(): void {
  const win = (globalThis as Record<string, unknown>).window as Record<string, unknown> | undefined;
  if (win) {
    delete win.ethereum;
    delete win.phantom;
  }
}
