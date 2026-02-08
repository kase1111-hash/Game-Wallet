/**
 * @jest-environment jsdom
 */

/**
 * Integration tests for the verifyAndPlay() flow
 *
 * Wires all mocks together to test the full SDK orchestration:
 * init → connect → verify → mint if needed → verify again
 */

import { GLWM } from '../../src/GLWM';
import type { GLWMConfig, GLWMState } from '../../src/types';
import { Logger } from '../../src/utils/Logger';
import { MockEthereumProvider } from '../mocks/ethereum-provider';
import { createMockMetadata } from '../mocks/license-contract';

// --- Shared mock state accessible by both the mock factory and tests ---
// Use a mutable container to avoid jest.mock hoisting / TDZ issues
const mockState = {
  blockNumber: 12345678,
  balanceOf: jest.fn().mockResolvedValue(1n),
  tokenOfOwnerByIndex: jest.fn().mockResolvedValue(1n),
  ownerOf: jest.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
  tokenURI: jest.fn().mockResolvedValue('https://metadata.example.com/1'),
};

// Mock ethers.js completely
jest.mock('ethers', () => {
  const contractProxy = {
    getFunction: (name: string) => {
      switch (name) {
        case 'balanceOf': return mockState.balanceOf;
        case 'tokenOfOwnerByIndex': return mockState.tokenOfOwnerByIndex;
        case 'ownerOf': return mockState.ownerOf;
        case 'tokenURI': return mockState.tokenURI;
        default: return jest.fn();
      }
    },
  };

  return {
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      getBlockNumber: jest.fn().mockImplementation(() => Promise.resolve(mockState.blockNumber)),
      getNetwork: jest.fn().mockResolvedValue({ chainId: 137n }),
    })),
    Network: {
      from: jest.fn().mockReturnValue({ chainId: 137n }),
    },
    BrowserProvider: jest.fn().mockImplementation(() => ({})),
    Contract: jest.fn().mockImplementation(() => contractProxy),
    getAddress: jest.fn((addr: string) => addr),
    isAddress: jest.fn(() => true),
  };
});

// Mock fetch for metadata
const mockFetch = jest.fn();
global.fetch = mockFetch;

const WALLET_ADDRESS = '0x1234567890123456789012345678901234567890';
const CONTRACT_ADDRESS = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12';

function createConfig(overrides: Partial<GLWMConfig> = {}): GLWMConfig {
  return {
    licenseContract: CONTRACT_ADDRESS,
    chainId: 137,
    rpcProvider: {
      provider: 'custom',
      customUrl: 'https://polygon-rpc.com',
    },
    mintingPortal: {
      url: 'https://mint.example.com',
      mode: 'iframe',
    },
    ...overrides,
  };
}

function setupMockWallet(): MockEthereumProvider {
  const provider = new MockEthereumProvider({
    accounts: [WALLET_ADDRESS],
    chainId: 137,
    isMetaMask: true,
  });
  // In jsdom, window already exists — set ethereum directly
  (window as unknown as Record<string, unknown>).ethereum = provider;
  return provider;
}

function cleanupMockWallet(): void {
  delete (window as unknown as Record<string, unknown>).ethereum;
}

