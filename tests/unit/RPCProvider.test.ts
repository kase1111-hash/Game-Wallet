/**
 * Unit tests for RPCProvider
 *
 * Tests URL construction, retry logic, fallback behavior, and timeout enforcement.
 * Mocks ethers.js JsonRpcProvider to avoid live RPC connections.
 */

import { RPCProvider } from '../../src/rpc';

// Mock ethers.js
jest.mock('ethers', () => {
  let getBlockNumberFn: () => Promise<number> = async () => 12345678;
  let getNetworkFn: () => Promise<{ chainId: bigint }> = async () => ({ chainId: 137n });

  const MockJsonRpcProvider = jest.fn().mockImplementation(() => ({
    getBlockNumber: (...args: unknown[]) => getBlockNumberFn(),
    getNetwork: (...args: unknown[]) => getNetworkFn(),
  }));

  return {
    JsonRpcProvider: MockJsonRpcProvider,
    Network: {
      from: jest.fn().mockReturnValue({ chainId: 137n }),
    },
    // Expose setters for tests to control mock behavior
    __setGetBlockNumber: (fn: () => Promise<number>) => { getBlockNumberFn = fn; },
    __setGetNetwork: (fn: () => Promise<{ chainId: bigint }>) => { getNetworkFn = fn; },
    __resetMocks: () => {
      getBlockNumberFn = async () => 12345678;
      getNetworkFn = async () => ({ chainId: 137n });
    },
  };
});

const ethers = jest.requireMock('ethers') as {
  __setGetBlockNumber: (fn: () => Promise<number>) => void;
  __setGetNetwork: (fn: () => Promise<{ chainId: bigint }>) => void;
  __resetMocks: () => void;
  JsonRpcProvider: jest.Mock;
};

