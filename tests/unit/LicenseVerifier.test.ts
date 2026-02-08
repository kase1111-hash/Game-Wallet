/**
 * Unit tests for LicenseVerifier
 *
 * Tests license verification, metadata fetching, URI resolution,
 * attribute parsing, and error handling.
 */

import { LicenseVerifier } from '../../src/license';
import { MockRPCProvider } from '../mocks/rpc-provider';
import { MockLicenseContract, createMockMetadata } from '../mocks/license-contract';
import { Logger } from '../../src/utils/Logger';

// Mock ethers Contract to return our mock
jest.mock('ethers', () => ({
  Contract: jest.fn(),
  getAddress: jest.fn((addr: string) => addr),
  isAddress: jest.fn(() => true),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

const CONTRACT_ADDRESS = '0x1234567890123456789012345678901234567890';
const WALLET_ADDRESS = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12';

describe('LicenseVerifier', () => {
  let rpcProvider: MockRPCProvider;
  let mockContract: MockLicenseContract;
  let verifier: LicenseVerifier;

  beforeEach(() => {
    Logger.resetInstance();
    jest.clearAllMocks();

    rpcProvider = new MockRPCProvider();
    mockContract = new MockLicenseContract();

    // Make ethers.Contract return our mock
    const { Contract } = jest.requireMock('ethers') as { Contract: jest.Mock };
    Contract.mockImplementation(() => mockContract);

    verifier = new LicenseVerifier(rpcProvider as never, CONTRACT_ADDRESS);
    verifier.initialize();

    // Default successful fetch response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => createMockMetadata(),
    });
  });

  describe('verifyLicense() — valid license', () => {
    it('should return isValid: true when address owns a non-expired token', async () => {
      mockContract.setBalance(WALLET_ADDRESS, 1n);
      mockContract.setTokenIds(WALLET_ADDRESS, [42n]);
      mockContract.setOwner('42', WALLET_ADDRESS);
      mockContract.setTokenURI('42', 'https://metadata.example.com/42');

      const result = await verifier.verifyLicense(WALLET_ADDRESS);

      expect(result.isValid).toBe(true);
      expect(result.license).not.toBeNull();
      expect(result.license?.tokenId).toBe('42');
      expect(result.license?.contractAddress).toBe(CONTRACT_ADDRESS);
      expect(result.license?.owner).toBe(WALLET_ADDRESS);
      expect(result.blockNumber).toBe(12345678);
      expect(result.checkedAt).toBeGreaterThan(0);
    });
  });

  describe('verifyLicense() — no license', () => {
    it('should return isValid: false with reason no_license_found when balance is 0', async () => {
      mockContract.setBalance(WALLET_ADDRESS, 0n);

      const result = await verifier.verifyLicense(WALLET_ADDRESS);

      expect(result.isValid).toBe(false);
      expect(result.license).toBeNull();
      expect(result.reason).toBe('no_license_found');
    });
  });

  describe('verifyLicense() — expired license', () => {
    it('should return isValid: false with reason license_expired', async () => {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      mockContract.setBalance(WALLET_ADDRESS, 1n);
      mockContract.setTokenIds(WALLET_ADDRESS, [7n]);
      mockContract.setOwner('7', WALLET_ADDRESS);
      mockContract.setTokenURI('7', 'https://metadata.example.com/7');

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createMockMetadata({
          attributes: [
            { trait_type: 'version', value: '1.0' },
            { trait_type: 'edition', value: 'standard' },
            { trait_type: 'minted_by', value: WALLET_ADDRESS },
            { trait_type: 'game_id', value: 'test-game' },
            { trait_type: 'expires_at', value: pastTimestamp },
          ],
        }),
      });

      const result = await verifier.verifyLicense(WALLET_ADDRESS);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('license_expired');
      expect(result.license).not.toBeNull(); // License object is still returned
    });
  });

  describe('verifyLicense() — contract paused', () => {
    it('should return isValid: false with reason contract_paused', async () => {
      mockContract.setPaused(true);

      const result = await verifier.verifyLicense(WALLET_ADDRESS);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('contract_paused');
    });
  });

  describe('verifyLicense() — RPC failure', () => {
    it('should return isValid: false with reason verification_failed', async () => {
      // Use simulateCallFailure so getBlockNumber succeeds but contract calls fail
      rpcProvider.simulateCallFailure('Connection timeout');

      const result = await verifier.verifyLicense(WALLET_ADDRESS);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('verification_failed');
    });
  });

  describe('verifyLicense() — contract not initialized', () => {
    it('should throw CONTRACT_ERROR', async () => {
      const uninitVerifier = new LicenseVerifier(rpcProvider as never, CONTRACT_ADDRESS);
      // Don't call initialize()

      await expect(uninitVerifier.verifyLicense(WALLET_ADDRESS)).rejects.toMatchObject({
        code: 'CONTRACT_ERROR',
        message: expect.stringContaining('not initialized'),
      });
    });
  });

  describe('getAllLicenses()', () => {
    it('should return array of LicenseNFT objects when address owns multiple tokens', async () => {
      mockContract.setBalance(WALLET_ADDRESS, 3n);
      mockContract.setTokenIds(WALLET_ADDRESS, [10n, 20n, 30n]);
      mockContract.setOwner('10', WALLET_ADDRESS);
      mockContract.setOwner('20', WALLET_ADDRESS);
      mockContract.setOwner('30', WALLET_ADDRESS);
      mockContract.setTokenURI('10', 'https://meta.example.com/10');
      mockContract.setTokenURI('20', 'https://meta.example.com/20');
      mockContract.setTokenURI('30', 'https://meta.example.com/30');

      const licenses = await verifier.getAllLicenses(WALLET_ADDRESS);

      expect(licenses).toHaveLength(3);
      expect(licenses[0].tokenId).toBe('10');
      expect(licenses[1].tokenId).toBe('20');
      expect(licenses[2].tokenId).toBe('30');
    });

    it('should return empty array when address owns 0 tokens', async () => {
      mockContract.setBalance(WALLET_ADDRESS, 0n);

      const licenses = await verifier.getAllLicenses(WALLET_ADDRESS);

      expect(licenses).toEqual([]);
    });

    it('should throw if contract not initialized', async () => {
      const uninitVerifier = new LicenseVerifier(rpcProvider as never, CONTRACT_ADDRESS);

      await expect(uninitVerifier.getAllLicenses(WALLET_ADDRESS)).rejects.toMatchObject({
        code: 'CONTRACT_ERROR',
      });
    });
  });

  describe('getLicenseById()', () => {
    it('should fetch owner and metadata for a token', async () => {
      mockContract.setOwner('99', WALLET_ADDRESS);
      mockContract.setTokenURI('99', 'https://metadata.example.com/99');

      const license = await verifier.getLicenseById('99');

      expect(license.tokenId).toBe('99');
      expect(license.owner).toBe(WALLET_ADDRESS);
      expect(license.contractAddress).toBe(CONTRACT_ADDRESS);
      expect(license.metadata.name).toBe('Game License #1');
    });

    it('should use provided owner instead of querying contract', async () => {
      mockContract.setTokenURI('99', 'https://metadata.example.com/99');

      const license = await verifier.getLicenseById('99', '0xProvidedOwner');

      expect(license.owner).toBe('0xProvidedOwner');
    });
  });

  describe('fetchMetadata() — URI resolution', () => {
    it('should resolve IPFS URI correctly', async () => {
      mockContract.setBalance(WALLET_ADDRESS, 1n);
      mockContract.setTokenIds(WALLET_ADDRESS, [1n]);
      mockContract.setOwner('1', WALLET_ADDRESS);
      mockContract.setTokenURI('1', 'ipfs://QmTestHash123/metadata.json');

      await verifier.verifyLicense(WALLET_ADDRESS);

      expect(mockFetch).toHaveBeenCalledWith('https://ipfs.io/ipfs/QmTestHash123/metadata.json');
    });

    it('should resolve Arweave URI correctly', async () => {
      mockContract.setBalance(WALLET_ADDRESS, 1n);
      mockContract.setTokenIds(WALLET_ADDRESS, [1n]);
      mockContract.setOwner('1', WALLET_ADDRESS);
      mockContract.setTokenURI('1', 'ar://ArweaveTransactionId');

      await verifier.verifyLicense(WALLET_ADDRESS);

      expect(mockFetch).toHaveBeenCalledWith('https://arweave.net/ArweaveTransactionId');
    });

    it('should pass through HTTP URI unchanged', async () => {
      mockContract.setBalance(WALLET_ADDRESS, 1n);
      mockContract.setTokenIds(WALLET_ADDRESS, [1n]);
      mockContract.setOwner('1', WALLET_ADDRESS);
      mockContract.setTokenURI('1', 'https://api.example.com/token/1');

      await verifier.verifyLicense(WALLET_ADDRESS);

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/token/1');
    });

    it('should return default metadata when fetch fails', async () => {
      mockContract.setBalance(WALLET_ADDRESS, 1n);
      mockContract.setTokenIds(WALLET_ADDRESS, [1n]);
      mockContract.setOwner('1', WALLET_ADDRESS);
      mockContract.setTokenURI('1', 'https://broken.example.com/metadata');

      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await verifier.verifyLicense(WALLET_ADDRESS);

      expect(result.isValid).toBe(true);
      expect(result.license?.metadata.name).toBe('Game License');
      expect(result.license?.metadata.attributes.edition).toBe('standard');
    });
  });

  describe('parseAttributes()', () => {
    it('should parse all attribute types correctly', async () => {
      mockContract.setBalance(WALLET_ADDRESS, 1n);
      mockContract.setTokenIds(WALLET_ADDRESS, [1n]);
      mockContract.setOwner('1', WALLET_ADDRESS);
      mockContract.setTokenURI('1', 'https://meta.example.com/1');

      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400;

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createMockMetadata({
          attributes: [
            { trait_type: 'version', value: '3.0' },
            { trait_type: 'edition', value: 'founders' },
            { trait_type: 'minted_by', value: '0xMinter' },
            { trait_type: 'game_id', value: 'epic-game' },
            { trait_type: 'soulbound', value: true },
            { trait_type: 'expires_at', value: futureTimestamp },
            { trait_type: 'tier', value: 'ultimate' },
            { trait_type: 'cross_game_access', value: ['game-a', 'game-b'] },
          ],
        }),
      });

      const result = await verifier.verifyLicense(WALLET_ADDRESS);

      const attrs = result.license!.metadata.attributes;
      expect(attrs.version).toBe('3.0');
      expect(attrs.edition).toBe('founders');
      expect(attrs.mintedBy).toBe('0xMinter');
      expect(attrs.gameId).toBe('epic-game');
      expect(attrs.soulbound).toBe(true);
      expect(attrs.expiresAt).toBe(futureTimestamp);
      expect(attrs.tier).toBe('ultimate');
      expect(attrs.crossGameAccess).toEqual(['game-a', 'game-b']);
    });

    it('should handle snake_case and camelCase variations', async () => {
      mockContract.setBalance(WALLET_ADDRESS, 1n);
      mockContract.setTokenIds(WALLET_ADDRESS, [1n]);
      mockContract.setOwner('1', WALLET_ADDRESS);
      mockContract.setTokenURI('1', 'https://meta.example.com/1');

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createMockMetadata({
          attributes: [
            { trait_type: 'version', value: '1.0' },
            { trait_type: 'edition', value: 'standard' },
            { trait_type: 'mintedBy', value: '0xMinterCamel' },
            { trait_type: 'gameId', value: 'camel-game' },
            { trait_type: 'expiresAt', value: 9999999999 },
            { trait_type: 'crossGameAccess', value: 'single-game' },
          ],
        }),
      });

      const result = await verifier.verifyLicense(WALLET_ADDRESS);

      const attrs = result.license!.metadata.attributes;
      expect(attrs.mintedBy).toBe('0xMinterCamel');
      expect(attrs.gameId).toBe('camel-game');
      expect(attrs.expiresAt).toBe(9999999999);
      expect(attrs.crossGameAccess).toEqual(['single-game']);
    });
  });
});
