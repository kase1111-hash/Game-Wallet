/**
 * @jest-environment jsdom
 */

/**
 * Integration tests for the minting-state invariant:
 *
 *   GLWM is in a minting state ('minting_portal_open' / 'minting_in_progress') only while the
 *   minting portal is open, and the portal opening is what puts it in one.
 *
 * verifyAndPlay() refuses to run while the SDK is in a minting state, so a minting state that
 * outlives the portal blocks the SDK. These tests drive every way the portal can fail to open or
 * close and check the invariant at every state notification, at the CLOSE_MINTING_PORTAL event
 * and in config.mintingPortal.onClose, and that verifyAndPlay() is usable afterwards.
 */

import { GLWM } from '../../src/GLWM';
import type { GLWMConfig, GLWMError, GLWMEvent, GLWMState } from '../../src/types';
import { Logger } from '../../src/utils/Logger';
import { MockEthereumProvider } from '../mocks/ethereum-provider';
import { createMockMetadata } from '../mocks/license-contract';

// Use a mutable container to avoid jest.mock hoisting / TDZ issues
const mockState = {
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
      getBlockNumber: jest.fn().mockResolvedValue(12345678),
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

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Captured before any test installs fake timers, so settle() works with either kind
const realSetTimeout = global.setTimeout;

const WALLET_ADDRESS = '0x1234567890123456789012345678901234567890';
const PORTAL_URL = 'https://mint.example.com';
const TX_HASH = '0xabc123';
const PORTAL_TIMEOUT_MS = 10 * 60 * 1000;
const NO_LICENSE: GLWMState = { status: 'no_license', address: WALLET_ADDRESS };

type Status = GLWMState['status'];

function isMintingStatus(status: Status): boolean {
  return status === 'minting_portal_open' || status === 'minting_in_progress';
}

/** Let pending promise chains run (crosses a real macrotask boundary, also under fake timers) */
function settle(): Promise<void> {
  return new Promise((resolve) => realSetTimeout(resolve, 0));
}

function portalOverlay(): HTMLElement | null {
  return document.getElementById('glwm-portal-overlay');
}

/** The portal is open exactly when its overlay is in the DOM (iframe mode) */
function portalIsOpen(): boolean {
  return portalOverlay() !== null;
}

function postFromPortal(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { origin: PORTAL_URL, data }));
}

const mintStarted = { type: 'MINT_STARTED', payload: { transactionHash: TX_HASH } };
const mintCompleted = {
  type: 'MINT_COMPLETED',
  payload: { success: true, tokenId: '1', transactionHash: TX_HASH },
};

/** Ways the portal closes without the SDK being told to (P3 / P4) */
const portalSideClosePaths: Array<[string, () => void]> = [
  [
    'the close button',
    () => (portalOverlay()?.querySelector('button') as HTMLButtonElement).click(),
  ],
  ['an overlay click', () => portalOverlay()?.click()],
  ['a PORTAL_CLOSED message', () => postFromPortal({ type: 'PORTAL_CLOSED' })],
  ['auto-close after MINT_COMPLETED', () => postFromPortal(mintCompleted)],
];