describe('verifyAndPlay() integration', () => {
  let sdk: GLWM;

  beforeEach(() => {
    jest.clearAllMocks();
    Logger.resetInstance();
    document.body.innerHTML = '';
    cleanupMockWallet();

    // Reset mock behaviors
    mockState.blockNumber = 12345678;
    mockState.balanceOf = jest.fn().mockResolvedValue(1n);
    mockState.tokenOfOwnerByIndex = jest.fn().mockResolvedValue(1n);
    mockState.ownerOf = jest.fn().mockResolvedValue(WALLET_ADDRESS);
    mockState.tokenURI = jest.fn().mockResolvedValue('https://metadata.example.com/1');

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => createMockMetadata(),
    });
  });

  afterEach(async () => {
    if (sdk) {
      await sdk.dispose();
    }
    cleanupMockWallet();
  });

  describe('happy path — user has license', () => {
    it('should return valid result through init → connect → verify flow', async () => {
      setupMockWallet();
      sdk = new GLWM(createConfig());
      await sdk.initialize();

      // Connect wallet
      await sdk.connectWallet('metamask');

      // Verify and play
      const result = await sdk.verifyAndPlay();

      expect(result.isValid).toBe(true);
      expect(result.license).not.toBeNull();
      expect(result.license?.tokenId).toBe('1');
      expect(sdk.getState().status).toBe('license_valid');
    });
  });

  describe('wallet not connected — auto-connects', () => {
    it('should auto-connect wallet during verifyAndPlay', async () => {
      setupMockWallet();
      sdk = new GLWM(createConfig());
      await sdk.initialize();

      // Don't manually connect — verifyAndPlay should auto-connect
      const result = await sdk.verifyAndPlay();

      expect(result.isValid).toBe(true);
      expect(sdk.getWalletSession().isConnected).toBe(true);
    });
  });

  describe('no license — minting portal opens', () => {
    it('should open portal when no license found, then re-verify after close', async () => {
      setupMockWallet();
      sdk = new GLWM(createConfig());
      await sdk.initialize();
      await sdk.connectWallet('metamask');

      // First verify: no license
      mockState.balanceOf = jest.fn().mockResolvedValue(0n);

      // Start verifyAndPlay (will open portal)
      const verifyPromise = sdk.verifyAndPlay();

      // Wait for portal to open
      await new Promise((r) => setTimeout(r, 50));

      expect(sdk.getState().status).toBe('minting_portal_open');

      // Simulate: user minted, now balance is 1
      mockState.balanceOf = jest.fn().mockResolvedValue(1n);

      // Close portal (simulates user completing mint)
      sdk.closeMintingPortal();

      const result = await verifyPromise;

      // After portal close, verifyAndPlay does a fresh verify
      expect(result).toBeDefined();
      expect(result.blockNumber).toBeDefined();
    });
  });

  describe('minting already in progress — throws', () => {
    it('should throw when called while minting portal is open', async () => {
      setupMockWallet();
      sdk = new GLWM(createConfig());
      await sdk.initialize();
      await sdk.connectWallet('metamask');

      // First call: no license, opens portal
      mockState.balanceOf = jest.fn().mockResolvedValue(0n);
      const firstCall = sdk.verifyAndPlay();

      // Wait for portal to open
      await new Promise((r) => setTimeout(r, 50));

      // Second call while portal is open
      await expect(sdk.verifyAndPlay()).rejects.toMatchObject({
        code: 'USER_CANCELLED',
        message: expect.stringContaining('already in progress'),
      });

      // Clean up
      sdk.closeMintingPortal();
      await firstCall;
    });
  });

  describe('state transitions', () => {
    it('should emit states in correct order for happy path', async () => {
      setupMockWallet();
      sdk = new GLWM(createConfig());

      const states: GLWMState['status'][] = [];
      sdk.subscribe((state) => states.push(state.status));

      await sdk.initialize();
      await sdk.connectWallet('metamask');
      await sdk.verifyAndPlay();

      expect(states).toContain('initializing');
      expect(states).toContain('awaiting_wallet');
      expect(states).toContain('connecting_wallet');
      expect(states).toContain('verifying_license');
      expect(states).toContain('license_valid');

      // Verify order: initializing comes before awaiting_wallet
      const initIdx = states.indexOf('initializing');
      const awaitIdx = states.indexOf('awaiting_wallet');
      expect(initIdx).toBeLessThan(awaitIdx);
    });
  });

  describe('cache behavior', () => {
    it('should use cached result on second verification', async () => {
      setupMockWallet();
      sdk = new GLWM(createConfig({
        cacheConfig: { enabled: true, ttlSeconds: 300, storageKey: 'test' },
      }));
      await sdk.initialize();
      await sdk.connectWallet('metamask');

      // First verify — hits RPC
      const result1 = await sdk.verifyLicense();
      expect(result1.isValid).toBe(true);
      const callCount1 = mockState.balanceOf.mock.calls.length;

      // Second verify — should use cache
      const result2 = await sdk.verifyLicense();
      expect(result2.isValid).toBe(true);
      const callCount2 = mockState.balanceOf.mock.calls.length;

      // balanceOf should not have been called again
      expect(callCount2).toBe(callCount1);
    });

    it('verifyLicenseFresh() should bypass cache', async () => {
      setupMockWallet();
      sdk = new GLWM(createConfig({
        cacheConfig: { enabled: true, ttlSeconds: 300, storageKey: 'test' },
      }));
      await sdk.initialize();
      await sdk.connectWallet('metamask');

      // First verify — hits RPC
      await sdk.verifyLicense();
      const callCount1 = mockState.balanceOf.mock.calls.length;

      // Fresh verify — should bypass cache and hit RPC again
      await sdk.verifyLicenseFresh();
      const callCount2 = mockState.balanceOf.mock.calls.length;

      expect(callCount2).toBeGreaterThan(callCount1);
    });
  });

  describe('event callbacks', () => {
    it('should call onLicenseVerified callback', async () => {
      setupMockWallet();
      const onLicenseVerified = jest.fn();
      sdk = new GLWM(createConfig({ onLicenseVerified }));
      await sdk.initialize();
      await sdk.connectWallet('metamask');

      await sdk.verifyLicense();

      expect(onLicenseVerified).toHaveBeenCalledWith(
        expect.objectContaining({ isValid: true })
      );
    });

    it('should call onWalletConnected callback', async () => {
      setupMockWallet();
      const onWalletConnected = jest.fn();
      sdk = new GLWM(createConfig({ onWalletConnected }));
      await sdk.initialize();

      await sdk.connectWallet('metamask');

      expect(onWalletConnected).toHaveBeenCalledWith(
        expect.objectContaining({ address: WALLET_ADDRESS })
      );
    });
  });
});
