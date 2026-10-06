/**
 * @jest-environment jsdom
 */

/**
 * Integration tests for re-initialization and repeated wallet connection
 *
 * initialize() can be called again (it is the documented way to retry after an
 * error). Components from the previous initialize() must stop listening:
 * otherwise their wallet listeners and portal callbacks keep firing into the SDK.
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
};

jest.mock('ethers', () => {
  const contractProxy = {
    getFunction: (name: string) => (name === 'balanceOf' ? mockState.balanceOf : jest.fn()),
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
const WALLET_EVENTS = ['accountsChanged', 'chainChanged', 'disconnect'] as const;

function createConfig(overrides: Partial<GLWMConfig> = {}): GLWMConfig {
  return {
    licenseContract: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
    chainId: 137,
    rpcProvider: { provider: 'custom', customUrl: 'https://polygon-rpc.com', retryAttempts: 1 },
    mintingPortal: { url: PORTAL_URL, mode: 'iframe' },
    ...overrides,
  };
}

function setupMockWallet(): MockEthereumProvider {
  const provider = new MockEthereumProvider({
    accounts: [WALLET_ADDRESS],
    chainId: 137,
    isMetaMask: true,
  });
  (window as unknown as Record<string, unknown>).ethereum = provider;
  return provider;
}

function listenerCounts(wallet: MockEthereumProvider): number[] {
  return WALLET_EVENTS.map((event) => wallet.getListenerCount(event));
}

describe('re-initialization and repeated connection', () => {
  let sdk: GLWM;
  let onError: jest.Mock<void, [GLWMError]>;
  let wallet: MockEthereumProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    Logger.resetInstance();
    document.body.innerHTML = '';
    mockState.getBlockNumber.mockReset().mockResolvedValue(12345678);
    mockState.balanceOf = jest.fn().mockResolvedValue(0n);
    mockFetch.mockResolvedValue({ ok: true, json: async () => createMockMetadata() });

    wallet = setupMockWallet();
    onError = jest.fn();
    sdk = new GLWM(createConfig({ onError }));
  });

  afterEach(async () => {
    await sdk.dispose();
    delete (window as unknown as Record<string, unknown>).ethereum;
  });

  describe('initialize() while a wallet is connected', () => {
    it('removes the previous connector’s wallet listeners', async () => {
      await sdk.initialize();
      await sdk.connectWallet('metamask');
      expect(listenerCounts(wallet)).toEqual([1, 1, 1]);

      await sdk.initialize();

      expect(listenerCounts(wallet)).toEqual([0, 0, 0]);
    });

    it('reports a later chain mismatch once after reconnecting', async () => {
      await sdk.initialize();
      await sdk.connectWallet('metamask');
      await sdk.initialize();
      await sdk.connectWallet('metamask');
      expect(listenerCounts(wallet)).toEqual([1, 1, 1]);

      wallet.emitEvent('chainChanged', '0x1');

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'CHAIN_MISMATCH' }));
    });

    it('stops reacting to the old session and reports the disconnect once', async () => {
      await sdk.initialize();
      await sdk.connectWallet('metamask');
      const disconnected = jest.fn();
      const connected = jest.fn();
      sdk.on('WALLET_DISCONNECTED', disconnected);
      sdk.on('WALLET_CONNECTED', connected);

      await sdk.initialize();
      wallet.emitEvent('chainChanged', '0x1');
      wallet.emitEvent('accountsChanged', ['0x9999999999999999999999999999999999999999']);

      expect(disconnected).toHaveBeenCalledTimes(1);
      expect(connected).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(sdk.getWalletSession().isConnected).toBe(false);
    });
  });

  describe('initialize() while the minting portal is open', () => {
    it('closes the previous portal and ignores its messages', async () => {
      await sdk.initialize();
      await sdk.connectWallet('metamask');
      await sdk.openMintingPortal();
      const mintStarted = jest.fn();
      sdk.on('MINT_STARTED', mintStarted);

      await sdk.initialize();

      expect(document.getElementById('glwm-portal-overlay')).toBeNull();
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: PORTAL_URL,
          data: { type: 'MINT_STARTED', payload: { transactionHash: '0xabc' } },
        })
      );
      expect(mintStarted).not.toHaveBeenCalled();
      expect(sdk.getState().status).toBe('awaiting_wallet');
    });
  });

  describe('connectWallet() while already connected', () => {
    it('does not attach a second set of wallet listeners', async () => {
      await sdk.initialize();
      await sdk.connectWallet('metamask');
      await sdk.connectWallet('metamask');

      expect(listenerCounts(wallet)).toEqual([1, 1, 1]);

      wallet.emitEvent('chainChanged', '0x1');
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('removes listeners from the provider they were attached to, even if window.ethereum changes', async () => {
      await sdk.initialize();
      await sdk.connectWallet('metamask');

      // e.g. the extension re-injects its provider object
      const replacement = setupMockWallet();
      await sdk.disconnectWallet();

      expect(listenerCounts(wallet)).toEqual([0, 0, 0]);
      expect(listenerCounts(replacement)).toEqual([0, 0, 0]);
    });
  });

  it('initialize() can still be retried after a failure (documented recovery)', async () => {
    mockState.getBlockNumber.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    await expect(sdk.initialize()).rejects.toMatchObject({ code: 'RPC_ERROR' });

    await sdk.initialize();
    await sdk.connectWallet('metamask');

    expect(sdk.getWalletSession().isConnected).toBe(true);
    expect(listenerCounts(wallet)).toEqual([1, 1, 1]);
  });
});
