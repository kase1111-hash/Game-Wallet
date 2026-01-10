/**
 * Development Environment Configuration
 *
 * Use this configuration for local development and testing.
 * These settings prioritize debugging and development experience.
 */

import { GLWMConfig } from '../src';

export const developmentConfig: Partial<GLWMConfig> = {
  // Use testnet chains for development
  chainId: 80001, // Polygon Mumbai Testnet

  // RPC Provider - use free/public endpoints for dev
  rpcProvider: {
    provider: 'custom',
    customUrl: process.env.DEV_RPC_URL || 'https://rpc-mumbai.maticvigil.com',
  },

  // Minting portal in webview mode for easier debugging
  mintingPortal: {
    url: process.env.DEV_MINTING_PORTAL_URL || 'http://localhost:3000/mint',
    mode: 'webview',
  },

  // Cache disabled for development to see real-time changes
  cacheConfig: {
    enabled: false,
    ttlSeconds: 60,
    storageKey: 'glwm-dev',
  },

  // Verbose logging for debugging
  logLevel: 'debug',
};

/**
 * Development RPC endpoints for various testnets
 */
export const devRpcEndpoints = {
  // Ethereum testnets
  sepolia: 'https://rpc.sepolia.org',
  goerli: 'https://rpc.goerli.eth.gateway.fm',

  // Polygon testnets
  mumbai: 'https://rpc-mumbai.maticvigil.com',

  // Arbitrum testnet
  arbitrumGoerli: 'https://goerli-rollup.arbitrum.io/rpc',

  // Optimism testnet
  optimismGoerli: 'https://goerli.optimism.io',

  // Base testnet
  baseGoerli: 'https://goerli.base.org',
};

/**
 * Test contract addresses (deploy your own for development)
 */
export const devContracts = {
  // Example ERC721 test contract on Mumbai
  testLicenseContract: '0x0000000000000000000000000000000000000000', // Replace with your test contract
};

export default developmentConfig;
