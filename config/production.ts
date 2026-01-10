/**
 * Production Environment Configuration
 *
 * Use this configuration for live production deployments.
 * These settings prioritize security, performance, and reliability.
 */

import { GLWMConfig } from '../src';

export const productionConfig: Partial<GLWMConfig> = {
  // Use mainnet chains for production
  chainId: 137, // Polygon Mainnet

  // RPC Provider - use premium providers for reliability
  rpcProvider: {
    provider: 'alchemy',
    apiKey: process.env.PROD_ALCHEMY_API_KEY || '',
  },

  // Minting portal in production
  mintingPortal: {
    url: process.env.PROD_MINTING_PORTAL_URL || 'https://mint.example.com',
    mode: 'iframe',
  },

  // Cache enabled with longer TTL for performance
  cacheConfig: {
    enabled: true,
    ttlSeconds: 600, // 10 minutes
    storageKey: 'glwm-prod',
  },

  // Minimal logging for production (errors and warnings only)
  logLevel: 'warn',
};

/**
 * Production RPC endpoints (always use API keys)
 */
export const productionRpcEndpoints = {
  // Ethereum Mainnet
  ethereum: `https://eth-mainnet.g.alchemy.com/v2/${process.env.PROD_ALCHEMY_API_KEY}`,

  // Polygon Mainnet
  polygon: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.PROD_ALCHEMY_API_KEY}`,

  // Arbitrum One
  arbitrum: `https://arb-mainnet.g.alchemy.com/v2/${process.env.PROD_ALCHEMY_API_KEY}`,

  // Optimism
  optimism: `https://opt-mainnet.g.alchemy.com/v2/${process.env.PROD_ALCHEMY_API_KEY}`,

  // Base
  base: `https://base-mainnet.g.alchemy.com/v2/${process.env.PROD_ALCHEMY_API_KEY}`,
};

/**
 * Production contract addresses
 */
export const productionContracts = {
  // Your deployed production license contract
  licenseContract: process.env.PROD_LICENSE_CONTRACT || '',
};

/**
 * Production chain IDs
 */
export const productionChains = {
  ethereum: 1,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
};

export default productionConfig;
