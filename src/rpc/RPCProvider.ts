import { JsonRpcProvider, Network } from 'ethers';
import type { RPCConfig, ChainId, GLWMError } from '../types';

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

    for (const provider of allProviders) {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const result = await Promise.race([fn(provider), this.createTimeoutPromise<T>(timeout)]);
          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // Wait before retry with exponential backoff
          if (attempt < maxAttempts - 1) {
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
   */
  private getAlchemyUrl(chainId: ChainId, apiKey: string): string {
    const networks: Record<number, string> = {
      1: 'eth-mainnet',
      5: 'eth-goerli',
      11155111: 'eth-sepolia',
      137: 'polygon-mainnet',
      80001: 'polygon-mumbai',
      42161: 'arb-mainnet',
      421613: 'arb-goerli',
      10: 'opt-mainnet',
      420: 'opt-goerli',
    };

    const network = networks[chainId];
    if (!network) {
      throw this.createError('CONFIGURATION_ERROR', `Alchemy does not support chain ID ${chainId}`);
    }

    return `https://${network}.g.alchemy.com/v2/${apiKey}`;
  }

  /**
   * Get Infura RPC URL for a given chain
   */
  private getInfuraUrl(chainId: ChainId, apiKey: string): string {
    const networks: Record<number, string> = {
      1: 'mainnet',
      5: 'goerli',
      11155111: 'sepolia',
      137: 'polygon-mainnet',
      80001: 'polygon-mumbai',
      42161: 'arbitrum-mainnet',
      421613: 'arbitrum-goerli',
      10: 'optimism-mainnet',
      420: 'optimism-goerli',
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
   * Create a timeout promise
   */
  private createTimeoutPromise<T>(ms: number): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms);
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
