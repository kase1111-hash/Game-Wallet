import { Cache } from '../../src/utils/Cache';
import type { LicenseVerificationResult } from '../../src/types';

describe('Cache', () => {
  const defaultConfig = {
    enabled: true,
    ttlSeconds: 60,
    storageKey: 'test-cache',
  };

  beforeEach(() => {
    // Clear localStorage mock
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      const cache = new Cache({ ...defaultConfig, enabled: true });
      expect(cache.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const cache = new Cache({ ...defaultConfig, enabled: false });
      expect(cache.isEnabled()).toBe(false);
    });
  });

  describe('verification caching', () => {
    const mockResult: LicenseVerificationResult = {
      isValid: true,
      license: {
        tokenId: '1',
        contractAddress: '0x1234567890123456789012345678901234567890',
        owner: '0x0987654321098765432109876543210987654321',
        metadata: {
          name: 'Test License',
          description: 'Test',
          attributes: {
            version: '1.0',
            edition: 'standard',
            mintedBy: '0x0987654321098765432109876543210987654321',
            gameId: 'test-game',
          },
        },
        mintedAt: Date.now(),
        transactionHash: '0xabc123',
      },
      checkedAt: Date.now(),
      blockNumber: 12345,
    };

    it('should store and retrieve verification result', () => {
      const cache = new Cache(defaultConfig);
      const address = '0x1234567890123456789012345678901234567890';

      cache.setVerification(address, mockResult);
      const retrieved = cache.getVerification(address);

      expect(retrieved).toEqual(mockResult);
    });

    it('should return null for non-existent address', () => {
      const cache = new Cache(defaultConfig);
      const result = cache.getVerification('0xnonexistent');
      expect(result).toBeNull();
    });

    it('should normalize address to lowercase', () => {
      const cache = new Cache(defaultConfig);
      const upperAddress = '0x1234567890ABCDEF1234567890ABCDEF12345678';
      const lowerAddress = '0x1234567890abcdef1234567890abcdef12345678';

      cache.setVerification(upperAddress, mockResult);
      const retrieved = cache.getVerification(lowerAddress);

      expect(retrieved).toEqual(mockResult);
    });

    it('should not store when cache is disabled', () => {
      const cache = new Cache({ ...defaultConfig, enabled: false });
      const address = '0x1234567890123456789012345678901234567890';

      cache.setVerification(address, mockResult);
      const retrieved = cache.getVerification(address);

      expect(retrieved).toBeNull();
    });

    it('should clear verification for address', () => {
      const cache = new Cache(defaultConfig);
      const address = '0x1234567890123456789012345678901234567890';

      cache.setVerification(address, mockResult);
      cache.clearVerification(address);
      const retrieved = cache.getVerification(address);

      expect(retrieved).toBeNull();
    });

    it('should expire entries after TTL', () => {
      jest.useFakeTimers();

      const cache = new Cache({ ...defaultConfig, ttlSeconds: 1 });
      const address = '0x1234567890123456789012345678901234567890';

      cache.setVerification(address, mockResult);

      // Advance time past TTL
      jest.advanceTimersByTime(2000);

      const retrieved = cache.getVerification(address);
      expect(retrieved).toBeNull();

      jest.useRealTimers();
    });
  });

  describe('clearAll', () => {
    it('should clear all cached data', () => {
      const cache = new Cache(defaultConfig);
      const address1 = '0x1111111111111111111111111111111111111111';
      const address2 = '0x2222222222222222222222222222222222222222';

      const mockResult: LicenseVerificationResult = {
        isValid: true,
        license: null,
        checkedAt: Date.now(),
        blockNumber: 12345,
      };

      cache.setVerification(address1, mockResult);
      cache.setVerification(address2, mockResult);

      cache.clearAll();

      expect(cache.getVerification(address1)).toBeNull();
      expect(cache.getVerification(address2)).toBeNull();
    });
  });
});