describe('minting state invariant', () => {
  let sdk: GLWM;

  /**
   * Records every state notification and the state seen by close callbacks, and collects a
   * violation whenever a minting state is observed while the portal is not open.
   */
  interface Probe {
    statuses: Status[];
    violations: string[];
    openEvents: number;
    closeEvents: number;
  }

  function createSdk(overrides: Partial<GLWMConfig> = {}): Probe {
    const probe: Probe = { statuses: [], violations: [], openEvents: 0, closeEvents: 0 };
    const check = (where: string, status: Status): void => {
      if (isMintingStatus(status) && !portalIsOpen()) {
        probe.violations.push(`${where}: '${status}' while the portal is not open`);
      }
    };

    sdk = new GLWM({
      licenseContract: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      chainId: 137,
      rpcProvider: { provider: 'custom', customUrl: 'https://polygon-rpc.com' },
      mintingPortal: {
        url: PORTAL_URL,
        mode: 'iframe',
        onClose: () => check('config.mintingPortal.onClose', sdk.getState().status),
      },
      ...overrides,
    });
    sdk.subscribe((state) => {
      probe.statuses.push(state.status);
      check('state notification', state.status);
    });
    sdk.on('OPEN_MINTING_PORTAL', () => {
      probe.openEvents++;
    });
    sdk.on('CLOSE_MINTING_PORTAL', () => {
      probe.closeEvents++;
      check('CLOSE_MINTING_PORTAL', sdk.getState().status);
    });
    return probe;
  }

  /** Initialized SDK with a connected wallet that does not own a license yet */
  async function connectedWithoutLicense(overrides: Partial<GLWMConfig> = {}): Promise<Probe> {
    const provider = new MockEthereumProvider({
      accounts: [WALLET_ADDRESS],
      chainId: 137,
      isMetaMask: true,
    });
    (window as unknown as Record<string, unknown>).ethereum = provider;
    const probe = createSdk(overrides);
    await sdk.initialize();
    await sdk.connectWallet('metamask');
    mockState.balanceOf.mockResolvedValue(0n);
    return probe;
  }

  /** The license shows up on-chain (the user minted) */
  function licenseMinted(): void {
    mockState.balanceOf.mockResolvedValue(1n);
  }

  /**
   * Start verifyAndPlay() and wait until it has opened the portal. The flow (settling to its
   * result or error) is wrapped so that awaiting this helper does not wait for the flow.
   */
  async function verifyAndPlayUntilPortalOpen(): Promise<{ flow: Promise<unknown> }> {
    const flow = sdk.verifyAndPlay().catch((error: unknown) => error);
    await settle();
    expect(portalIsOpen()).toBe(true);
    return { flow };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    Logger.resetInstance();
    document.body.innerHTML = '';
    localStorage.clear();

    mockState.balanceOf = jest.fn().mockResolvedValue(1n);
    mockState.tokenOfOwnerByIndex = jest.fn().mockResolvedValue(1n);
    mockState.ownerOf = jest.fn().mockResolvedValue(WALLET_ADDRESS);
    mockState.tokenURI = jest.fn().mockResolvedValue('https://metadata.example.com/1');
    mockFetch.mockResolvedValue({ ok: true, json: async () => createMockMetadata() });
  });

  afterEach(async () => {
    await sdk?.dispose();
    jest.useRealTimers();
    delete (window as unknown as Record<string, unknown>).ethereum;
  });

  describe('P1: the portal fails to open', () => {
    it.each<[string, GLWMConfig['mintingPortal']]>([
      ['an unsupported portal mode', { url: PORTAL_URL, mode: 'unsupported' as never }],
      ['a malformed portal URL', { url: 'not a url', mode: 'iframe' }],
    ])('verifyAndPlay() with %s leaves no minting state behind', async (_name, mintingPortal) => {
      const probe = await connectedWithoutLicense({ mintingPortal });

      const first = (await sdk.verifyAndPlay().catch((e: unknown) => e)) as GLWMError;

      expect(first.message).not.toContain('already in progress');
      expect(sdk.getState()).toEqual(NO_LICENSE);
      expect(probe.statuses).not.toContain('minting_portal_open');
      // No OPEN_MINTING_PORTAL event for a portal that never opened
      expect(probe.openEvents).toBe(0);

      // The next attempt runs again (and fails the same way) instead of being blocked
      await expect(sdk.verifyAndPlay()).rejects.toMatchObject({ code: first.code });
      expect(probe.violations).toEqual([]);
    });

    it('openMintingPortal() that throws does not block the next verifyAndPlay()', async () => {
      const probe = await connectedWithoutLicense({
        mintingPortal: { url: PORTAL_URL, mode: 'unsupported' as never },
      });

      await expect(sdk.openMintingPortal()).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });

      expect(sdk.getState().status).not.toBe('minting_portal_open');
      licenseMinted();
      await expect(sdk.verifyAndPlay()).resolves.toMatchObject({ isValid: true });
      expect(probe.violations).toEqual([]);
    });
  });

  describe('P2: the verifyAndPlay() portal timeout', () => {
    it.each([
      ['minting_portal_open', false],
      ['minting_in_progress', true],
    ])('leaves %s after closing the portal at 10 minutes', async (status, started) => {
      jest.useFakeTimers();
      const probe = await connectedWithoutLicense();
      const { flow } = await verifyAndPlayUntilPortalOpen();
      if (started) {
        postFromPortal(mintStarted);
      }
      expect(sdk.getState().status).toBe(status);

      await jest.advanceTimersByTimeAsync(PORTAL_TIMEOUT_MS);

      expect(await flow).toMatchObject({
        code: 'USER_CANCELLED',
        message: expect.stringContaining('timed out'),
      });
      expect(portalIsOpen()).toBe(false);
      expect(sdk.getState()).toEqual(NO_LICENSE);
      licenseMinted();
      await expect(sdk.verifyAndPlay()).resolves.toMatchObject({ isValid: true });
      expect(probe.violations).toEqual([]);
    });
  });

  describe('P3: openMintingPortal(), then the portal closes itself', () => {
    it.each(portalSideClosePaths)('%s leaves the minting state', async (_name, close) => {
      const probe = await connectedWithoutLicense();
      await sdk.openMintingPortal();
      expect(sdk.getState()).toEqual({ status: 'minting_portal_open' });

      close();

      expect(portalIsOpen()).toBe(false);
      expect(sdk.getState()).toEqual(NO_LICENSE);
      licenseMinted();
      await expect(sdk.verifyAndPlay()).resolves.toMatchObject({ isValid: true });
      expect(probe.violations).toEqual([]);
    });
  });

  describe('P4: openMintingPortal(), MINT_STARTED, then the portal closes itself', () => {
    it.each(portalSideClosePaths)('%s leaves minting_in_progress', async (_name, close) => {
      const probe = await connectedWithoutLicense();
      await sdk.openMintingPortal();
      postFromPortal(mintStarted);
      expect(sdk.getState()).toEqual({ status: 'minting_in_progress', transactionHash: TX_HASH });

      close();

      expect(portalIsOpen()).toBe(false);
      expect(sdk.getState()).toEqual(NO_LICENSE);
      licenseMinted();
      await expect(sdk.verifyAndPlay()).resolves.toMatchObject({ isValid: true });
      expect(probe.violations).toEqual([]);
    });
  });

  describe('P5: app callbacks that run when the portal closes', () => {
    it('config.mintingPortal.onClose and CLOSE_MINTING_PORTAL never see a minting state', async () => {
      const seenByOnClose: Status[] = [];
      const probe = await connectedWithoutLicense({
        mintingPortal: {
          url: PORTAL_URL,
          mode: 'iframe',
          onClose: () => seenByOnClose.push(sdk.getState().status),
        },
      });
      const seenByEvent: Status[] = [];
      sdk.on('CLOSE_MINTING_PORTAL', () => seenByEvent.push(sdk.getState().status));
      const { flow } = await verifyAndPlayUntilPortalOpen();
      licenseMinted();

      sdk.closeMintingPortal();

      expect(seenByOnClose).toEqual(['no_license']);
      expect(seenByEvent).toEqual(['no_license']);
      await expect(flow).resolves.toMatchObject({ isValid: true });
      expect(probe.violations).toEqual([]);
    });
  });

  describe('a throwing state listener while the portal closes', () => {
    it('still emits CLOSE_MINTING_PORTAL and calls config.onClose, so verifyAndPlay() goes on', async () => {
      const onClose = jest.fn();
      const probe = await connectedWithoutLicense({
        mintingPortal: { url: PORTAL_URL, mode: 'iframe', onClose },
      });
      const { flow } = await verifyAndPlayUntilPortalOpen();
      let thrown = false;
      sdk.subscribe(() => {
        if (!thrown) {
          thrown = true;
          throw new Error('bug in an app listener');
        }
      });
      licenseMinted();

      expect(() => sdk.closeMintingPortal()).toThrow('bug in an app listener');

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(probe.closeEvents).toBe(1);
      await expect(flow).resolves.toMatchObject({ isValid: true });
      expect(sdk.getState().status).toBe('license_valid');
    });
  });

  describe('P6: openMintingPortal() while the portal is already open', () => {
    it('keeps minting_in_progress and does not announce a second open', async () => {
      const probe = await connectedWithoutLicense();
      await sdk.openMintingPortal();
      postFromPortal(mintStarted);

      await sdk.openMintingPortal();

      expect(sdk.getState()).toEqual({ status: 'minting_in_progress', transactionHash: TX_HASH });
      expect(probe.openEvents).toBe(1);
      expect(document.querySelectorAll('#glwm-portal-overlay')).toHaveLength(1);
      expect(probe.violations).toEqual([]);
    });
  });

  describe('holds through every way the portal closes during verifyAndPlay()', () => {
    const allClosePaths: Array<[string, () => unknown]> = [
      ...portalSideClosePaths,
      ['the 10-minute timeout', () => jest.advanceTimersByTimeAsync(PORTAL_TIMEOUT_MS)],
      ['closeMintingPortal()', () => sdk.closeMintingPortal()],
      ['dispose()', () => sdk.dispose()],
    ];

    describe.each([
      ['minting_portal_open', false],
      ['minting_in_progress', true],
    ])('from %s', (status, started) => {
      it.each(allClosePaths)('%s', async (_name, close) => {
        jest.useFakeTimers();
        const probe = await connectedWithoutLicense();
        const { flow } = await verifyAndPlayUntilPortalOpen();
        if (started) {
          postFromPortal(mintStarted);
        }
        expect(sdk.getState().status).toBe(status);
        licenseMinted();

        await close();
        await flow;

        expect(portalIsOpen()).toBe(false);
        expect(isMintingStatus(sdk.getState().status)).toBe(false);
        expect(probe.statuses).toContain(status);
        expect(probe.closeEvents).toBe(1);
        expect(probe.violations).toEqual([]);
      });
    });
  });

  describe('no duplicate state notifications', () => {
    it('closeMintingPortal() on an open portal notifies the closed state exactly once', async () => {
      await connectedWithoutLicense();
      await sdk.openMintingPortal();
      const seen: GLWMState[] = [];
      sdk.subscribe((state) => seen.push(state));

      sdk.closeMintingPortal();

      expect(seen).toEqual([NO_LICENSE]);
    });

    it('closeMintingPortal() when the portal is already closed does not notify again', async () => {
      await connectedWithoutLicense();
      await sdk.openMintingPortal();
      sdk.closeMintingPortal();
      const seen: GLWMState[] = [];
      sdk.subscribe((state) => seen.push(state));

      sdk.closeMintingPortal();

      expect(seen).toEqual([]);
    });

    it('closing the portal inside verifyAndPlay() notifies no_license once before re-verifying', async () => {
      const probe = await connectedWithoutLicense();
      const { flow } = await verifyAndPlayUntilPortalOpen();
      const fromClose = probe.statuses.length;
      licenseMinted();

      sdk.closeMintingPortal();
      await flow;

      expect(probe.statuses.slice(fromClose, fromClose + 2)).toEqual([
        'no_license',
        'verifying_license',
      ]);
      expect(probe.statuses.slice(fromClose).filter((s) => s === 'no_license')).toHaveLength(1);
    });
  });

  describe('verifyAndPlay() results are unchanged', () => {
    it('MINT_STARTED, MINT_COMPLETED (auto-close), fresh verify: license_valid', async () => {
      const probe = await connectedWithoutLicense();
      const minted = jest.fn();
      sdk.on('MINT_COMPLETED', minted);
      const fromStart = probe.statuses.length;
      const { flow } = await verifyAndPlayUntilPortalOpen();

      postFromPortal(mintStarted);
      licenseMinted();
      postFromPortal(mintCompleted);
      const result = await flow;

      expect(result).toMatchObject({ isValid: true, license: expect.objectContaining({}) });
      expect(minted).toHaveBeenCalledTimes(1);
      expect(sdk.getState().status).toBe('license_valid');
      expect(probe.statuses.slice(fromStart, fromStart + 7)).toEqual([
        'verifying_license',
        'no_license',
        'minting_portal_open',
        'minting_in_progress',
        'no_license',
        'verifying_license',
        'license_valid',
      ]);
      expect(probe.violations).toEqual([]);
    });

    it('user closes the portal without minting: no_license', async () => {
      await connectedWithoutLicense();
      const { flow } = await verifyAndPlayUntilPortalOpen();

      (portalOverlay()?.querySelector('button') as HTMLButtonElement).click();
      const result = await flow;

      expect(result).toMatchObject({ isValid: false, license: null });
      expect(sdk.getState()).toEqual(NO_LICENSE);
    });
  });

  describe('error reporting for an open failure', () => {
    let onError: jest.Mock<void, [GLWMError]>;
    let errorEvents: jest.Mock<void, [Extract<GLWMEvent, { type: 'ERROR' }>]>;

    async function failingPortal(): Promise<void> {
      onError = jest.fn();
      await connectedWithoutLicense({
        onError,
        mintingPortal: { url: PORTAL_URL, mode: 'unsupported' as never },
      });
      errorEvents = jest.fn();
      sdk.on('ERROR', errorEvents);
    }

    function expectReportedOnce(thrown: unknown): void {
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]?.[0]).toBe(thrown);
      expect(errorEvents).toHaveBeenCalledTimes(1);
      expect(errorEvents.mock.calls[0]?.[0]).toEqual({ type: 'ERROR', error: thrown });
    }

    it('openMintingPortal(): onError and ERROR fire exactly once', async () => {
      await failingPortal();

      const thrown = await sdk.openMintingPortal().catch((e: unknown) => e);

      expect(thrown).toMatchObject({ code: 'CONFIGURATION_ERROR' });
      expectReportedOnce(thrown);
    });

    it('verifyAndPlay(): onError and ERROR fire exactly once', async () => {
      await failingPortal();

      const thrown = await sdk.verifyAndPlay().catch((e: unknown) => e);

      expect(thrown).toMatchObject({ code: 'CONFIGURATION_ERROR' });
      expectReportedOnce(thrown);
    });
  });
  describe('more paths from the audit', () => {
    function closeButton(): HTMLButtonElement {
      return portalOverlay()?.querySelector('button') as HTMLButtonElement;
    }

    it.each<[string, (onError: jest.Mock) => Partial<GLWMConfig>, (sdk: GLWM) => void]>([
      [
        'an OPEN_MINTING_PORTAL handler',
        (onError) => ({ onError }),
        (instance) => {
          instance.on('OPEN_MINTING_PORTAL', () => {
            throw new Error('bug in an app handler');
          });
        },
      ],
      [
        'a state listener',
        (onError) => ({ onError }),
        (instance) => {
          instance.subscribe((state) => {
            if (state.status === 'minting_portal_open') {
              throw new Error('bug in an app handler');
            }
          });
        },
      ],
    ])(
      '%s that throws on open is not reported as an open failure, and closing still resets',
      async (_name, config, install) => {
        const onError = jest.fn();
        const probe = await connectedWithoutLicense(config(onError));
        install(sdk);

        await expect(sdk.openMintingPortal()).rejects.toThrow('bug in an app handler');

        // The portal did open, so the state agrees with it, and the SDK reported no error
        expect(portalIsOpen()).toBe(true);
        expect(sdk.getState().status).toBe('minting_portal_open');
        expect(onError).not.toHaveBeenCalled();

        sdk.closeMintingPortal();
        expect(sdk.getState()).toEqual(NO_LICENSE);
        expect(probe.violations).toEqual([]);
      }
    );

    it('two concurrent openMintingPortal() calls (double-click) open one portal', async () => {
      const probe = await connectedWithoutLicense();

      await Promise.all([sdk.openMintingPortal(), sdk.openMintingPortal()]);

      expect(document.querySelectorAll('#glwm-portal-overlay')).toHaveLength(1);
      expect(probe.openEvents).toBe(1);
      expect(probe.statuses.filter((s) => s === 'minting_portal_open')).toHaveLength(1);

      sdk.closeMintingPortal();
      expect(portalOverlay()).toBeNull();

      // No orphaned portal listener is left to move the SDK back into a minting state
      postFromPortal(mintStarted);
      expect(sdk.getState()).toEqual(NO_LICENSE);
      licenseMinted();
      await expect(sdk.verifyAndPlay()).resolves.toMatchObject({ isValid: true });
      expect(probe.violations).toEqual([]);
    });

    it('closeMintingPortal() while the portal is still opening leaves state and portal consistent', async () => {
      const probe = await connectedWithoutLicense();

      const opening = sdk.openMintingPortal();
      sdk.closeMintingPortal();
      await opening;

      expect(isMintingStatus(sdk.getState().status)).toBe(portalIsOpen());
      expect(probe.violations).toEqual([]);
    });

    it('the wallet disconnects while verifyAndPlay() has the portal open', async () => {
      const probe = await connectedWithoutLicense();
      const disconnected = jest.fn();
      sdk.on('WALLET_DISCONNECTED', disconnected);
      const { flow } = await verifyAndPlayUntilPortalOpen();

      const wallet = (window as unknown as { ethereum: MockEthereumProvider }).ethereum;
      wallet.emitEvent('accountsChanged', []);
      closeButton().click();

      await expect(flow).resolves.toMatchObject({ code: 'WALLET_DISCONNECTED' });
      expect(disconnected).toHaveBeenCalledTimes(1);
      expect(sdk.getState()).toEqual({ status: 'awaiting_wallet' });
      expect(probe.violations).toEqual([]);
    });

    it('a throwing config.mintingPortal.onClose: the state still resets and CLOSE fires once', async () => {
      const probe = await connectedWithoutLicense({
        mintingPortal: {
          url: PORTAL_URL,
          mode: 'iframe',
          onClose: () => {
            throw new Error('bug in config.onClose');
          },
        },
      });
      await sdk.openMintingPortal();

      expect(() => sdk.closeMintingPortal()).toThrow('bug in config.onClose');

      expect(sdk.getState()).toEqual(NO_LICENSE);
      expect(probe.closeEvents).toBe(1);
      expect(probe.violations).toEqual([]);
    });

    it('a throwing config.mintingPortal.onClose does not stall verifyAndPlay()', async () => {
      const probe = await connectedWithoutLicense({
        mintingPortal: {
          url: PORTAL_URL,
          mode: 'iframe',
          onClose: () => {
            throw new Error('bug in config.onClose');
          },
        },
      });
      const { flow } = await verifyAndPlayUntilPortalOpen();
      licenseMinted();

      expect(() => sdk.closeMintingPortal()).toThrow('bug in config.onClose');

      await expect(flow).resolves.toMatchObject({ isValid: true });
      expect(sdk.getState().status).toBe('license_valid');
      expect(probe.violations).toEqual([]);
    });

    it('a throwing CLOSE_MINTING_PORTAL handler: the state resets and config.onClose still runs', async () => {
      const configOnClose = jest.fn();
      const probe = await connectedWithoutLicense({
        mintingPortal: { url: PORTAL_URL, mode: 'iframe', onClose: configOnClose },
      });
      sdk.on('CLOSE_MINTING_PORTAL', () => {
        throw new Error('bug in a CLOSE handler');
      });
      await sdk.openMintingPortal();

      expect(() => sdk.closeMintingPortal()).toThrow('bug in a CLOSE handler');

      expect(sdk.getState()).toEqual(NO_LICENSE);
      expect(configOnClose).toHaveBeenCalledTimes(1);
      expect(probe.violations).toEqual([]);
    });

    it.each<[string, () => void]>([
      ['the close button', () => closeButton().click()],
      ['closeMintingPortal()', () => sdk.closeMintingPortal()],
    ])(
      'a CLOSE_MINTING_PORTAL handler that reopens the portal (%s) keeps minting_portal_open',
      async (_name, close) => {
        const probe = await connectedWithoutLicense();
        let reopened = false;
        sdk.on('CLOSE_MINTING_PORTAL', () => {
          if (!reopened) {
            reopened = true;
            void sdk.openMintingPortal();
          }
        });
        await sdk.openMintingPortal();

        close();
        await settle();

        expect(portalIsOpen()).toBe(true);
        expect(sdk.getState().status).toBe('minting_portal_open');
        expect(probe.violations).toEqual([]);
      }
    );

    it('with no wallet connected, a close leaves the minting state for awaiting_wallet', async () => {
      const probe = createSdk();
      await sdk.initialize();
      await sdk.openMintingPortal();
      expect(sdk.getState().status).toBe('minting_portal_open');

      closeButton().click();

      expect(sdk.getState()).toEqual({ status: 'awaiting_wallet' });
      expect(probe.violations).toEqual([]);
    });

    it('with no wallet connected, a failed open leaves awaiting_wallet unchanged', async () => {
      const probe = createSdk({
        mintingPortal: { url: PORTAL_URL, mode: 'unsupported' as never },
      });
      await sdk.initialize();

      await expect(sdk.openMintingPortal()).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });

      expect(sdk.getState()).toEqual({ status: 'awaiting_wallet' });
      expect(probe.openEvents).toBe(0);
    });

    it('autoCloseOnMint: false keeps minting_in_progress while the portal stays open', async () => {
      const probe = await connectedWithoutLicense({
        mintingPortal: { url: PORTAL_URL, mode: 'iframe', autoCloseOnMint: false },
      });
      await sdk.openMintingPortal();
      postFromPortal(mintStarted);
      postFromPortal(mintCompleted);

      expect(portalIsOpen()).toBe(true);
      expect(sdk.getState()).toEqual({ status: 'minting_in_progress', transactionHash: TX_HASH });
      await expect(sdk.verifyAndPlay()).rejects.toMatchObject({
        message: expect.stringContaining('already in progress'),
      });

      closeButton().click();
      expect(sdk.getState()).toEqual(NO_LICENSE);
      expect(probe.violations).toEqual([]);
    });

    it('dispose() with the portal open notifies awaiting_wallet exactly once', async () => {
      await connectedWithoutLicense();
      await sdk.openMintingPortal();
      const seen: GLWMState[] = [];
      sdk.subscribe((state) => seen.push(state));

      await sdk.dispose();

      expect(seen).toEqual([{ status: 'awaiting_wallet' }]);
      expect(portalOverlay()).toBeNull();
    });

    it('closeMintingPortal() with no portal open emits no state and no CLOSE event', async () => {
      const probe = await connectedWithoutLicense();
      const before = { statuses: probe.statuses.length, closeEvents: probe.closeEvents };

      sdk.closeMintingPortal();

      expect(probe.statuses).toHaveLength(before.statuses);
      expect(probe.closeEvents).toBe(before.closeEvents);
    });

    it('a close keeps license_valid when the license was verified while the portal was open', async () => {
      const probe = await connectedWithoutLicense();
      await sdk.openMintingPortal();
      licenseMinted();
      await sdk.verifyLicenseFresh();
      expect(sdk.getState().status).toBe('license_valid');

      closeButton().click();

      expect(sdk.getState().status).toBe('license_valid');
      expect(probe.violations).toEqual([]);
    });
  });
});
