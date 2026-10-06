/**
 * @jest-environment jsdom
 */

/**
 * Integration tests for error reporting: config.onError and the 'ERROR' event
 *
 * The documented contract is that onError is "called on any error". Each test
 * asserts that onError and the 'ERROR' event each fire exactly once, with the
 * same error object, for errors GLWM creates itself and for errors coming from
 * its components (RPC, wallet, license verifier, minting portal).
 */

import { GLWM } from '../../src/GLWM';
import type { GLWMConfig, GLWMError, GLWMEvent } from '../../src/types';
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
  let errorEvents: jest.Mock<void, [Extract<GLWMEvent, { type: 'ERROR' }>]>;

  /**
   * Create the SDK with an onError spy (which also records the SDK state at call time)
   * and an 'ERROR' event handler
   */
  function createSdk(overrides: Partial<GLWMConfig> = {}): { statusAtCall: string[] } {
    const statusAtCall: string[] = [];
    onError = jest.fn((_error: GLWMError) => {
      statusAtCall.push(sdk.getState().status);
    });
    errorEvents = jest.fn();
    sdk = new GLWM(createConfig({ onError, ...overrides }));
    sdk.on('ERROR', errorEvents);
    return { statusAtCall };
  }

  /** onError and the 'ERROR' event each fired once, with the same error object */
  function expectReportedOnce(code: GLWMError['code']): void {
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code }));
    expect(errorEvents).toHaveBeenCalledTimes(1);
    expect(errorEvents.mock.calls[0]?.[0]).toEqual({ type: 'ERROR', error: expect.anything() });
    expect(errorEvents.mock.calls[0]?.[0].error).toBe(onError.mock.calls[0]?.[0]);
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
    expect(errorEvents).not.toHaveBeenCalled();
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

      const thrown = await sdk.connectWallet().catch((error: GLWMError) => error);

      expect(thrown).toMatchObject({ code: 'WALLET_NOT_FOUND' });
      expectReportedOnce('WALLET_NOT_FOUND');
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

    it('verifyLicense(): a contract read fails (balanceOf)', async () => {
      setupMockWallet();
      const { statusAtCall } = createSdk();
      await sdk.initialize();
      await sdk.connectWallet('metamask');
      mockState.balanceOf.mockRejectedValue(rpcDown());

      await expect(sdk.verifyLicense()).rejects.toMatchObject({ code: 'RPC_ERROR' });

      expectReportedOnce('RPC_ERROR');
      expect(statusAtCall).toEqual(['error']);
    });

    it('checkLicenseForAddress(): a contract read fails, without entering the error state', async () => {
      createSdk();
      await sdk.initialize();
      mockState.balanceOf.mockRejectedValue(rpcDown());

      await expect(sdk.checkLicenseForAddress(WALLET_ADDRESS)).rejects.toMatchObject({
        code: 'RPC_ERROR',
      });

      expectReportedOnce('RPC_ERROR');
      expect(sdk.getState().status).toBe('awaiting_wallet');
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
          // The payload shape documented in docs/quickstart.md (no `recoverable`)
          data: {
            type: 'MINT_FAILED',
            payload: { code: 'MINT_FAILED', message: 'Transaction reverted' },
          },
        })
      );

      expectReportedOnce('MINT_FAILED');
      expect(onError).toHaveBeenCalledWith({
        code: 'MINT_FAILED',
        message: 'Transaction reverted',
        recoverable: true,
      });
      // The existing event still fires with the failed result
      expect(mintCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ result: expect.objectContaining({ success: false }) })
      );
    });

    it('minting portal reports MINT_COMPLETED with a malformed error', async () => {
      setupMockWallet();
      createSdk();
      await sdk.initialize();
      await sdk.connectWallet('metamask');
      const portalClosed = jest.fn();
      sdk.on('CLOSE_MINTING_PORTAL', portalClosed);
      await sdk.openMintingPortal();

      // Portal messages are untrusted input: `error` here is a string, not a MintError
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: PORTAL_URL,
          data: {
            type: 'MINT_COMPLETED',
            payload: { success: false, error: 'insufficient funds' },
          },
        })
      );

      expectReportedOnce('MINT_FAILED');
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'insufficient funds', recoverable: true })
      );
      // The portal still auto-closes, so a waiting verifyAndPlay() can continue
      expect(portalClosed).toHaveBeenCalledTimes(1);
      expect(document.getElementById('glwm-portal-overlay')).toBeNull();
    });

    it('a plain Error thrown inside a reporting site (app callback)', async () => {
      setupMockWallet();
      const appBug = new Error('bug in onLicenseVerified');
      const { statusAtCall } = createSdk({
        onLicenseVerified: () => {
          throw appBug;
        },
      });
      await sdk.initialize();
      await sdk.connectWallet('metamask');

      const thrown = await sdk.verifyLicense().catch((error: GLWMError) => error);

      expect(thrown).toMatchObject({ code: 'NETWORK_ERROR', message: 'bug in onLicenseVerified' });
      expect(thrown.details).toBe(appBug); // original error (and its stack) kept
      expectReportedOnce('NETWORK_ERROR');
      expect(onError.mock.calls[0]?.[0]).toBe(thrown);
      expect(statusAtCall).toEqual(['error']);
    });

    it('a non-GLWMError from a component keeps its message (cross-realm TypeError)', async () => {
      createSdk({ mintingPortal: { url: 'not a url', mode: 'iframe' } });
      await sdk.initialize();

      const thrown = await sdk.openMintingPortal().catch((error: GLWMError) => error);

      expect(thrown.message).toMatch(/invalid url/i);
      expectReportedOnce(thrown.code);
      expect(onError.mock.calls[0]?.[0]).toBe(thrown);
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
    it('a throwing state listener does not prevent onError or the ERROR event', async () => {
      mockState.getBlockNumber.mockRejectedValue(rpcDown());
      createSdk();
      sdk.subscribe((state) => {
        if (state.status === 'error') {
          throw new Error('bug in a state listener');
        }
      });

      await sdk.initialize().catch(() => undefined);

      expectReportedOnce('RPC_ERROR');
    });

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

  describe("'ERROR' event", () => {
    it('fires before onError', async () => {
      mockState.getBlockNumber.mockRejectedValue(rpcDown());
      createSdk();
      const order: string[] = [];
      onError.mockImplementation(() => {
        order.push('onError');
      });
      sdk.on('ERROR', () => order.push('ERROR event'));

      await expect(sdk.initialize()).rejects.toMatchObject({ code: 'RPC_ERROR' });

      expect(order).toEqual(['ERROR event', 'onError']);
    });

    it('a handler subscribed during dispatch does not receive the in-flight error', async () => {
      mockState.getBlockNumber.mockRejectedValue(rpcDown());
      createSdk();
      const lateHandler = jest.fn();
      sdk.on('ERROR', () => {
        sdk.on('ERROR', lateHandler);
      });

      await expect(sdk.initialize()).rejects.toMatchObject({ code: 'RPC_ERROR' });

      expectReportedOnce('RPC_ERROR');
      expect(lateHandler).not.toHaveBeenCalled();
    });

    it('fires when no onError callback is configured', async () => {
      mockState.getBlockNumber.mockRejectedValue(rpcDown());
      sdk = new GLWM(createConfig());
      const handler = jest.fn();
      sdk.on('ERROR', handler);

      const thrown = await sdk.initialize().catch((error: GLWMError) => error);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ type: 'ERROR', error: thrown });
    });

    it('a throwing handler does not stop other handlers, onError, or the error state', async () => {
      mockState.getBlockNumber.mockRejectedValue(rpcDown());
      createSdk();
      const failing = jest.fn(() => {
        throw new Error('bug in an app handler');
      });
      const later = jest.fn();
      sdk.on('ERROR', failing);
      sdk.on('ERROR', later);

      await expect(sdk.initialize()).rejects.toMatchObject({ code: 'RPC_ERROR' });

      expect(failing).toHaveBeenCalledTimes(1);
      expect(later).toHaveBeenCalledTimes(1);
      expectReportedOnce('RPC_ERROR');
      expect(sdk.getState().status).toBe('error');
    });

    it('stops firing after unsubscribe', async () => {
      mockState.getBlockNumber.mockRejectedValue(rpcDown());
      createSdk();
      const handler = jest.fn();
      const unsubscribe = sdk.on('ERROR', handler);
      unsubscribe();

      await expect(sdk.initialize()).rejects.toMatchObject({ code: 'RPC_ERROR' });

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
