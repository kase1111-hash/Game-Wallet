/**
 * Regression Tests - API Stability
 *
 * These tests ensure the public API remains stable and backward compatible.
 * Run these tests after any changes to catch breaking changes.
 */

import { GLWM, GLWMConfig } from '../../src';

const validConfig: GLWMConfig = {
  licenseContract: '0x1234567890123456789012345678901234567890',
  chainId: 137,
  rpcProvider: {
    provider: 'custom',
    customUrl: 'https://polygon-rpc.com',
  },
  mintingPortal: {
    url: 'https://mint.example.com',
    mode: 'webview',
  },
};

describe('Regression: Public API Stability', () => {
  describe('GLWM Class Exports', () => {
    it('should export GLWM as a class', () => {
      expect(GLWM).toBeDefined();
      expect(typeof GLWM).toBe('function');
    });

    it('should be instantiable with new keyword', () => {
      const glwm = new GLWM(validConfig);
      expect(glwm).toBeInstanceOf(GLWM);
    });
  });

  describe('Static Methods', () => {
    it('should have getVersion static method', () => {
      expect(typeof GLWM.getVersion).toBe('function');
      expect(typeof GLWM.getVersion()).toBe('string');
    });

    it('should have validateConfig static method', () => {
      expect(typeof GLWM.validateConfig).toBe('function');
      const result = GLWM.validateConfig(validConfig);
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
    });
  });

  describe('Instance Methods', () => {
    let glwm: GLWM;

    beforeEach(() => {
      glwm = new GLWM(validConfig);
    });

    it('should have initialize method', () => {
      expect(typeof glwm.initialize).toBe('function');
    });

    it('should have dispose method', () => {
      expect(typeof glwm.dispose).toBe('function');
    });

    it('should have getState method', () => {
      expect(typeof glwm.getState).toBe('function');
      const state = glwm.getState();
      expect(state).toHaveProperty('status');
    });

    it('should have subscribe method', () => {
      expect(typeof glwm.subscribe).toBe('function');
      const unsubscribe = glwm.subscribe(() => {});
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('should have on method for events', () => {
      expect(typeof glwm.on).toBe('function');
      const unsubscribe = glwm.on('WALLET_CONNECTED', () => {});
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('should have connectWallet method', () => {
      expect(typeof glwm.connectWallet).toBe('function');
    });

    it('should have disconnectWallet method', () => {
      expect(typeof glwm.disconnectWallet).toBe('function');
    });

    it('should have getWalletSession method', () => {
      expect(typeof glwm.getWalletSession).toBe('function');
      const session = glwm.getWalletSession();
      expect(session).toHaveProperty('isConnected');
      expect(session).toHaveProperty('isConnecting');
      expect(session).toHaveProperty('connection');
      expect(session).toHaveProperty('error');
    });

    it('should have verifyLicense method', () => {
      expect(typeof glwm.verifyLicense).toBe('function');
    });

    it('should have openMintingPortal method', () => {
      expect(typeof glwm.openMintingPortal).toBe('function');
    });

    it('should have closeMintingPortal method', () => {
      expect(typeof glwm.closeMintingPortal).toBe('function');
    });

    it('should have getAvailableProviders method', () => {
      expect(typeof glwm.getAvailableProviders).toBe('function');
      const providers = glwm.getAvailableProviders();
      expect(Array.isArray(providers)).toBe(true);
    });

    it('should have isProviderAvailable method', () => {
      expect(typeof glwm.isProviderAvailable).toBe('function');
      const result = glwm.isProviderAvailable('metamask');
      expect(typeof result).toBe('boolean');
    });

    it('should have clearCache method', () => {
      expect(typeof glwm.clearCache).toBe('function');
    });
  });

  describe('State Structure', () => {
    it('should return state with status property', () => {
      const glwm = new GLWM(validConfig);
      const state = glwm.getState();

      expect(state).toHaveProperty('status');
      expect(typeof state.status).toBe('string');
    });

    it('should have valid initial status', () => {
      const glwm = new GLWM(validConfig);
      const state = glwm.getState();

      expect(state.status).toBe('uninitialized');
    });
  });

  describe('Wallet Session Structure', () => {
    it('should return wallet session with expected properties', () => {
      const glwm = new GLWM(validConfig);
      const session = glwm.getWalletSession();

      expect(typeof session.isConnected).toBe('boolean');
      expect(typeof session.isConnecting).toBe('boolean');
      expect(session.connection).toBeNull();
      expect(session.error).toBeNull();
    });
  });

  describe('Config Validation Result Structure', () => {
    it('should return validation result with expected properties', () => {
      const result = GLWM.validateConfig(validConfig);

      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should return valid=true for valid config', () => {
      const result = GLWM.validateConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid=false for invalid config', () => {
      const invalidConfig = { ...validConfig, licenseContract: 'invalid' };
      const result = GLWM.validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

describe('Regression: Event Types', () => {
  let glwm: GLWM;

  beforeEach(() => {
    glwm = new GLWM(validConfig);
  });

  const eventTypes = [
    'WALLET_CONNECTED',
    'WALLET_DISCONNECTED',
    'LICENSE_VERIFIED',
    'MINT_STARTED',
    'MINT_COMPLETED',
    'MINT_FAILED',
    'OPEN_MINTING_PORTAL',
    'CLOSE_MINTING_PORTAL',
    'ERROR',
  ] as const;

  eventTypes.forEach((eventType) => {
    it(`should accept ${eventType} event subscription`, () => {
      const handler = jest.fn();
      const unsubscribe = glwm.on(eventType, handler);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });
});

describe('Regression: Configuration Options', () => {
  it('should accept all RPC provider types', () => {
    // Alchemy
    expect(() =>
      new GLWM({
        ...validConfig,
        rpcProvider: { provider: 'alchemy', apiKey: 'test-key' },
      })
    ).not.toThrow();

    // Infura
    expect(() =>
      new GLWM({
        ...validConfig,
        rpcProvider: { provider: 'infura', apiKey: 'test-key' },
      })
    ).not.toThrow();

    // Custom
    expect(() =>
      new GLWM({
        ...validConfig,
        rpcProvider: { provider: 'custom', customUrl: 'https://rpc.example.com' },
      })
    ).not.toThrow();
  });

  it('should accept all minting portal modes', () => {
    const modes = ['webview', 'iframe', 'redirect'] as const;

    modes.forEach((mode) => {
      expect(() =>
        new GLWM({
          ...validConfig,
          mintingPortal: { url: 'https://mint.example.com', mode },
        })
      ).not.toThrow();
    });
  });

  it('should accept optional cache configuration', () => {
    expect(() =>
      new GLWM({
        ...validConfig,
        cacheConfig: {
          enabled: true,
          ttlSeconds: 300,
          storageKey: 'test-cache',
        },
      })
    ).not.toThrow();
  });

  it('should accept optional callback functions', () => {
    expect(() =>
      new GLWM({
        ...validConfig,
        onError: () => {},
        onWalletConnected: () => {},
        onWalletDisconnected: () => {},
        onLicenseVerified: () => {},
      })
    ).not.toThrow();
  });

  it('should accept optional log level', () => {
    const logLevels = ['debug', 'info', 'warn', 'error', 'silent'] as const;

    logLevels.forEach((logLevel) => {
      expect(() =>
        new GLWM({
          ...validConfig,
          logLevel,
        })
      ).not.toThrow();
    });
  });
});

describe('Regression: Version Format', () => {
  it('should return version in semver format', () => {
    const version = GLWM.getVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should return consistent version', () => {
    const version1 = GLWM.getVersion();
    const version2 = GLWM.getVersion();
    expect(version1).toBe(version2);
  });
});