describe('RPCProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ethers.__resetMocks();
  });

  describe('URL construction', () => {
    it('should build correct Alchemy URL for Ethereum mainnet', async () => {
      const provider = new RPCProvider({ provider: 'alchemy', apiKey: 'test-key' }, 1);
      await provider.initialize();

      expect(ethers.JsonRpcProvider).toHaveBeenCalledWith(
        'https://eth-mainnet.g.alchemy.com/v2/test-key',
        expect.anything(),
        expect.anything()
      );
    });

    it('should build correct Alchemy URL for Polygon', async () => {
      const provider = new RPCProvider({ provider: 'alchemy', apiKey: 'test-key' }, 137);
      await provider.initialize();

      expect(ethers.JsonRpcProvider).toHaveBeenCalledWith(
        'https://polygon-mainnet.g.alchemy.com/v2/test-key',
        expect.anything(),
        expect.anything()
      );
    });

    it('should build correct Alchemy URL for Base', async () => {
      const provider = new RPCProvider({ provider: 'alchemy', apiKey: 'test-key' }, 8453);
      await provider.initialize();

      expect(ethers.JsonRpcProvider).toHaveBeenCalledWith(
        'https://base-mainnet.g.alchemy.com/v2/test-key',
        expect.anything(),
        expect.anything()
      );
    });

    it('should build correct Infura URL for Ethereum mainnet', async () => {
      const provider = new RPCProvider({ provider: 'infura', apiKey: 'test-key' }, 1);
      await provider.initialize();

      expect(ethers.JsonRpcProvider).toHaveBeenCalledWith(
        'https://mainnet.infura.io/v3/test-key',
        expect.anything(),
        expect.anything()
      );
    });

    it('should build correct Infura URL for Arbitrum', async () => {
      const provider = new RPCProvider({ provider: 'infura', apiKey: 'test-key' }, 42161);
      await provider.initialize();

      expect(ethers.JsonRpcProvider).toHaveBeenCalledWith(
        'https://arbitrum-mainnet.infura.io/v3/test-key',
        expect.anything(),
        expect.anything()
      );
    });

    it('should use custom URL directly', async () => {
      const provider = new RPCProvider(
        { provider: 'custom', customUrl: 'https://my-rpc.example.com' },
        137
      );
      await provider.initialize();

      expect(ethers.JsonRpcProvider).toHaveBeenCalledWith(
        'https://my-rpc.example.com',
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('validation errors', () => {
    it('should reject unsupported chain ID for Alchemy', () => {
      expect(
        () => new RPCProvider({ provider: 'alchemy', apiKey: 'key' }, 99999)
      ).not.toThrow(); // Construction doesn't throw

      const provider = new RPCProvider({ provider: 'alchemy', apiKey: 'key' }, 99999);
      expect(provider.initialize()).rejects.toMatchObject({
        code: 'CONFIGURATION_ERROR',
        message: expect.stringContaining('does not support chain ID 99999'),
      });
    });

    it('should reject unsupported chain ID for Infura', async () => {
      const provider = new RPCProvider({ provider: 'infura', apiKey: 'key' }, 99999);
      await expect(provider.initialize()).rejects.toMatchObject({
        code: 'CONFIGURATION_ERROR',
        message: expect.stringContaining('does not support chain ID 99999'),
      });
    });

    it('should reject missing API key for Alchemy', async () => {
      const provider = new RPCProvider({ provider: 'alchemy' }, 1);
      await expect(provider.initialize()).rejects.toMatchObject({
        code: 'CONFIGURATION_ERROR',
        message: expect.stringContaining('API key is required'),
      });
    });

    it('should reject missing API key for Infura', async () => {
      const provider = new RPCProvider({ provider: 'infura' }, 1);
      await expect(provider.initialize()).rejects.toMatchObject({
        code: 'CONFIGURATION_ERROR',
        message: expect.stringContaining('API key is required'),
      });
    });

    it('should reject missing custom URL', async () => {
      const provider = new RPCProvider({ provider: 'custom' }, 1);
      await expect(provider.initialize()).rejects.toMatchObject({
        code: 'CONFIGURATION_ERROR',
        message: expect.stringContaining('Custom RPC URL is required'),
      });
    });
  });

  describe('call() — retry and fallback', () => {
    it('should succeed on first attempt', async () => {
      const provider = new RPCProvider(
        { provider: 'custom', customUrl: 'https://rpc.example.com' },
        137
      );
      await provider.initialize();

      const result = await provider.call(async (p) => {
        return p.getBlockNumber();
      });

      expect(result).toBe(12345678);
    });

    it('should retry on failure with exponential backoff', async () => {
      const provider = new RPCProvider(
        { provider: 'custom', customUrl: 'https://rpc.example.com', retryAttempts: 3 },
        137
      );
      await provider.initialize();

      let callCount = 0;
      const result = await provider.call(async () => {
        callCount++;
        if (callCount < 3) throw new Error('Transient failure');
        return 42;
      });

      expect(result).toBe(42);
      expect(callCount).toBe(3);
    }, 15000);

    it('should throw after all retries exhausted', async () => {
      const provider = new RPCProvider(
        { provider: 'custom', customUrl: 'https://rpc.example.com', retryAttempts: 2 },
        137
      );
      await provider.initialize();

      await expect(
        provider.call(async () => {
          throw new Error('Persistent failure');
        })
      ).rejects.toMatchObject({
        code: 'RPC_ERROR',
        message: expect.stringContaining('Persistent failure'),
      });
    }, 15000);

    it('should fall back to secondary provider after primary exhausted', async () => {
      const provider = new RPCProvider(
        {
          provider: 'custom',
          customUrl: 'https://primary.example.com',
          fallbackUrls: ['https://fallback.example.com'],
          retryAttempts: 1,
        },
        137
      );
      await provider.initialize();

      let callCount = 0;
      const result = await provider.call(async () => {
        callCount++;
        if (callCount === 1) throw new Error('Primary failed');
        return 'fallback-result';
      });

      expect(result).toBe('fallback-result');
      expect(callCount).toBe(2);
    });
  });

  describe('timeout', () => {
    it('should reject after configured timeout', async () => {
      const provider = new RPCProvider(
        { provider: 'custom', customUrl: 'https://rpc.example.com', timeout: 100, retryAttempts: 1 },
        137
      );
      await provider.initialize();

      await expect(
        provider.call(async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return 'too late';
        })
      ).rejects.toMatchObject({
        code: 'RPC_ERROR',
        message: expect.stringContaining('timed out'),
      });
    }, 10000);
  });

  describe('getBlockNumber()', () => {
    it('should return block number from provider', async () => {
      const provider = new RPCProvider(
        { provider: 'custom', customUrl: 'https://rpc.example.com' },
        137
      );
      await provider.initialize();

      const blockNumber = await provider.getBlockNumber();
      expect(blockNumber).toBe(12345678);
    });
  });

  describe('getProvider()', () => {
    it('should throw if not initialized', () => {
      const provider = new RPCProvider(
        { provider: 'custom', customUrl: 'https://rpc.example.com' },
        137
      );

      expect(() => provider.getProvider()).toThrow();
    });

    it('should return provider after initialization', async () => {
      const provider = new RPCProvider(
        { provider: 'custom', customUrl: 'https://rpc.example.com' },
        137
      );
      await provider.initialize();

      expect(provider.getProvider()).toBeDefined();
    });
  });
});
