import {
  generateSessionId,
  checksumAddress,
  isValidAddress,
} from '../../src/utils/helpers';

describe('helpers', () => {
  describe('generateSessionId', () => {
    it('should generate a valid UUID format', () => {
      const sessionId = generateSessionId();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(sessionId).toMatch(uuidRegex);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSessionId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('checksumAddress', () => {
    it('should return checksummed address', () => {
      const lowercase = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
      const checksummed = checksumAddress(lowercase);
      expect(checksummed).toBe('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
    });

    it('should handle already checksummed address', () => {
      const address = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
      const result = checksumAddress(address);
      expect(result).toBe(address);
    });

    it('should throw for invalid address', () => {
      expect(() => checksumAddress('invalid')).toThrow();
      expect(() => checksumAddress('0x123')).toThrow();
    });
  });

  describe('isValidAddress', () => {
    it('should return true for valid addresses', () => {
      expect(isValidAddress('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toBe(true);
      expect(isValidAddress('0x0000000000000000000000000000000000000000')).toBe(true);
      expect(isValidAddress('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toBe(true);
    });

    it('should return false for invalid addresses', () => {
      expect(isValidAddress('invalid')).toBe(false);
      expect(isValidAddress('0x123')).toBe(false);
      expect(isValidAddress('')).toBe(false);
      // Note: ethers v6 isAddress() accepts addresses without 0x prefix
    });
  });
});
