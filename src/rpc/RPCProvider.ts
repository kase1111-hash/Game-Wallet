import { JsonRpcProvider, Network } from 'ethers';
import type { RPCConfig, ChainId, GLWMError } from '../types';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance().child('RPCProvider');

/**
 * RPC Provider abstraction supporting multiple providers with fallback
 */
export class RPCProvider {
  private provider: JsonRpcProvider | null = null;
  private fallbackProviders: JsonRpcProvider[] = [];
  private config: RPCConfig;
  private chainId: ChainId;

  constructor(config: RPCConfig, chainId: ChainId) {
    this.config = config;
    this.chainId = chainId;
  }

  /**
   * Initialize the RPC provider connection
   */
  async initialize(): Promise<void> {
    const primaryUrl = this.buildRpcUrl(this.config);
    const network = Network.from(this.chainId);

    this.provider = new JsonRpcProvider(primaryUrl, network, {
      staticNetwork: network,
    });

    // Set up fallback providers
    if (this.config.fallbackUrls) {
      for (const url of this.config.fallbackUrls) {
        this.fallbackProviders.push(
          new JsonRpcProvider(url, network, {
            staticNetwork: network,
          })
        );
      }
    }

    // Test connection
    await this.testConnection();
  }

  /**
   * Get the active provider instance
   */
  getProvider(): JsonRpcProvider {
    if (!this.provider) {
      throw this.createError('RPC_ERROR', 'RPC provider not initialized');
    }
    return this.provider;
  }

  /**
   * Execute an RPC call with automatic retry and fallback
   */
  async call<T>(fn: (provider: JsonRpcProvider) => Promise<T>): Promise<T> {
    const maxAttempts = this.config.retryAttempts ?? 3;
    const timeout = this.config.timeout ?? 30000;

    let lastError: Error | null = null;
    const allProviders = [this.provider, ...this.fallbackProviders].filter(
      (p): p is JsonRpcProvider => p !== null
    );

    for (let providerIndex = 0; providerIndex < allProviders.length; providerIndex++) {
      const provider = allProviders[providerIndex]!;
      if (providerIndex > 0) {
        logger.info(`Switching to fallback provider ${providerIndex}`);
      }
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const result = await this.withTimeout(fn(provider), timeout);
          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // Wait before retry with exponential backoff
          if (attempt < maxAttempts - 1) {
            logger.warn(`RPC call failed (attempt ${attempt + 1}/${maxAttempts}), retrying`, { error: lastError.message });
            await this.delay(Math.pow(2, attempt) * 1000);
          }
        }
      }
    }

    throw this.createError(
      'RPC_ERROR',
      `RPC call failed after ${maxAttempts} attempts: ${lastError?.message ?? 'Unknown error'}`
    );
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<number> {
    return this.call((provider) => provider.getBlockNumber());
  }

  /**
   * Get the current chain ID from the provider
   */
  async getChainId(): Promise<bigint> {
    return this.call(async (provider) => {
      const network = await provider.getNetwork();
      return network.chainId;
    });
  }

  /**
   * Build RPC URL based on provider configuration
   */
  private buildRpcUrl(config: RPCConfig): string {
    switch (config.provider) {
      case 'alchemy':
        if (!config.apiKey) {
          throw this.createError('CONFIGURATION_ERROR', 'Alchemy API key is required');
        }
        return this.getAlchemyUrl(this.chainId, config.apiKey);

      case 'infura':
        if (!config.apiKey) {
          throw this.createError('CONFIGURATION_ERROR', 'Infura API key is required');
        }
        return this.getInfuraUrl(this.chainId, config.apiKey);

      case 'custom':
        if (!config.customUrl) {
          throw this.createError('CONFIGURATION_ERROR', 'Custom RPC URL is required');
        }
        return config.customUrl;

      default:
        throw this.createError('CONFIGURATION_ERROR', `Unknown provider: ${config.provider}`);
    }
  }

  /**
   * Get Alchemy RPC URL for a given chain
   * Updated to remove deprecated testnets (Goerli, Mumbai) and add current ones
   */
  private getAlchemyUrl(chainId: ChainId, apiKey: string): string {
    const networks: Record<number, string> = {
      // Ethereum
      1: 'eth-mainnet',
      11155111: 'eth-sepolia',
      17000: 'eth-holesky',
      // Polygon
      137: 'polygon-mainnet',
      80002: 'polygon-amoy',
      // Arbitrum
      42161: 'arb-mainnet',
      421614: 'arb-sepolia',
      // Optimism
      10: 'opt-mainnet',
      11155420: 'opt-sepolia',
      // Base
      8453: 'base-mainnet',
      84532: 'base-sepolia',
    };

    const network = networks[chainId];
    if (!network) {
      throw this.createError('CONFIGURATION_ERROR', `Alchemy does not support chain ID ${chainId}`);
    }

    return `https://${network}.g.alchemy.com/v2/${apiKey}`;
  }

  /**
   * Get Infura RPC URL for a given chain
   * Updated to remove deprecated testnets (Goerli, Mumbai) and add current ones
   */
  private getInfuraUrl(chainId: ChainId, apiKey: string): string {
    const networks: Record<number, string> = {
      // Ethereum
      1: 'mainnet',
      11155111: 'sepolia',
      17000: 'holesky',
      // Polygon
      137: 'polygon-mainnet',
      80002: 'polygon-amoy',
      // Arbitrum
      42161: 'arbitrum-mainnet',
      421614: 'arbitrum-sepolia',
      // Optimism
      10: 'optimism-mainnet',
      11155420: 'optimism-sepolia',
      // Base
      8453: 'base-mainnet',
      84532: 'base-sepolia',
    };

    const network = networks[chainId];
    if (!network) {
      throw this.createError('CONFIGURATION_ERROR', `Infura does not support chain ID ${chainId}`);
    }

    return `https://${network}.infura.io/v3/${apiKey}`;
  }

  /**
   * Test the RPC connection
   */
  private async testConnection(): Promise<void> {
    try {
      await this.getBlockNumber();
    } catch {
      throw this.createError('RPC_ERROR', 'Failed to connect to RPC provider');
    }
  }

  /**
   * Execute a promise with timeout, properly cleaning up the timer on success
   */
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request timed out after ${ms}ms`));
      }, ms);

      promise
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create a GLWM error
   */
  private createError(code: GLWMError['code'], message: string): GLWMError {
    return {
      code,
      message,
      recoverable: code === 'RPC_ERROR',
    };
  }
}
