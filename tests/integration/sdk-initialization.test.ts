import { GLWM, GLWMConfig, LogLevel, Logger } from '../../src';

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
  });

  describe('Full SDK lifecycle', () => {
    it('should initialize and dispose correctly', async () => {
      const glwm = new GLWM(validConfig);

      // Initial state
      expect(glwm.getState().status).toBe('uninitialized');

      // Track state changes
      const states: string[] = [];
      glwm.subscribe((state) => states.push(state.status));

      // Initialize - this will fail because we can't connect to RPC in tests
      // but we can test the state transitions
      try {
        await glwm.initialize();
      } catch {
        // Expected to fail without real RPC
      }

      // Should have transitioned through states
      expect(states).toContain('initializing');

      // Dispose
      await glwm.dispose();
      expect(glwm.getState().status).toBe('uninitialized');
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

      // Trigger some state changes
      try {
        await glwm.initialize();
      } catch {
        // Expected
      }

      expect(listener).toHaveBeenCalled();

      unsubscribe();
    });

    it('should allow multiple subscribers', async () => {
      const glwm = new GLWM(validConfig);
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      glwm.subscribe(listener1);
      glwm.subscribe(listener2);

      try {
        await glwm.initialize();
      } catch {
        // Expected
      }

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should stop notifying after unsubscribe', async () => {
      const glwm = new GLWM(validConfig);
      const listener = jest.fn();

      const unsubscribe = glwm.subscribe(listener);
      unsubscribe();

      try {
        await glwm.initialize();
      } catch {
        // Expected
      }

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

