/**
 * @jest-environment jsdom
 */

/**
 * Integration tests for config.onError
 *
 * The documented contract is that onError is "called on any error". Each test
 * asserts it fires exactly once, with the error the SDK surfaces, for errors
 * GLWM creates itself and for errors coming from its components (RPC, wallet,
 * license verifier, minting portal).
 */

import { GLWM } from '../../src/GLWM';
import type { GLWMConfig, GLWMError } from '../../src/types';
import { Logger } from '../../src/utils/Logger';
import { MockEthereumProvider } from '../mocks/ethereum-provider';
import { createMockMetadata } from '../mocks/license-contract';

// Use a mutable container to avoid jest.mock hoisting / TDZ issues
const mockState = {
  getBlockNumber: jest.fn<Promise<number>, []>(),
  balanceOf: jest.fn(),
  tokenOfOwnerByIndex: jest.fn(),
  ownerOf: jest.fn(),
  tokenURI: jest.fn(),
};

jest.mock('ethers', () => {
  const contractProxy = {
    getFunction: (name: string) => {
      switch (name) {
        case 'balanceOf':
          return mockState.balanceOf;
        case 'tokenOfOwnerByIndex':
          return mockState.tokenOfOwnerByIndex;
        case 'ownerOf':
          return mockState.ownerOf;
        case 'tokenURI':
          return mockState.tokenURI;
        default:
          return jest.fn();
      }
    },
  };

  return {
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      getBlockNumber: () => mockState.getBlockNumber(),
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

const mockFetch = jest.fn();
global.fetch = mockFetch;

const WALLET_ADDRESS = '0x1234567890123456789012345678901234567890';
const PORTAL_URL = 'https://mint.example.com';

function createConfig(overrides: Partial<GLWMConfig> = {}): GLWMConfig {
  return {
    licenseContract: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
    chainId: 137,
    rpcProvider: {
      provider: 'custom',
      customUrl: 'https://polygon-rpc.com',
      // Fail fast: retry/backoff is covered by the RPCProvider unit tests
      retryAttempts: 1,
    },
    mintingPortal: { url: PORTAL_URL, mode: 'iframe' },
    ...overrides,
  };
}

function setupMockWallet(chainId = 137): MockEthereumProvider {
  const provider = new MockEthereumProvider({
    accounts: [WALLET_ADDRESS],
    chainId,
    isMetaMask: true,
  });
  (window as unknown as Record<string, unknown>).ethereum = provider;
  return provider;
}

function cleanupMockWallet(): void {
  delete (window as unknown as Record<string, unknown>).ethereum;
}

const rpcDown = (): Error => new Error('connect ECONNREFUSED');

describe('onError reporting', () => {
  let sdk: GLWM;
  let onError: jest.Mock<void, [GLWMError]>;

  /** Create the SDK with an onError spy that also records the SDK state at call time */
  function createSdk(overrides: Partial<GLWMConfig> = {}): { statusAtCall: string[] } {
    const statusAtCall: string[] = [];
    onError = jest.fn((_error: GLWMError) => {
      statusAtCall.push(sdk.getState().status);
    });
    sdk = new GLWM(createConfig({ onError, ...overrides }));
    return { statusAtCall };
  }

  function expectReportedOnce(code: GLWMError['code']): void {
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code }));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    Logger.resetInstance();
    document.body.innerHTML = '';
    cleanupMockWallet();

    mockState.getBlockNumber.mockReset().mockResolvedValue(12345678);
    mockState.balanceOf = jest.fn().mockResolvedValue(1n);
    mockState.tokenOfOwnerByIndex = jest.fn().mockResolvedValue(1n);
    mockState.ownerOf = jest.fn().mockResolvedValue(WALLET_ADDRESS);
    mockState.tokenURI = jest.fn().mockResolvedValue('https://metadata.example.com/1');

    mockFetch.mockResolvedValue({ ok: true, json: async () => createMockMetadata() });
  });

  afterEach(async () => {
    await sdk?.dispose();
    cleanupMockWallet();
  });

  it('is not called on the happy path', async () => {
    setupMockWallet();
    createSdk();

    await sdk.initialize();
    const result = await sdk.verifyAndPlay();

    expect(result.isValid).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  describe('errors from SDK components', () => {
    it('initialize(): RPC provider unreachable', async () => {
      mockState.getBlockNumber.mockRejectedValue(rpcDown());
      const { statusAtCall } = createSdk();

      await expect(sdk.initialize()).rejects.toMatchObject({ code: 'RPC_ERROR' });

      expectReportedOnce('RPC_ERROR');
      expect(statusAtCall).toEqual(['error']);
    });

    it('initialize(): invalid RPC configuration', async () => {
      createSdk({ rpcProvider: { provider: 'alchemy' } }); // missing apiKey

      await expect(sdk.initialize()).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });

      expectReportedOnce('CONFIGURATION_ERROR');
    });

    it('connectWallet(): user rejects the connection', async () => {
      setupMockWallet().simulateRejectConnection();
      const { statusAtCall } = createSdk();
      await sdk.initialize();

      await expect(sdk.connectWallet('metamask')).rejects.toMatchObject({
        code: 'WALLET_CONNECTION_REJECTED',
      });

      expectReportedOnce('WALLET_CONNECTION_REJECTED');
      expect(statusAtCall).toEqual(['error']);
    });

    it('connectWallet(): no wallet installed', async () => {
      createSdk();
      await sdk.initialize();

      // WalletConnector currently re-wraps WALLET_NOT_FOUND as NETWORK_ERROR (see
      // WalletConnector.test.ts), so assert onError gets exactly the error that was thrown
      const thrown = await sdk.connectWallet().catch((error: GLWMError) => error);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]?.[0]).toBe(thrown);
    });

    it('verifyLicense(): RPC failure during verification', async () => {
      setupMockWallet();
      const { statusAtCall } = createSdk();
      await sdk.initialize();
      await sdk.connectWallet('metamask');
      mockState.getBlockNumber.mockRejectedValue(rpcDown());

      await expect(sdk.verifyLicense()).rejects.toMatchObject({ code: 'RPC_ERROR' });

      expectReportedOnce('RPC_ERROR');
      expect(statusAtCall).toEqual(['error']);
    });

    it('switchChain(): chain not configured in the wallet', async () => {
      setupMockWallet().simulateSwitchChainError(4902);
      createSdk();
      await sdk.initialize();
      await sdk.connectWallet('metamask');

      await expect(sdk.switchChain(1)).rejects.toMatchObject({ code: 'CHAIN_MISMATCH' });

      expectReportedOnce('CHAIN_MISMATCH');
    });

    it('checkLicenseForAddress(): RPC failure, without entering the error state', async () => {
      createSdk();
      await sdk.initialize();
      mockState.getBlockNumber.mockRejectedValue(rpcDown());

      await expect(sdk.checkLicenseForAddress(WALLET_ADDRESS)).rejects.toMatchObject({
        code: 'RPC_ERROR',
      });

      expectReportedOnce('RPC_ERROR');
      expect(sdk.getState().status).toBe('awaiting_wallet');
    });

    it('getLicenseDetails(): RPC failure', async () => {
      createSdk();
      await sdk.initialize();
      mockState.ownerOf.mockRejectedValue(rpcDown());

      await expect(sdk.getLicenseDetails('1')).rejects.toMatchObject({ code: 'RPC_ERROR' });

      expectReportedOnce('RPC_ERROR');
    });

    it('getAllLicenses(): RPC failure', async () => {
      setupMockWallet();
      createSdk();
      await sdk.initialize();
      await sdk.connectWallet('metamask');
      mockState.balanceOf.mockRejectedValue(rpcDown());

      await expect(sdk.getAllLicenses()).rejects.toMatchObject({ code: 'RPC_ERROR' });

      expectReportedOnce('RPC_ERROR');
    });

    it('openMintingPortal(): portal cannot open', async () => {
      createSdk({ mintingPortal: { url: PORTAL_URL, mode: 'unsupported' as never } });
      await sdk.initialize();

      await expect(sdk.openMintingPortal()).rejects.toMatchObject({
        code: 'CONFIGURATION_ERROR',
      });

      expectReportedOnce('CONFIGURATION_ERROR');
    });

    it('minting portal reports MINT_FAILED', async () => {
      setupMockWallet();
      createSdk();
      await sdk.initialize();
      await sdk.connectWallet('metamask');
      const mintCompleted = jest.fn();
      sdk.on('MINT_COMPLETED', mintCompleted);
      await sdk.openMintingPortal();

      window.dispatchEvent(
        new MessageEvent('message', {
          origin: PORTAL_URL,
          data: {
            type: 'MINT_FAILED',
            payload: { code: 'MINT_FAILED', message: 'Transaction reverted', recoverable: true },
          },
        })
      );

      expectReportedOnce('MINT_FAILED');
      // The existing event still fires with the failed result
      expect(mintCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ result: expect.objectContaining({ success: false }) })
      );
    });
  });

  describe('exactly once', () => {
    it('chain mismatch on connect', async () => {
      setupMockWallet(1); // wallet on mainnet, SDK expects Polygon
      createSdk();
      await sdk.initialize();

      await sdk.connectWallet('metamask');

      expectReportedOnce('CHAIN_MISMATCH');
    });

    it('chain mismatch when the wallet switches chains', async () => {
      const wallet = setupMockWallet();
      createSdk();
      await sdk.initialize();
      await sdk.connectWallet('metamask');

      wallet.emitEvent('chainChanged', '0x1');

      expectReportedOnce('CHAIN_MISMATCH');
    });

    it('wallet rejection inside verifyAndPlay()', async () => {
      setupMockWallet().simulateRejectConnection();
      createSdk();
      await sdk.initialize();

      await expect(sdk.verifyAndPlay()).rejects.toMatchObject({
        code: 'WALLET_CONNECTION_REJECTED',
      });

      expectReportedOnce('WALLET_CONNECTION_REJECTED');
    });

    it('SDK used before initialize()', async () => {
      createSdk();

      await expect(sdk.verifyLicense()).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });

      expectReportedOnce('CONFIGURATION_ERROR');
    });

    it('getAllLicenses() with no wallet connected', async () => {
      createSdk();
      await sdk.initialize();

      await expect(sdk.getAllLicenses()).rejects.toMatchObject({ code: 'WALLET_DISCONNECTED' });

      expectReportedOnce('WALLET_DISCONNECTED');
    });
  });

  describe('callback robustness', () => {
    it('an onError that throws does not replace the SDK error or skip the error state', async () => {
      mockState.getBlockNumber.mockRejectedValue(rpcDown());
      createSdk();
      onError.mockImplementation(() => {
        throw new Error('bug in the app callback');
      });

      await expect(sdk.initialize()).rejects.toMatchObject({ code: 'RPC_ERROR' });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(sdk.getState().status).toBe('error');
    });
  });
});
