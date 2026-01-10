/**
 * Staging Environment Configuration
 *
 * Use this configuration for pre-production testing.
 * These settings mirror production but with testnet chains.
 */

import { GLWMConfig } from '../src';

export const stagingConfig: Partial<GLWMConfig> = {
  // Use testnet chains that mirror production networks
  chainId: 80001, // Polygon Mumbai (mirrors Polygon mainnet)

  // RPC Provider - use reliable testnet providers
  rpcProvider: {
    provider: 'alchemy',
    apiKey: process.env.STAGING_ALCHEMY_API_KEY || '',
  },

  // Minting portal pointing to staging environment
  mintingPortal: {
    url: process.env.STAGING_MINTING_PORTAL_URL || 'https://staging-mint.example.com',
    mode: 'iframe',
  },

  // Cache enabled with moderate TTL
  cacheConfig: {
    enabled: true,
    ttlSeconds: 300, // 5 minutes
    storageKey: 'glwm-staging',
  },

  // Info-level logging for staging
  logLevel: 'info',
};

/**
 * Staging RPC endpoints (use API keys for reliability)
 */
export const stagingRpcEndpoints = {
  // Ethereum Sepolia (recommended testnet)
  sepolia: `https://eth-sepolia.g.alchemy.com/v2/${process.env.STAGING_ALCHEMY_API_KEY}`,

  // Polygon Mumbai
  mumbai: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.STAGING_ALCHEMY_API_KEY}`,

  // Arbitrum Goerli
  arbitrumGoerli: `https://arb-goerli.g.alchemy.com/v2/${process.env.STAGING_ALCHEMY_API_KEY}`,

  // Optimism Goerli
  optimismGoerli: `https://opt-goerli.g.alchemy.com/v2/${process.env.STAGING_ALCHEMY_API_KEY}`,

  // Base Goerli
  baseGoerli: `https://base-goerli.g.alchemy.com/v2/${process.env.STAGING_ALCHEMY_API_KEY}`,
};

/**
 * Staging contract addresses
 */
export const stagingContracts = {
  // Deploy staging contracts that mirror production behavior
  licenseContract: process.env.STAGING_LICENSE_CONTRACT || '',
};

export default stagingConfig;
