import { GLWM, GLWMConfig } from '../../src';

describe('GLWM', () => {
  const validConfig: GLWMConfig = {
    licenseContract: '0x1234567890123456789012345678901234567890',
    chainId: 137,
    rpcProvider: {
      provider: 'alchemy',
      apiKey: 'test-api-key',
    },
    mintingPortal: {
      url: 'https://mint.example.com',
      mode: 'webview',
    },
  };

  describe('constructor', () => {
    it('should create instance with valid config', () => {
      const glwm = new GLWM(validConfig);
      expect(glwm).toBeInstanceOf(GLWM);
    });

    it('should throw error with invalid config', () => {
      const invalidConfig = {
        ...validConfig,
        licenseContract: 'invalid-address',
      };

      expect(() => new GLWM(invalidConfig)).toThrow('Invalid configuration');
    });
  });

  describe('validateConfig', () => {
    it('should return valid for correct config', () => {
      const result = GLWM.validateConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing licenseContract', () => {
      const config = { ...validConfig, licenseContract: '' };
      const result = GLWM.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('licenseContract is required');
    });

    it('should return errors for invalid ethereum address', () => {
      const config = { ...validConfig, licenseContract: '0xinvalid' };
      const result = GLWM.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('licenseContract must be a valid Ethereum address');
    });

    it('should return errors for invalid chainId', () => {
      const config = { ...validConfig, chainId: 0 };
      const result = GLWM.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('chainId must be a positive number');
    });
  });

  describe('getVersion', () => {
    it('should return version string', () => {
      const version = GLWM.getVersion();
      expect(typeof version).toBe('string');
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('getState', () => {
    it('should return uninitialized state initially', () => {
      const glwm = new GLWM(validConfig);
      const state = glwm.getState();
      expect(state.status).toBe('uninitialized');
    });
  });

  describe('getWalletSession', () => {
    it('should return disconnected session initially', () => {
      const glwm = new GLWM(validConfig);
      const session = glwm.getWalletSession();
      expect(session.isConnected).toBe(false);
      expect(session.isConnecting).toBe(false);
      expect(session.connection).toBeNull();
      expect(session.error).toBeNull();
    });
  });

  describe('subscribe', () => {
    it('should notify listeners on state changes', async () => {
      const glwm = new GLWM(validConfig);
      const states: string[] = [];

      glwm.subscribe((state) => {
        states.push(state.status);
      });

      // Initialize will fail due to no real RPC, but state transitions should still occur
      try {
        await glwm.initialize();
      } catch {
        // Expected to fail without real RPC connection
      }

      // Should have transitioned through at least 'initializing' state
      expect(states).toContain('initializing');
    });

    it('should return unsubscribe function', () => {
      const glwm = new GLWM(validConfig);
      const listener = jest.fn();

      const unsubscribe = glwm.subscribe(listener);
      expect(typeof unsubscribe).toBe('function');

      unsubscribe();
    });
  });
});
