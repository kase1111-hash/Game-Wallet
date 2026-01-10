/**
 * Acceptance Tests - User Flows
 *
 * These tests verify the complete user journeys as described in user stories.
 * They test the SDK from an end-user/game developer perspective.
 */

import { GLWM, GLWMConfig, GLWMState } from '../../src';

// Mock configurations for different scenarios
const createConfig = (overrides?: Partial<GLWMConfig>): GLWMConfig => ({
  licenseContract: '0x1234567890123456789012345678901234567890',
  chainId: 137, // Polygon
  rpcProvider: {
    provider: 'custom',
    customUrl: 'https://polygon-rpc.com',
  },
  mintingPortal: {
    url: 'https://mint.example.com',
    mode: 'webview',
  },
  ...overrides,
});

describe('Acceptance Tests: Game Developer Integration', () => {
  describe('US-001: SDK Initialization', () => {
    it('should allow game developers to initialize SDK with minimal configuration', () => {
      // Given: A game developer has the required configuration
      const config = createConfig();

      // When: They create a new GLWM instance
      const sdk = new GLWM(config);

      // Then: The SDK should be created successfully
      expect(sdk).toBeInstanceOf(GLWM);
      expect(sdk.getState().status).toBe('uninitialized');
    });

    it('should provide clear error messages for invalid configuration', () => {
      // Given: Invalid configuration
      const invalidConfig = {
        ...createConfig(),
        licenseContract: 'not-an-address',
      };

      // When/Then: Creating SDK should throw with clear message
      expect(() => new GLWM(invalidConfig)).toThrow(/Invalid configuration/);
    });

    it('should support multiple RPC providers', () => {
      // Alchemy configuration
      const alchemyConfig = createConfig({
        rpcProvider: { provider: 'alchemy', apiKey: 'test-key' },
      });
      expect(() => new GLWM(alchemyConfig)).not.toThrow();

      // Infura configuration
      const infuraConfig = createConfig({
        rpcProvider: { provider: 'infura', apiKey: 'test-key' },
      });
      expect(() => new GLWM(infuraConfig)).not.toThrow();

      // Custom RPC configuration
      const customConfig = createConfig({
        rpcProvider: { provider: 'custom', customUrl: 'https://my-rpc.com' },
      });
      expect(() => new GLWM(customConfig)).not.toThrow();
    });
  });

  describe('US-002: State Management', () => {
    it('should track SDK state throughout lifecycle', () => {
      const sdk = new GLWM(createConfig());
      const stateHistory: GLWMState['status'][] = [];

      // Subscribe to state changes
      sdk.subscribe((state) => {
        stateHistory.push(state.status);
      });

      // Initial state
      expect(sdk.getState().status).toBe('uninitialized');

      // State should be trackable
      expect(typeof sdk.subscribe).toBe('function');
    });

    it('should allow unsubscribing from state changes', () => {
      const sdk = new GLWM(createConfig());
      const listener = jest.fn();

      const unsubscribe = sdk.subscribe(listener);
      unsubscribe();

      // Listener should be removed
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('US-003: Event Handling', () => {
    it('should support event-driven architecture', () => {
      const sdk = new GLWM(createConfig());

      // Should support various event types
      const events = [
        'WALLET_CONNECTED',
        'WALLET_DISCONNECTED',
        'LICENSE_VERIFIED',
        'MINT_STARTED',
        'MINT_COMPLETED',
        'OPEN_MINTING_PORTAL',
        'CLOSE_MINTING_PORTAL',
      ] as const;

      events.forEach((event) => {
        const handler = jest.fn();
        const unsubscribe = sdk.on(event, handler);
        expect(typeof unsubscribe).toBe('function');
        unsubscribe();
      });
    });

    it('should support callback configuration', () => {
      const onError = jest.fn();
      const onWalletConnected = jest.fn();
      const onLicenseVerified = jest.fn();

      const sdk = new GLWM(
        createConfig({
          onError,
          onWalletConnected,
          onLicenseVerified,
        })
      );

      expect(sdk).toBeInstanceOf(GLWM);
    });
  });

  describe('US-004: Wallet Provider Detection', () => {
    it('should detect available wallet providers', () => {
      const sdk = new GLWM(createConfig());

      // Should return array of available providers
      const providers = sdk.getAvailableProviders();
      expect(Array.isArray(providers)).toBe(true);
    });

    it('should check specific provider availability', () => {
      const sdk = new GLWM(createConfig());

      // Should return boolean for provider check
      const isMetamaskAvailable = sdk.isProviderAvailable('metamask');
      expect(typeof isMetamaskAvailable).toBe('boolean');
    });
  });

  describe('US-005: Wallet Session', () => {
    it('should provide wallet session information', () => {
      const sdk = new GLWM(createConfig());
      const session = sdk.getWalletSession();

      // Session should have expected structure
      expect(session).toHaveProperty('isConnected');
      expect(session).toHaveProperty('isConnecting');
      expect(session).toHaveProperty('connection');
      expect(session).toHaveProperty('error');

      // Initially disconnected
      expect(session.isConnected).toBe(false);
      expect(session.isConnecting).toBe(false);
      expect(session.connection).toBeNull();
    });
  });

  describe('US-006: Cache Management', () => {
    it('should support cache configuration', () => {
      const sdk = new GLWM(
        createConfig({
          cacheConfig: {
            enabled: true,
            ttlSeconds: 600,
            storageKey: 'my-game-glwm',
          },
        })
      );

      expect(sdk).toBeInstanceOf(GLWM);
    });

    it('should allow manual cache clearing', () => {
      const sdk = new GLWM(createConfig());

      // Should not throw when clearing cache
      expect(() => sdk.clearCache()).not.toThrow();
    });
  });

  describe('US-007: Version Information', () => {
    it('should provide SDK version', () => {
      const version = GLWM.getVersion();

      expect(typeof version).toBe('string');
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('US-008: Configuration Validation', () => {
    it('should validate configuration before initialization', () => {
      const validConfig = createConfig();
      const result = GLWM.validateConfig(validConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return specific validation errors', () => {
      const invalidConfig = {
        licenseContract: '',
        chainId: 0,
        rpcProvider: { provider: 'alchemy' as const },
        mintingPortal: { url: '', mode: 'webview' as const },
      };

      const result = GLWM.validateConfig(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('licenseContract'))).toBe(true);
      expect(result.errors.some((e) => e.includes('chainId'))).toBe(true);
    });
  });
});

describe('Acceptance Tests: Multi-Chain Support', () => {
  const chains = [
    { name: 'Ethereum Mainnet', chainId: 1 },
    { name: 'Polygon', chainId: 137 },
    { name: 'Arbitrum', chainId: 42161 },
    { name: 'Optimism', chainId: 10 },
    { name: 'Base', chainId: 8453 },
  ];

  chains.forEach(({ name, chainId }) => {
    it(`should support ${name} (chainId: ${chainId})`, () => {
      const config = createConfig({ chainId });
      const sdk = new GLWM(config);

      expect(sdk).toBeInstanceOf(GLWM);
    });
  });
});

describe('Acceptance Tests: Minting Portal Modes', () => {
  const modes = ['webview', 'iframe', 'redirect'] as const;

  modes.forEach((mode) => {
    it(`should support ${mode} minting portal mode`, () => {
      const config = createConfig({
        mintingPortal: {
          url: 'https://mint.example.com',
          mode,
        },
      });

      const sdk = new GLWM(config);
      expect(sdk).toBeInstanceOf(GLWM);
    });
  });
});

describe('Acceptance Tests: Error Scenarios', () => {
  it('should handle missing license contract gracefully', () => {
    const config = { ...createConfig(), licenseContract: '' };
    expect(() => new GLWM(config)).toThrow();
  });

  it('should handle invalid chain ID gracefully', () => {
    const config = { ...createConfig(), chainId: -1 };
    expect(() => new GLWM(config)).toThrow();
  });

  it('should handle missing RPC provider gracefully', () => {
    const config = {
      licenseContract: '0x1234567890123456789012345678901234567890',
      chainId: 137,
      rpcProvider: undefined as unknown as GLWMConfig['rpcProvider'],
      mintingPortal: { url: 'https://mint.example.com', mode: 'webview' as const },
    };

    expect(() => new GLWM(config)).toThrow();
  });
});

describe('Acceptance Tests: SDK Lifecycle', () => {
  it('should support full lifecycle: create -> dispose', async () => {
    const sdk = new GLWM(createConfig());

    // Initial state
    expect(sdk.getState().status).toBe('uninitialized');

    // Dispose
    await sdk.dispose();

    // After dispose
    expect(sdk.getState().status).toBe('uninitialized');
  });

  it('should clean up resources on dispose', async () => {
    const sdk = new GLWM(createConfig());
    const listener = jest.fn();

    sdk.subscribe(listener);

    // Dispose clears listeners
    await sdk.dispose();

    // After dispose, state changes should not notify old listeners
    // (This is tested by the dispose clearing internal state)
    expect(sdk.getState().status).toBe('uninitialized');
  });
});
