import { ConfigManager, ENV_KEYS, createConfigFromEnv } from '../../src/utils/Config';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    configManager = new ConfigManager();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    configManager.clearCache();
  });

  describe('getEnv', () => {
    it('should return environment variable value', () => {
      process.env['TEST_VAR'] = 'test-value';
      expect(configManager.getEnv('TEST_VAR')).toBe('test-value');
    });

    it('should return default value when not set', () => {
      expect(configManager.getEnv('NONEXISTENT', 'default')).toBe('default');
    });

    it('should return undefined when not set and no default', () => {
      expect(configManager.getEnv('NONEXISTENT')).toBeUndefined();
    });

    it('should cache values', () => {
      process.env['CACHED_VAR'] = 'original';
      configManager.getEnv('CACHED_VAR');

      process.env['CACHED_VAR'] = 'modified';
      expect(configManager.getEnv('CACHED_VAR')).toBe('original');
    });
  });

  describe('getRequiredEnv', () => {
    it('should return value when set', () => {
      process.env['REQUIRED_VAR'] = 'value';
      expect(configManager.getRequiredEnv('REQUIRED_VAR')).toBe('value');
    });

    it('should throw when not set', () => {
      expect(() => configManager.getRequiredEnv('MISSING_VAR')).toThrow(
        'Required environment variable MISSING_VAR is not set'
      );
    });
  });

  describe('getEnvAsNumber', () => {
    it('should parse number correctly', () => {
      process.env['NUM_VAR'] = '42';
      expect(configManager.getEnvAsNumber('NUM_VAR')).toBe(42);
    });

    it('should return default for non-numeric value', () => {
      process.env['NUM_VAR'] = 'not-a-number';
      expect(configManager.getEnvAsNumber('NUM_VAR', 10)).toBe(10);
    });

    it('should return default when not set', () => {
      expect(configManager.getEnvAsNumber('MISSING', 99)).toBe(99);
    });
  });

  describe('getEnvAsBoolean', () => {
    it('should parse true values', () => {
      process.env['BOOL_VAR'] = 'true';
      expect(configManager.getEnvAsBoolean('BOOL_VAR')).toBe(true);

      process.env['BOOL_VAR'] = '1';
      configManager.clearCache();
      expect(configManager.getEnvAsBoolean('BOOL_VAR')).toBe(true);

      process.env['BOOL_VAR'] = 'TRUE';
      configManager.clearCache();
      expect(configManager.getEnvAsBoolean('BOOL_VAR')).toBe(true);
    });

    it('should parse false values', () => {
      process.env['BOOL_VAR'] = 'false';
      expect(configManager.getEnvAsBoolean('BOOL_VAR')).toBe(false);

      process.env['BOOL_VAR'] = '0';
      configManager.clearCache();
      expect(configManager.getEnvAsBoolean('BOOL_VAR')).toBe(false);
    });

    it('should return default when not set', () => {
      expect(configManager.getEnvAsBoolean('MISSING', true)).toBe(true);
    });
  });

  describe('getEnvAsArray', () => {
    it('should parse comma-separated values', () => {
      process.env['ARRAY_VAR'] = 'a,b,c';
      expect(configManager.getEnvAsArray('ARRAY_VAR')).toEqual(['a', 'b', 'c']);
    });

    it('should trim whitespace', () => {
      process.env['ARRAY_VAR'] = 'a , b , c';
      expect(configManager.getEnvAsArray('ARRAY_VAR')).toEqual(['a', 'b', 'c']);
    });

    it('should filter empty values', () => {
      process.env['ARRAY_VAR'] = 'a,,b,';
      expect(configManager.getEnvAsArray('ARRAY_VAR')).toEqual(['a', 'b']);
    });

    it('should return default when not set', () => {
      expect(configManager.getEnvAsArray('MISSING', ['default'])).toEqual(['default']);
    });
  });

  describe('isSensitive', () => {
    it('should identify sensitive keys', () => {
      expect(configManager.isSensitive(ENV_KEYS.RPC_API_KEY)).toBe(true);
      expect(configManager.isSensitive(ENV_KEYS.SENTRY_DSN)).toBe(true);
    });

    it('should identify non-sensitive keys', () => {
      expect(configManager.isSensitive(ENV_KEYS.CHAIN_ID)).toBe(false);
      expect(configManager.isSensitive(ENV_KEYS.LOG_LEVEL)).toBe(false);
    });
  });

  describe('maskSensitive', () => {
    it('should mask long values', () => {
      const masked = configManager.maskSensitive('1234567890abcdef');
      expect(masked).toBe('1234****cdef');
    });

    it('should fully mask short values', () => {
      const masked = configManager.maskSensitive('short');
      expect(masked).toBe('****');
    });
  });

  describe('buildConfig', () => {
    it('should build config from environment', () => {
      process.env[ENV_KEYS.LICENSE_CONTRACT] = '0x1234567890123456789012345678901234567890';
      process.env[ENV_KEYS.CHAIN_ID] = '137';
      process.env[ENV_KEYS.RPC_PROVIDER] = 'alchemy';
      process.env[ENV_KEYS.RPC_API_KEY] = 'test-key';
      process.env[ENV_KEYS.MINTING_PORTAL_URL] = 'https://mint.example.com';

      const config = configManager.buildConfig();

      expect(config.licenseContract).toBe('0x1234567890123456789012345678901234567890');
      expect(config.chainId).toBe(137);
      expect(config.rpcProvider.provider).toBe('alchemy');
      expect(config.rpcProvider.apiKey).toBe('test-key');
      expect(config.mintingPortal.url).toBe('https://mint.example.com');
    });

    it('should merge with base config', () => {
      process.env[ENV_KEYS.CHAIN_ID] = '1';

      const config = configManager.buildConfig({
        licenseContract: '0x1234567890123456789012345678901234567890',
        chainId: 137,
        rpcProvider: { provider: 'infura', apiKey: 'base-key' },
        mintingPortal: { url: 'https://base.example.com', mode: 'webview' },
      });

      // Env should override base
      expect(config.chainId).toBe(1);
      // Base should be used for non-env values
      expect(config.licenseContract).toBe('0x1234567890123456789012345678901234567890');
    });
  });

  describe('validateConfig', () => {
    const validConfig = {
      licenseContract: '0x1234567890123456789012345678901234567890',
      chainId: 137,
      rpcProvider: { provider: 'alchemy' as const, apiKey: 'test-key' },
      mintingPortal: { url: 'https://mint.example.com', mode: 'webview' as const },
    };

    it('should validate correct config', () => {
      const result = configManager.validateConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require license contract', () => {
      const config = { ...validConfig, licenseContract: '' };
      const result = configManager.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('License contract address is required');
    });

    it('should require valid chain ID', () => {
      const config = { ...validConfig, chainId: 0 };
      const result = configManager.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Valid chain ID is required');
    });

    it('should require API key for Alchemy', () => {
      const config = {
        ...validConfig,
        rpcProvider: { provider: 'alchemy' as const },
      };
      const result = configManager.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Alchemy API key is required when using Alchemy provider');
    });

    it('should require minting portal URL', () => {
      const config = {
        ...validConfig,
        mintingPortal: { url: '', mode: 'webview' as const },
      };
      const result = configManager.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Minting portal URL is required');
    });
  });
});

describe('createConfigFromEnv', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create config from environment variables', () => {
    process.env[ENV_KEYS.LICENSE_CONTRACT] = '0x1234567890123456789012345678901234567890';
    process.env[ENV_KEYS.CHAIN_ID] = '137';
    process.env[ENV_KEYS.MINTING_PORTAL_URL] = 'https://mint.example.com';

    const config = createConfigFromEnv();

    expect(config.licenseContract).toBe('0x1234567890123456789012345678901234567890');
    expect(config.chainId).toBe(137);
  });
});
