import { JsonRpcProvider } from 'ethers';
import { GLWM, GLWMConfig, LogLevel, Logger } from '../../src';

// Mock only the network layer: JsonRpcProvider is replaced, the rest of ethers is real.
// Use a mutable container to avoid jest.mock hoisting / TDZ issues
const mockRpc = {
  getBlockNumber: jest.fn<Promise<number>, []>(),
};

jest.mock('ethers', () => ({
  ...jest.requireActual<typeof import('ethers')>('ethers'),
  JsonRpcProvider: jest.fn().mockImplementation(() => ({
    getBlockNumber: () => mockRpc.getBlockNumber(),
  })),
}));

describe('SDK Initialization Integration', () => {
  const validConfig: GLWMConfig = {
    licenseContract: '0x1234567890123456789012345678901234567890',
    chainId: 137,
    rpcProvider: {
      provider: 'custom',
      customUrl: 'https://polygon-rpc.com',
    },
    mintingPortal: {
      url: 'https://mint.example.com',
      mode: 'iframe',
    },
    cacheConfig: {
      enabled: true,
      ttlSeconds: 300,
      storageKey: 'test-glwm',
    },
  };

  beforeEach(() => {
    Logger.resetInstance();
    jest.mocked(JsonRpcProvider).mockClear();
    mockRpc.getBlockNumber.mockReset().mockResolvedValue(12345678);
  });

  describe('Full SDK lifecycle', () => {
    it('should initialize and dispose correctly', async () => {
      const glwm = new GLWM(validConfig);

      // Initial state
      expect(glwm.getState().status).toBe('uninitialized');

      // Track state changes
      const states: string[] = [];
      glwm.subscribe((state) => states.push(state.status));

      await glwm.initialize();

      // Network.from() is real ethers, so this checks the actual chain and static-network setup
      expect(JsonRpcProvider).toHaveBeenCalledWith(
        'https://polygon-rpc.com',
        expect.objectContaining({ chainId: 137n }),
        { staticNetwork: expect.objectContaining({ chainId: 137n }) }
      );
      expect(states).toEqual(['initializing', 'awaiting_wallet']);

      // Dispose
      await glwm.dispose();
      expect(glwm.getState().status).toBe('uninitialized');
    });

    it('should enter error state when the RPC provider is unreachable', async () => {
      mockRpc.getBlockNumber.mockRejectedValue(new Error('connect ECONNREFUSED'));
      const glwm = new GLWM({
        ...validConfig,
        // Single attempt: retry/backoff is covered by the RPCProvider unit tests
        rpcProvider: { ...validConfig.rpcProvider, retryAttempts: 1 },
      });

      const states: string[] = [];
      glwm.subscribe((state) => states.push(state.status));

      await expect(glwm.initialize()).rejects.toMatchObject({
        code: 'RPC_ERROR',
        message: 'Failed to connect to RPC provider',
        recoverable: true,
      });

      expect(states).toEqual(['initializing', 'error']);
      expect(glwm.getState()).toMatchObject({
        status: 'error',
        error: { code: 'RPC_ERROR' },
      });
    });

    it('should handle configuration callbacks', () => {
      const onError = jest.fn();
      const onWalletConnected = jest.fn();
      const onLicenseVerified = jest.fn();

      const config: GLWMConfig = {
        ...validConfig,
        onError,
        onWalletConnected,
        onLicenseVerified,
      };

      const glwm = new GLWM(config);
      expect(glwm).toBeInstanceOf(GLWM);
    });
  });

  describe('State management', () => {
    it('should track state changes via subscription', async () => {
      const glwm = new GLWM(validConfig);
      const listener = jest.fn();

      const unsubscribe = glwm.subscribe(listener);

      await glwm.initialize();

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'awaiting_wallet' })
      );

      unsubscribe();
    });

    it('should allow multiple subscribers', async () => {
      const glwm = new GLWM(validConfig);
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      glwm.subscribe(listener1);
      glwm.subscribe(listener2);

      await glwm.initialize();

      expect(listener1).toHaveBeenCalledTimes(2);
      expect(listener2).toHaveBeenCalledTimes(2);
    });

    it('should stop notifying after unsubscribe', async () => {
      const glwm = new GLWM(validConfig);
      const listener = jest.fn();

      const unsubscribe = glwm.subscribe(listener);
      unsubscribe();

      await glwm.initialize();

      // Listener should not be called after unsubscribe
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Event handling', () => {
    it('should register and unregister event handlers', async () => {
      const glwm = new GLWM(validConfig);
      const handler = jest.fn();

      // Should be able to subscribe to events
      const unsubscribe = glwm.on('WALLET_DISCONNECTED', handler);
      expect(typeof unsubscribe).toBe('function');

      // Should be able to unsubscribe
      unsubscribe();

      // Verify unsubscribe doesn't throw
      expect(() => unsubscribe()).not.toThrow();
    });

    it('should allow unsubscribing from events', async () => {
      const glwm = new GLWM(validConfig);
      const handler = jest.fn();

      const unsubscribe = glwm.on('WALLET_DISCONNECTED', handler);
      unsubscribe();

      await glwm.disconnectWallet();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Wallet session', () => {
    it('should return disconnected session initially', () => {
      const glwm = new GLWM(validConfig);
      const session = glwm.getWalletSession();

      expect(session.isConnected).toBe(false);
      expect(session.isConnecting).toBe(false);
      expect(session.connection).toBeNull();
      expect(session.error).toBeNull();
    });

    it('should report available providers', () => {
      const glwm = new GLWM(validConfig);
      const providers = glwm.getAvailableProviders();

      // In Node.js test environment, no browser wallets are available
      expect(Array.isArray(providers)).toBe(true);
    });
  });

  describe('Cache operations', () => {
    it('should clear cache', () => {
      const glwm = new GLWM(validConfig);

      // Should not throw even if not initialized
      expect(() => glwm.clearCache()).not.toThrow();
    });
  });

  describe('Static methods', () => {
    it('should validate config statically', () => {
      const result = GLWM.validateConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return version', () => {
      const version = GLWM.getVersion();
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});

describe('Logger Integration', () => {
  beforeEach(() => {
    Logger.resetInstance();
  });

  it('should provide singleton logger across SDK', () => {
    const logger1 = Logger.getInstance();
    const logger2 = Logger.getInstance();

    expect(logger1).toBe(logger2);
  });

  it('should configure log level', () => {
    const logger = Logger.getInstance({ level: LogLevel.ERROR });
    expect(logger.getConfig().level).toBe(LogLevel.ERROR);
  });
});
