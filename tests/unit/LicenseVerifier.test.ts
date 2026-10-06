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
import type { GLWMError } from '../../src/types';

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

  /** WALLET_ADDRESS owns token 42, with metadata */
  function ownsToken42(): void {
    mockContract.setBalance(WALLET_ADDRESS, 1n);
    mockContract.setTokenIds(WALLET_ADDRESS, [42n]);
    mockContract.setOwner('42', WALLET_ADDRESS);
    mockContract.setTokenURI('42', 'https://metadata.example.com/42');
  }

  /** Make one contract function reject with `error`; the others keep working */
  function failContractCall(name: string, error: unknown): void {
    const getFunction = mockContract.getFunction.bind(mockContract);
    jest.spyOn(mockContract, 'getFunction').mockImplementation((fn: string) =>
      fn === name
        ? async (): Promise<never> => {
            throw error;
          }
        : getFunction(fn)
    );
  }

  /** The error a promise rejects with (fails the test if it resolves) */
  function rejectionOf(promise: Promise<unknown>): Promise<GLWMError> {
    return promise.then(
      (value) => {
        const reason = (value as { reason?: string } | null)?.reason;
        throw new Error(`Expected a rejection, but it resolved (reason: ${String(reason)})`);
      },
      (error: unknown) => error as GLWMError
    );
  }

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
        json: async () =>
          createMockMetadata({
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

  describe('fallback providers', () => {
    it('reads the license contract through the fallback when the primary RPC fails', async () => {
      const primary = { url: 'https://primary.example' };
      const fallback = { url: 'https://fallback.example' };
      const working = new MockLicenseContract();
      working.setBalance(WALLET_ADDRESS, 1n);
      working.setTokenIds(WALLET_ADDRESS, [42n]);
      working.setOwner('42', WALLET_ADDRESS);
      working.setTokenURI('42', 'https://metadata.example.com/42');
      const broken = {
        getFunction: () => async () => {
          throw new Error('primary RPC down');
        },
      };
      // A Contract reads through the provider (runner) it is bound to
      const { Contract } = jest.requireMock('ethers') as { Contract: jest.Mock };
      Contract.mockImplementation((_address: string, _abi: unknown, runner: unknown) =>
        runner === fallback ? working : broken
      );
      // RPCProvider.call() tries the primary, then each fallback, handing each to the operation
      const rpc = {
        getProvider: () => primary,
        getBlockNumber: async () => 12345678,
        call: async <T>(fn: (provider: unknown) => Promise<T>): Promise<T> => {
          try {
            return await fn(primary);
          } catch {
            return fn(fallback);
          }
        },
      };
      const withFallback = new LicenseVerifier(rpc as never, CONTRACT_ADDRESS);
      withFallback.initialize();

      const result = await withFallback.verifyLicense(WALLET_ADDRESS);

      expect(result).toMatchObject({ isValid: true, license: { tokenId: '42' } });
    });
  });

  // A paused contract is not a verdict: ownership could not be read, and minting cannot work on
  // it. It is thrown as CONTRACT_ERROR, not returned as { reason: 'contract_paused' }.
  describe('verifyLicense() — contract paused', () => {
    it('should throw CONTRACT_ERROR when a contract read reverts as paused', async () => {
      ownsToken42();
      mockContract.setPaused(true);

      const thrown = await rejectionOf(verifier.verifyLicense(WALLET_ADDRESS));

      expect(thrown).toMatchObject({
        code: 'CONTRACT_ERROR',
        message: expect.stringContaining('paused'),
        recoverable: true,
        suggestedAction: expect.stringContaining('unpaused'),
      });
      // A JSON-safe summary of the revert
      expect(thrown.details).toEqual({ name: 'Error', message: expect.stringContaining('paused') });
    });

    it('should detect paused when the RPC layer throws a GLWMError object', async () => {
      // The real RPCProvider.call() wraps failures in a plain GLWMError, not an Error
      const rpcError = {
        code: 'RPC_ERROR',
        message: 'RPC call failed after 3 attempts: Execution reverted: contract is paused',
        recoverable: true,
      };
      jest.spyOn(rpcProvider, 'call').mockRejectedValue(rpcError);

      const thrown = await rejectionOf(verifier.verifyLicense(WALLET_ADDRESS));

      expect(thrown).toMatchObject({ code: 'CONTRACT_ERROR' });
      expect(thrown.message).toContain('Execution reverted: contract is paused');
      // A summary of the RPC layer's error (which here carries no details of its own)
      expect(thrown.details).toEqual({ code: 'RPC_ERROR', message: rpcError.message });
    });
  });

  // A failed read is not a verdict either: it is thrown, never returned as
  // { reason: 'verification_failed' } (which callers took for "no license")
  describe('verifyLicense() — RPC failure', () => {
    it('should throw RPC_ERROR when every contract call fails', async () => {
      // Use simulateCallFailure so getBlockNumber succeeds but contract calls fail
      rpcProvider.simulateCallFailure('Connection timeout');

      await expect(verifier.verifyLicense(WALLET_ADDRESS)).rejects.toMatchObject({
        code: 'RPC_ERROR',
        message: expect.stringContaining('Connection timeout'),
        recoverable: true,
      });
    });

    it('should throw RPC_ERROR when getBlockNumber fails', async () => {
      const cause = new Error('Connection refused');
      jest.spyOn(rpcProvider, 'getBlockNumber').mockRejectedValue(cause);

      const thrown = await rejectionOf(verifier.verifyLicense(WALLET_ADDRESS));

      expect(thrown).toMatchObject({ code: 'RPC_ERROR', recoverable: true });
      expect(thrown.details).toEqual({ name: 'Error', message: cause.message });
    });

    it.each(['balanceOf', 'tokenOfOwnerByIndex', 'tokenURI'])(
      'should throw RPC_ERROR when %s fails, keeping the cause',
      async (name) => {
        ownsToken42();
        const cause = new Error('Connection timeout');
        failContractCall(name, cause);

        const thrown = await rejectionOf(verifier.verifyLicense(WALLET_ADDRESS));

        expect(thrown).toMatchObject({
          code: 'RPC_ERROR',
          message: expect.stringContaining('Connection timeout'),
          recoverable: true,
        });
        expect(thrown.details).toEqual({ name: 'Error', message: cause.message });
      }
    );

    it('should rethrow a GLWMError from the RPC layer unchanged', async () => {
      const rpcError = {
        code: 'RPC_ERROR',
        message: 'RPC call failed after 3 attempts: timeout',
        recoverable: true,
      };
      jest.spyOn(rpcProvider, 'call').mockRejectedValue(rpcError);

      await expect(verifier.verifyLicense(WALLET_ADDRESS)).rejects.toBe(rpcError);
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

    it.each(['balanceOf', 'tokenOfOwnerByIndex', 'tokenURI'])(
      'should throw RPC_ERROR when %s fails, keeping the cause',
      async (name) => {
        ownsToken42();
        const cause = new Error('Connection timeout');
        failContractCall(name, cause);

        const thrown = await rejectionOf(verifier.getAllLicenses(WALLET_ADDRESS));

        expect(thrown).toMatchObject({ code: 'RPC_ERROR' });
        expect(thrown.details).toEqual({ name: 'Error', message: cause.message });
      }
    );

    it('should throw CONTRACT_ERROR when the contract is paused', async () => {
      ownsToken42();
      mockContract.setPaused(true);

      await expect(verifier.getAllLicenses(WALLET_ADDRESS)).rejects.toMatchObject({
        code: 'CONTRACT_ERROR',
        message: expect.stringContaining('paused'),
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

    it.each(['ownerOf', 'tokenURI'])(
      'should throw RPC_ERROR when %s fails, keeping the cause',
      async (name) => {
        mockContract.setOwner('99', WALLET_ADDRESS);
        mockContract.setTokenURI('99', 'https://metadata.example.com/99');
        const cause = new Error('Connection timeout');
        failContractCall(name, cause);

        const thrown = await rejectionOf(verifier.getLicenseById('99'));

        expect(thrown).toMatchObject({ code: 'RPC_ERROR' });
        expect(thrown.details).toEqual({ name: 'Error', message: cause.message });
      }
    );

    it('should throw CONTRACT_ERROR when the contract is paused', async () => {
      mockContract.setOwner('99', WALLET_ADDRESS);
      mockContract.setTokenURI('99', 'https://metadata.example.com/99');
      mockContract.setPaused(true);

      await expect(verifier.getLicenseById('99')).rejects.toMatchObject({
        code: 'CONTRACT_ERROR',
      });
    });
  });

  describe('fetchMetadata() — URI resolution', () => {
    it('should resolve IPFS URI correctly', async () => {
      mockContract.setBalance(WALLET_ADDRESS, 1n);
      mockContract.setTokenIds(WALLET_ADDRESS, [1n]);
      mockContract.setOwner('1', WALLET_ADDRESS);
      mockContract.setTokenURI('1', 'ipfs://QmTestHash123/metadata.json');

      await verifier.verifyLicense(WALLET_ADDRESS);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://ipfs.io/ipfs/QmTestHash123/metadata.json',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('should resolve Arweave URI correctly', async () => {
      mockContract.setBalance(WALLET_ADDRESS, 1n);
      mockContract.setTokenIds(WALLET_ADDRESS, [1n]);
      mockContract.setOwner('1', WALLET_ADDRESS);
      mockContract.setTokenURI('1', 'ar://ArweaveTransactionId');

      await verifier.verifyLicense(WALLET_ADDRESS);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://arweave.net/ArweaveTransactionId',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('should pass through HTTP URI unchanged', async () => {
      mockContract.setBalance(WALLET_ADDRESS, 1n);
      mockContract.setTokenIds(WALLET_ADDRESS, [1n]);
      mockContract.setOwner('1', WALLET_ADDRESS);
      mockContract.setTokenURI('1', 'https://api.example.com/token/1');

      await verifier.verifyLicense(WALLET_ADDRESS);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/token/1',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
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
        json: async () =>
          createMockMetadata({
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
        json: async () =>
          createMockMetadata({
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
