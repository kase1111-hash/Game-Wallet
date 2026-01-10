/**
 * Environment Configuration Loader
 *
 * Automatically loads the appropriate configuration based on NODE_ENV.
 */

import { GLWMConfig } from '../src';
import developmentConfig from './development';
import stagingConfig from './staging';
import productionConfig from './production';

export type Environment = 'development' | 'staging' | 'production';

/**
 * Get current environment from NODE_ENV
 */
export function getEnvironment(): Environment {
  const env = process.env.NODE_ENV?.toLowerCase();

  switch (env) {
    case 'production':
    case 'prod':
      return 'production';
    case 'staging':
    case 'stage':
      return 'staging';
    default:
      return 'development';
  }
}

/**
 * Get configuration for a specific environment
 */
export function getConfig(environment?: Environment): Partial<GLWMConfig> {
  const env = environment || getEnvironment();

  switch (env) {
    case 'production':
      return productionConfig;
    case 'staging':
      return stagingConfig;
    default:
      return developmentConfig;
  }
}

/**
 * Create a complete GLWM configuration by merging environment config with required fields
 */
export function createConfig(
  licenseContract: string,
  overrides?: Partial<GLWMConfig>
): GLWMConfig {
  const envConfig = getConfig();

  return {
    licenseContract,
    chainId: envConfig.chainId || 137,
    rpcProvider: envConfig.rpcProvider || {
      provider: 'custom',
      customUrl: 'https://polygon-rpc.com',
    },
    mintingPortal: envConfig.mintingPortal || {
      url: 'https://mint.example.com',
      mode: 'webview',
    },
    ...envConfig,
    ...overrides,
  } as GLWMConfig;
}

// Re-export individual configs
export { developmentConfig } from './development';
export { stagingConfig } from './staging';
export { productionConfig } from './production';

// Default export is the config for current environment
export default getConfig();
