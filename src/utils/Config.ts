import type { GLWMConfig, RPCConfig, MintingPortalConfig, CacheConfig } from '../types';
import type { LoggerConfig } from './Logger';
import type { ErrorReporterConfig } from './ErrorReporter';
import { LogLevel } from './Logger';

/**
 * Extended configuration with logging and error reporting
 */
export interface ExtendedGLWMConfig extends GLWMConfig {
  logging?: Partial<LoggerConfig>;
  errorReporting?: Partial<ErrorReporterConfig>;
}

/**
 * Environment variable names
 */
export const ENV_KEYS = {
  // RPC Configuration
  RPC_PROVIDER: 'GLWM_RPC_PROVIDER',
  RPC_API_KEY: 'GLWM_RPC_API_KEY',
  RPC_CUSTOM_URL: 'GLWM_RPC_CUSTOM_URL',
  RPC_FALLBACK_URLS: 'GLWM_RPC_FALLBACK_URLS',

  // Contract Configuration
  LICENSE_CONTRACT: 'GLWM_LICENSE_CONTRACT',
  CHAIN_ID: 'GLWM_CHAIN_ID',

  // Minting Portal
  MINTING_PORTAL_URL: 'GLWM_MINTING_PORTAL_URL',
  MINTING_PORTAL_MODE: 'GLWM_MINTING_PORTAL_MODE',

  // Logging
  LOG_LEVEL: 'GLWM_LOG_LEVEL',

  // Error Reporting
  SENTRY_DSN: 'GLWM_SENTRY_DSN',
  ENVIRONMENT: 'GLWM_ENVIRONMENT',
  RELEASE: 'GLWM_RELEASE',

  // Cache
  CACHE_ENABLED: 'GLWM_CACHE_ENABLED',
  CACHE_TTL: 'GLWM_CACHE_TTL',
} as const;

/**
 * Configuration manager for secure handling of environment variables and secrets
 */
export class ConfigManager {
  private envCache: Map<string, string | undefined> = new Map();
  private sensitiveKeys: Set<string> = new Set([ENV_KEYS.RPC_API_KEY, ENV_KEYS.SENTRY_DSN]);

  /**
   * Get an environment variable value
   */
  getEnv(key: string, defaultValue?: string): string | undefined {
    // Check cache first
    if (this.envCache.has(key)) {
      return this.envCache.get(key) ?? defaultValue;
    }

    let value: string | undefined;

    // Try process.env (Node.js)
    if (typeof process !== 'undefined' && process.env) {
      value = process.env[key];
    }

    // Cache the result
    this.envCache.set(key, value);

    return value ?? defaultValue;
  }

  /**
   * Get a required environment variable (throws if not set)
   */
  getRequiredEnv(key: string): string {
    const value = this.getEnv(key);
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }

  /**
   * Get an environment variable as a number
   */
  getEnvAsNumber(key: string, defaultValue?: number): number | undefined {
    const value = this.getEnv(key);
    if (value === undefined) {
      return defaultValue;
    }
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Get an environment variable as a boolean
   */
  getEnvAsBoolean(key: string, defaultValue?: boolean): boolean | undefined {
    const value = this.getEnv(key);
    if (value === undefined) {
      return defaultValue;
    }
    return value.toLowerCase() === 'true' || value === '1';
  }

  /**
   * Get an environment variable as an array (comma-separated)
   */
  getEnvAsArray(key: string, defaultValue?: string[]): string[] | undefined {
    const value = this.getEnv(key);
    if (value === undefined) {
      return defaultValue;
    }
    return value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * Check if a key contains sensitive data
   */
  isSensitive(key: string): boolean {
    return this.sensitiveKeys.has(key);
  }

  /**
   * Mask a sensitive value for logging
   */
  maskSensitive(value: string): string {
    if (value.length <= 8) {
      return '****';
    }
    return value.slice(0, 4) + '****' + value.slice(-4);
  }

  /**
   * Build RPC configuration from environment
   */
  buildRpcConfig(): Partial<RPCConfig> {
    const provider = this.getEnv(ENV_KEYS.RPC_PROVIDER) as RPCConfig['provider'] | undefined;
    const apiKey = this.getEnv(ENV_KEYS.RPC_API_KEY);
    const customUrl = this.getEnv(ENV_KEYS.RPC_CUSTOM_URL);
    const fallbackUrls = this.getEnvAsArray(ENV_KEYS.RPC_FALLBACK_URLS);

    const config: Partial<RPCConfig> = {};

    if (provider) {
      config.provider = provider;
    }
    if (apiKey) {
      config.apiKey = apiKey;
    }
    if (customUrl) {
      config.customUrl = customUrl;
    }
    if (fallbackUrls) {
      config.fallbackUrls = fallbackUrls;
    }

    return config;
  }

  /**
   * Build minting portal configuration from environment
   */
  buildMintingPortalConfig(): Partial<MintingPortalConfig> {
    const url = this.getEnv(ENV_KEYS.MINTING_PORTAL_URL);
    const mode = this.getEnv(ENV_KEYS.MINTING_PORTAL_MODE) as
      | MintingPortalConfig['mode']
      | undefined;

    const config: Partial<MintingPortalConfig> = {};

    if (url) {
      config.url = url;
    }
    if (mode) {
      config.mode = mode;
    }

    return config;
  }

  /**
   * Build logger configuration from environment
   */
  buildLoggerConfig(): Partial<LoggerConfig> {
    const levelStr = this.getEnv(ENV_KEYS.LOG_LEVEL);

    const config: Partial<LoggerConfig> = {};

    if (levelStr) {
      const level = LogLevel[levelStr.toUpperCase() as keyof typeof LogLevel];
      if (level !== undefined) {
        config.level = level;
      }
    }

    return config;
  }

  /**
   * Build error reporter configuration from environment
   */
  buildErrorReporterConfig(): Partial<ErrorReporterConfig> {
    const dsn = this.getEnv(ENV_KEYS.SENTRY_DSN);
    const environment = this.getEnv(ENV_KEYS.ENVIRONMENT);
    const release = this.getEnv(ENV_KEYS.RELEASE);

    const config: Partial<ErrorReporterConfig> = {};

    if (dsn) {
      config.enabled = true;
      config.dsn = dsn;
    }
    if (environment) {
      config.environment = environment;
    }
    if (release) {
      config.release = release;
    }

    return config;
  }

  /**
   * Build cache configuration from environment
   */
  buildCacheConfig(): Partial<CacheConfig> {
    const enabled = this.getEnvAsBoolean(ENV_KEYS.CACHE_ENABLED);
    const ttl = this.getEnvAsNumber(ENV_KEYS.CACHE_TTL);

    const config: Partial<CacheConfig> = {};

    if (enabled !== undefined) {
      config.enabled = enabled;
    }
    if (ttl !== undefined) {
      config.ttlSeconds = ttl;
    }

    return config;
  }

  /**
   * Build complete GLWM configuration from environment
   * Merges with provided base config, with environment taking precedence
   */
  buildConfig(baseConfig?: Partial<ExtendedGLWMConfig>): ExtendedGLWMConfig {
    const licenseContract =
      this.getEnv(ENV_KEYS.LICENSE_CONTRACT) ?? baseConfig?.licenseContract ?? '';
    const chainId = this.getEnvAsNumber(ENV_KEYS.CHAIN_ID) ?? baseConfig?.chainId ?? 1;

    const envRpcConfig = this.buildRpcConfig();
    const envPortalConfig = this.buildMintingPortalConfig();
    const envCacheConfig = this.buildCacheConfig();
    const envLoggerConfig = this.buildLoggerConfig();
    const envErrorConfig = this.buildErrorReporterConfig();

    return {
      licenseContract,
      chainId,
      rpcProvider: {
        provider: 'custom' as const,
        ...baseConfig?.rpcProvider,
        ...envRpcConfig,
      },
      mintingPortal: {
        url: '',
        mode: 'webview' as const,
        ...baseConfig?.mintingPortal,
        ...envPortalConfig,
      },
      cacheConfig: {
        enabled: true,
        ttlSeconds: 300,
        storageKey: 'glwm',
        ...baseConfig?.cacheConfig,
        ...envCacheConfig,
      },
      logging: {
        ...baseConfig?.logging,
        ...envLoggerConfig,
      },
      errorReporting: {
        ...baseConfig?.errorReporting,
        ...envErrorConfig,
      },
      onLicenseVerified: baseConfig?.onLicenseVerified,
      onWalletConnected: baseConfig?.onWalletConnected,
      onError: baseConfig?.onError,
    };
  }

  /**
   * Validate that required configuration is present
   */
  validateConfig(config: ExtendedGLWMConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.licenseContract) {
      errors.push('License contract address is required');
    }

    if (!config.chainId || config.chainId <= 0) {
      errors.push('Valid chain ID is required');
    }

    if (!config.rpcProvider) {
      errors.push('RPC provider configuration is required');
    } else {
      if (config.rpcProvider.provider === 'alchemy' && !config.rpcProvider.apiKey) {
        errors.push('Alchemy API key is required when using Alchemy provider');
      }
      if (config.rpcProvider.provider === 'infura' && !config.rpcProvider.apiKey) {
        errors.push('Infura API key is required when using Infura provider');
      }
      if (config.rpcProvider.provider === 'custom' && !config.rpcProvider.customUrl) {
        errors.push('Custom URL is required when using custom provider');
      }
    }

    if (!config.mintingPortal?.url) {
      errors.push('Minting portal URL is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clear the environment cache
   */
  clearCache(): void {
    this.envCache.clear();
  }
}

/**
 * Global config manager instance
 */
export const configManager = new ConfigManager();

/**
 * Create configuration from environment variables
 */
export function createConfigFromEnv(baseConfig?: Partial<ExtendedGLWMConfig>): ExtendedGLWMConfig {
  return configManager.buildConfig(baseConfig);
}
