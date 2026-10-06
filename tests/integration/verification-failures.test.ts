/**
 * @jest-environment jsdom
 */

/**
 * Integration tests: a failure while verifying a license is an error, never a license verdict.
 *
 * LicenseVerifier used to turn a failed contract read (balanceOf, tokenOfOwnerByIndex, tokenURI)
 * into { isValid: false, reason: 'verification_failed' } (or 'contract_paused'). GLWM treated that
 * like "no license": it did not report it, cached it for the cache TTL, moved to 'no_license', and
 * verifyAndPlay() opened the minting portal to a user who may already own a license. A failed
 * read is now thrown as a GLWMError, so it goes through the SDK's error paths like any other
 * error. Only genuine verdicts (valid, no_license_found, license_expired) are results.
 */

import { GLWM } from '../../src/GLWM';
import { LicenseVerifier } from '../../src/license';
import type {
  GLWMConfig,
  GLWMError,
  GLWMEvent,
  GLWMState,
  LicenseVerificationResult,
} from '../../src/types';
import { Logger } from '../../src/utils/Logger';
import { MockEthereumProvider } from '../mocks/ethereum-provider';
import { createMockMetadata } from '../mocks/license-contract';

// Use a mutable container to avoid jest.mock hoisting / TDZ issues
const mockState = {
  getBlockNumber: jest.fn(),
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
const OTHER_ADDRESS = '0x9876543210987654321098765432109876543210';
const PORTAL_URL = 'https://mint.example.com';
const STORAGE_KEY = 'glwm-test';

type RpcCall = keyof typeof mockState;

/** Every RPC call verifyLicense() makes (the owner is the address checked, so no ownerOf) */
const VERIFICATION_CALLS: RpcCall[] = [
  'getBlockNumber',
  'balanceOf',
  'tokenOfOwnerByIndex',
  'tokenURI',
];

/** The verification cache entry for an address, as stored in localStorage */
function cachedVerification(address = WALLET_ADDRESS): string | null {
  return localStorage.getItem(`${STORAGE_KEY}:verification:${address.toLowerCase()}`);
}

const rpcDown = (): Error => new Error('connect ECONNREFUSED 127.0.0.1:8545');
const pausedRevert = (): Error => new Error('execution reverted: "Pausable: paused"');

/** The wallet owns a valid license and every RPC call succeeds */
function licenseOwned(): void {
  mockState.getBlockNumber.mockReset().mockResolvedValue(12345678);
  mockState.balanceOf.mockReset().mockResolvedValue(1n);
  mockState.tokenOfOwnerByIndex.mockReset().mockResolvedValue(1n);
  mockState.ownerOf.mockReset().mockResolvedValue(WALLET_ADDRESS);
  mockState.tokenURI.mockReset().mockResolvedValue('https://metadata.example.com/1');
}

function failCall(call: RpcCall, error: Error): void {
  mockState[call].mockRejectedValue(error);
}

function portalOverlay(): HTMLElement | null {
  return document.getElementById('glwm-portal-overlay');
}

function setupMockWallet(): void {
  (window as unknown as Record<string, unknown>).ethereum = new MockEthereumProvider({
    accounts: [WALLET_ADDRESS],
    chainId: 137,
    isMetaMask: true,
  });
}

describe('verification failures are errors, not license verdicts', () => {
  let sdk: GLWM;
  let onError: jest.Mock<void, [GLWMError]>;
  let errorEvents: jest.Mock<void, [Extract<GLWMEvent, { type: 'ERROR' }>]>;
  let onLicenseVerified: jest.Mock<void, [LicenseVerificationResult]>;
  let licenseVerifiedEvents: jest.Mock;

  interface Probe {
    /** Every state notification */
    statuses: Array<GLWMState['status']>;
    /** The SDK state at each onError call */
    statusAtError: Array<GLWMState['status']>;
    /** OPEN_MINTING_PORTAL events */
    portalOpens: number;
  }

  function createSdk(overrides: Partial<GLWMConfig> = {}): Probe {
    const probe: Probe = { statuses: [], statusAtError: [], portalOpens: 0 };
    onError = jest.fn((_error: GLWMError) => {
      probe.statusAtError.push(sdk.getState().status);
    });
    errorEvents = jest.fn();
    onLicenseVerified = jest.fn();
    licenseVerifiedEvents = jest.fn();

    sdk = new GLWM({
      licenseContract: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      chainId: 137,
      // Fail fast: retry/backoff is covered by the RPCProvider unit tests
      rpcProvider: { provider: 'custom', customUrl: 'https://polygon-rpc.com', retryAttempts: 1 },
      mintingPortal: { url: PORTAL_URL, mode: 'iframe' },
      cacheConfig: { enabled: true, ttlSeconds: 300, storageKey: STORAGE_KEY },
      onError,
      onLicenseVerified,
      ...overrides,
    });
    sdk.on('ERROR', errorEvents);
    sdk.on('LICENSE_VERIFIED', licenseVerifiedEvents);
    sdk.on('OPEN_MINTING_PORTAL', () => {
      probe.portalOpens++;
    });
    sdk.subscribe((state) => probe.statuses.push(state.status));
    return probe;
  }

  /** Initialized SDK with a connected wallet */
  async function connected(overrides: Partial<GLWMConfig> = {}): Promise<Probe> {
    setupMockWallet();
    const probe = createSdk(overrides);
    await sdk.initialize();
    await sdk.connectWallet('metamask');
    return probe;
  }

  /** onError and the ERROR event each fired exactly once, with the error the caller got */
  function expectReportedOnce(thrown: unknown, code: GLWMError['code']): void {
    expect(thrown).toMatchObject({ code });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBe(thrown);
    expect(errorEvents).toHaveBeenCalledTimes(1);
    expect(errorEvents.mock.calls[0]?.[0]).toEqual({ type: 'ERROR', error: thrown });
    expect(errorEvents.mock.calls[0]?.[0].error).toBe(thrown);
  }

  function expectNoVerdictAnnounced(): void {
    expect(onLicenseVerified).not.toHaveBeenCalled();
    expect(licenseVerifiedEvents).not.toHaveBeenCalled();
  }

  /**
   * Start verifyAndPlay() for a wallet without a license and wait until the portal is open.
   * The flow (settling to its result or its error) is wrapped so that awaiting this helper does
   * not wait for the flow.
   */
  async function verifyAndPlayUntilPortalOpen(): Promise<{ flow: Promise<unknown> }> {
    mockState.balanceOf.mockResolvedValueOnce(0n);
    const opened = nextPortalOpen();
    const flow = sdk.verifyAndPlay().catch((error: unknown) => error);
    await opened;
    return { flow };
  }

  /**
   * Close the portal as soon as it opens, for tests where it must not open: the flow then
   * finishes (and the test fails) instead of waiting for a close that never comes
   */
  function closePortalWhenOpened(): void {
    sdk.on('OPEN_MINTING_PORTAL', () => sdk.closeMintingPortal());
  }

  /** Resolves on the next OPEN_MINTING_PORTAL */
  function nextPortalOpen(): Promise<void> {
    return new Promise<void>((resolve) => {
      const off = sdk.on('OPEN_MINTING_PORTAL', () => {
        off();
        resolve();
      });
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    Logger.resetInstance();
    document.body.innerHTML = '';
    localStorage.clear();
    licenseOwned();
    mockFetch.mockResolvedValue({ ok: true, json: async () => createMockMetadata() });
  });

  afterEach(async () => {
    await sdk?.dispose();
    delete (window as unknown as Record<string, unknown>).ethereum;
  });

  describe('RPC failure on any verification call', () => {
    it.each(VERIFICATION_CALLS)(
      'verifyLicense(): %s fails -> RPC_ERROR, reported once, not cached, never no_license',
      async (call) => {
        const probe = await connected();
        const cause = rpcDown();
        failCall(call, cause);

        const thrown = (await sdk.verifyLicense().catch((e: unknown) => e)) as GLWMError;

        expectReportedOnce(thrown, 'RPC_ERROR');
        expect(thrown.recoverable).toBe(true);
        expect(thrown.message).toContain('ECONNREFUSED');
        // A JSON-safe summary of the underlying error (raw errors can hold BigInt values)
        expect(thrown.details).toEqual({ name: 'Error', message: cause.message });
        expect(probe.statusAtError).toEqual(['error']);
        expect(sdk.getState()).toEqual({ status: 'error', error: thrown });
        expect(probe.statuses).not.toContain('no_license');
        expect(cachedVerification()).toBeNull();
        expectNoVerdictAnnounced();
      }
    );

    it.each(VERIFICATION_CALLS)(
      'verifyLicense(): a failed %s is not cached, so the next verification reads the chain',
      async (call) => {
        await connected();
        failCall(call, rpcDown());
        await sdk.verifyLicense().catch(() => undefined);

        // The RPC recovers; initialize() is the documented way out of the error state
        licenseOwned();
        await sdk.initialize();
        await sdk.connectWallet('metamask');
        const result = await sdk.verifyLicense();

        expect(result.isValid).toBe(true);
        expect(mockState.balanceOf).toHaveBeenCalled();
        expect(sdk.getState().status).toBe('license_valid');
      }
    );

    it.each(VERIFICATION_CALLS)(
      'verifyAndPlay(): %s fails on the first verification -> rejects, the portal never opens',
      async (call) => {
        setupMockWallet();
        const probe = createSdk();
        closePortalWhenOpened();
        await sdk.initialize();
        const cause = rpcDown();
        failCall(call, cause);

        const thrown = (await sdk.verifyAndPlay().catch((e: unknown) => e)) as GLWMError;

        expectReportedOnce(thrown, 'RPC_ERROR');
        expect(thrown.details).toEqual({ name: 'Error', message: cause.message });
        expect(probe.portalOpens).toBe(0);
        expect(portalOverlay()).toBeNull();
        expect(probe.statuses).not.toContain('no_license');
        expect(probe.statuses).not.toContain('minting_portal_open');
        expect(sdk.getState()).toEqual({ status: 'error', error: thrown });
        expect(cachedVerification()).toBeNull();
        expectNoVerdictAnnounced();
      }
    );

    it.each(VERIFICATION_CALLS)(
      'verifyAndPlay(): %s fails on the re-verification after the portal closes -> rejects',
      async (call) => {
        const probe = await connected();
        const { flow } = await verifyAndPlayUntilPortalOpen();
        expect(cachedVerification()).not.toBeNull(); // no_license_found is a verdict: cached

        // The user minted, but the re-verification cannot read the chain
        failCall(call, rpcDown());
        const fromClose = probe.statuses.length;
        sdk.closeMintingPortal();
        const thrown = (await flow) as GLWMError;

        expectReportedOnce(thrown, 'RPC_ERROR');
        expect(probe.statusAtError).toEqual(['error']);
        // The close leaves the minting state (to no_license, from the first verdict); the failed
        // re-verification then ends in 'error', not in another no_license verdict
        expect(probe.statuses.slice(fromClose)).toEqual([
          'no_license',
          'verifying_license',
          'error',
        ]);
        expect(sdk.getState()).toEqual({ status: 'error', error: thrown });
        // verifyLicenseFresh() dropped the no_license_found verdict; the failure is not cached
        expect(cachedVerification()).toBeNull();
        expect(probe.portalOpens).toBe(1);

        // Once the RPC recovers, the minted license is found: no second mint is offered
        licenseOwned();
        await sdk.initialize();
        const result = await sdk.verifyAndPlay();
        expect(result.isValid).toBe(true);
        expect(probe.portalOpens).toBe(1);
      }
    );
  });

  describe("a paused contract (no verdict, and minting can't work)", () => {
    it('verifyLicense(): CONTRACT_ERROR, reported once, not cached, never no_license', async () => {
      const probe = await connected();
      failCall('balanceOf', pausedRevert());

      const thrown = (await sdk.verifyLicense().catch((e: unknown) => e)) as GLWMError;

      expectReportedOnce(thrown, 'CONTRACT_ERROR');
      expect(thrown.message).toMatch(/paused/);
      expect(thrown.recoverable).toBe(true);
      expect(thrown.details).toMatchObject({ code: 'RPC_ERROR' }); // the failed RPC call
      expect(sdk.getState()).toEqual({ status: 'error', error: thrown });
      expect(probe.statuses).not.toContain('no_license');
      expect(cachedVerification()).toBeNull();
      expectNoVerdictAnnounced();
    });

    it('verifyAndPlay(): rejects without opening the minting portal', async () => {
      setupMockWallet();
      const probe = createSdk();
      closePortalWhenOpened();
      await sdk.initialize();
      failCall('balanceOf', pausedRevert());

      const thrown = await sdk.verifyAndPlay().catch((e: unknown) => e);

      expectReportedOnce(thrown, 'CONTRACT_ERROR');
      expect(probe.portalOpens).toBe(0);
      expect(portalOverlay()).toBeNull();
      expect(cachedVerification()).toBeNull();
    });

    it('verifyAndPlay(): the contract is paused by the re-verification -> rejects', async () => {
      const probe = await connected();
      const { flow } = await verifyAndPlayUntilPortalOpen();

      failCall('tokenURI', pausedRevert());
      sdk.closeMintingPortal();
      const thrown = await flow;

      expectReportedOnce(thrown, 'CONTRACT_ERROR');
      expect(sdk.getState().status).toBe('error');
      expect(cachedVerification()).toBeNull();
      expect(probe.portalOpens).toBe(1);
    });

    it('checkLicenseForAddress(): CONTRACT_ERROR without changing the state', async () => {
      const probe = await connected();
      probe.statuses.length = 0;
      failCall('balanceOf', pausedRevert());

      const thrown = await sdk.checkLicenseForAddress(OTHER_ADDRESS).catch((e: unknown) => e);

      expectReportedOnce(thrown, 'CONTRACT_ERROR');
      expect(probe.statuses).toEqual([]);
      expect(cachedVerification(OTHER_ADDRESS)).toBeNull();
    });

    it.each<[string, RpcCall, () => Promise<unknown>]>([
      ['getAllLicenses()', 'balanceOf', () => sdk.getAllLicenses()],
      ['getLicenseDetails()', 'ownerOf', () => sdk.getLicenseDetails('1')],
    ])(
      '%s: %s reverts as paused -> CONTRACT_ERROR without changing the state',
      async (_name, call, read) => {
        const probe = await connected();
        probe.statuses.length = 0;
        failCall(call, pausedRevert());

        const thrown = await read().catch((e: unknown) => e);

        expectReportedOnce(thrown, 'CONTRACT_ERROR');
        expect(probe.statuses).toEqual([]);
      }
    );
  });

  describe('read-only methods report RPC failures without changing the state', () => {
    it.each(VERIFICATION_CALLS)(
      'checkLicenseForAddress(): %s fails -> RPC_ERROR; state and cache untouched',
      async (call) => {
        const probe = await connected();
        await sdk.verifyLicense(); // license_valid, and a cached verdict for the wallet
        const cachedBefore = cachedVerification();
        probe.statuses.length = 0;
        const cause = rpcDown();
        failCall(call, cause);

        const thrown = (await sdk
          .checkLicenseForAddress(OTHER_ADDRESS)
          .catch((e: unknown) => e)) as GLWMError;

        expectReportedOnce(thrown, 'RPC_ERROR');
        expect(thrown.details).toEqual({ name: 'Error', message: cause.message });
        expect(probe.statuses).toEqual([]);
        expect(sdk.getState().status).toBe('license_valid');
        expect(cachedVerification()).toBe(cachedBefore);
        expect(cachedVerification(OTHER_ADDRESS)).toBeNull();
        // Not a verdict about the connected wallet either
        expect(onLicenseVerified).toHaveBeenCalledTimes(1);
      }
    );

    it.each<[string, RpcCall, () => Promise<unknown>]>([
      ['getAllLicenses()', 'balanceOf', () => sdk.getAllLicenses()],
      ['getAllLicenses()', 'tokenOfOwnerByIndex', () => sdk.getAllLicenses()],
      ['getAllLicenses()', 'tokenURI', () => sdk.getAllLicenses()],
      ['getLicenseDetails()', 'ownerOf', () => sdk.getLicenseDetails('1')],
      ['getLicenseDetails()', 'tokenURI', () => sdk.getLicenseDetails('1')],
    ])('%s: %s fails -> RPC_ERROR; state untouched', async (_name, call, read) => {
      const probe = await connected();
      probe.statuses.length = 0;
      const cause = rpcDown();
      failCall(call, cause);

      const thrown = (await read().catch((e: unknown) => e)) as GLWMError;

      expectReportedOnce(thrown, 'RPC_ERROR');
      expect(thrown.details).toEqual({ name: 'Error', message: cause.message });
      expect(probe.statuses).toEqual([]);
    });
  });

  describe('genuine verdicts are still results', () => {
    it('no_license_found: a result, cached, no_license; verifyAndPlay() opens the portal', async () => {
      const probe = await connected();
      mockState.balanceOf.mockResolvedValue(0n);

      const result = await sdk.verifyLicense();

      expect(result).toMatchObject({ isValid: false, reason: 'no_license_found' });
      expect(sdk.getState()).toEqual({ status: 'no_license', address: WALLET_ADDRESS });
      expect(cachedVerification()).not.toBeNull();
      expect(licenseVerifiedEvents).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();

      const opened = nextPortalOpen();
      const flow = sdk.verifyAndPlay();
      await opened;
      expect(probe.portalOpens).toBe(1);
      sdk.closeMintingPortal();
      await expect(flow).resolves.toMatchObject({ isValid: false, reason: 'no_license_found' });
      expect(errorEvents).not.toHaveBeenCalled();
    });

    it('license_expired: a result, cached; verifyAndPlay() opens the portal', async () => {
      const probe = await connected();
      const anHourAgo = Math.floor(Date.now() / 1000) - 3600;
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () =>
          createMockMetadata({ attributes: [{ trait_type: 'expires_at', value: anHourAgo }] }),
      });

      const opened = nextPortalOpen();
      const flow = sdk.verifyAndPlay();
      await opened;

      expect(probe.portalOpens).toBe(1);
      expect(cachedVerification()).not.toBeNull();
      sdk.closeMintingPortal();
      await expect(flow).resolves.toMatchObject({ isValid: false, reason: 'license_expired' });
      expect(onError).not.toHaveBeenCalled();
    });

    it('a metadata fetch failure is not a verification failure (default metadata)', async () => {
      await connected();
      mockFetch.mockRejectedValue(new Error('IPFS gateway down'));

      const result = await sdk.verifyLicense();

      expect(result.isValid).toBe(true);
      expect(result.license?.metadata.name).toBe('Game License');
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('results cached by an earlier SDK version', () => {
    it.each(['verification_failed', 'contract_paused'])(
      "a cached '%s' result is not reused as a verdict",
      async (reason) => {
        // Earlier versions cached failures as results, in localStorage, for the cache TTL
        localStorage.setItem(
          `${STORAGE_KEY}:verification:${WALLET_ADDRESS.toLowerCase()}`,
          JSON.stringify({
            data: { isValid: false, license: null, checkedAt: Date.now(), blockNumber: 1, reason },
            expiresAt: Date.now() + 300_000,
          })
        );
        setupMockWallet();
        const probe = createSdk();
        closePortalWhenOpened();
        await sdk.initialize();

        const result = await sdk.verifyAndPlay();

        expect(result.isValid).toBe(true);
        expect(mockState.balanceOf).toHaveBeenCalled();
        expect(probe.portalOpens).toBe(0);
        expect(probe.statuses).not.toContain('no_license');
        // Replaced by the fresh verdict
        expect(JSON.parse(cachedVerification() ?? '{}')).toMatchObject({
          data: { isValid: true },
        });
      }
    );
  });
  describe('error details and recovery hints', () => {
    it('details are JSON-safe: an ethers CALL_EXCEPTION carries BigInt call arguments', async () => {
      await connected();
      const revert = Object.assign(new Error('execution reverted (unknown custom error)'), {
        code: 'CALL_EXCEPTION',
        shortMessage: 'execution reverted (unknown custom error)',
        invocation: { method: 'tokenURI', args: [1n] },
      });
      failCall('tokenURI', revert);
      let logged = '';
      onError.mockImplementation((error) => {
        logged = JSON.stringify(error); // what an app's error logger typically does
      });

      const thrown = (await sdk.verifyLicense().catch((e: unknown) => e)) as GLWMError;

      expect(thrown).toMatchObject({
        code: 'RPC_ERROR',
        details: {
          name: 'Error',
          code: 'CALL_EXCEPTION',
          shortMessage: 'execution reverted (unknown custom error)',
        },
      });
      expect(JSON.parse(logged)).toMatchObject({ code: 'RPC_ERROR' });
    });

    it('an RPC failure while verifying suggests what to do', async () => {
      await connected();
      failCall('balanceOf', rpcDown());

      const thrown = (await sdk.verifyLicense().catch((e: unknown) => e)) as GLWMError;

      expect(thrown.suggestedAction).toEqual(expect.stringContaining('Try again'));
    });
  });

  describe('any verifier result that is not a verdict', () => {
    const notAVerdict: Array<[string, Partial<LicenseVerificationResult>]> = [
      ["the deprecated 'verification_failed' reason", { reason: 'verification_failed' }],
      ["the 'wrong_chain' reason", { reason: 'wrong_chain' }],
      ['no reason', {}],
    ];

    function verifierReturns(extra: Partial<LicenseVerificationResult>): jest.SpyInstance {
      return jest.spyOn(LicenseVerifier.prototype, 'verifyLicense').mockResolvedValue({
        isValid: false,
        license: null,
        checkedAt: Date.now(),
        blockNumber: 12345678,
        ...extra,
      });
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it.each(notAVerdict)(
      'verifyLicense(): %s -> VERIFICATION_FAILED, reported once, not cached, never no_license',
      async (_name, extra) => {
        const probe = await connected();
        verifierReturns(extra);

        const thrown = (await sdk.verifyLicense().catch((e: unknown) => e)) as GLWMError;

        expectReportedOnce(thrown, 'VERIFICATION_FAILED');
        expect(probe.statusAtError).toEqual(['error']);
        expect(probe.statuses).not.toContain('no_license');
        expect(cachedVerification()).toBeNull();
        expectNoVerdictAnnounced();
      }
    );

    it.each(notAVerdict)(
      'verifyAndPlay(): %s -> rejects, the portal never opens',
      async (_name, extra) => {
        setupMockWallet();
        const probe = createSdk();
        closePortalWhenOpened();
        await sdk.initialize();
        verifierReturns(extra);

        const thrown = (await sdk.verifyAndPlay().catch((e: unknown) => e)) as GLWMError;

        expectReportedOnce(thrown, 'VERIFICATION_FAILED');
        expect(probe.portalOpens).toBe(0);
        expect(portalOverlay()).toBeNull();
      }
    );

    it.each(notAVerdict)(
      'checkLicenseForAddress(): %s -> VERIFICATION_FAILED without changing the state',
      async (_name, extra) => {
        const probe = await connected();
        probe.statuses.length = 0;
        verifierReturns(extra);

        const thrown = await sdk.checkLicenseForAddress(OTHER_ADDRESS).catch((e: unknown) => e);

        expectReportedOnce(thrown, 'VERIFICATION_FAILED');
        expect(probe.statuses).toEqual([]);
        expect(cachedVerification(OTHER_ADDRESS)).toBeNull();
      }
    );
  });

  describe('verifyLicenseFresh()', () => {
    it.each(VERIFICATION_CALLS)(
      '%s fails -> the cached valid verdict is dropped, not replaced by the failure',
      async (call) => {
        const probe = await connected();
        await sdk.verifyLicense(); // license_valid, cached
        expect(cachedVerification()).not.toBeNull();
        probe.statuses.length = 0;
        failCall(call, rpcDown());

        const thrown = await sdk.verifyLicenseFresh().catch((e: unknown) => e);

        expect(thrown).toMatchObject({ code: 'RPC_ERROR' });
        expect(onError).toHaveBeenCalledTimes(1);
        expect(probe.statuses).toEqual(['verifying_license', 'error']);
        expect(cachedVerification()).toBeNull();
      }
    );
  });

  describe('genuine verdicts through the read-only methods', () => {
    it.each<[string, () => void, Partial<LicenseVerificationResult>]>([
      ['valid', () => undefined, { isValid: true }],
      [
        'no_license_found',
        () => mockState.balanceOf.mockResolvedValue(0n),
        { isValid: false, reason: 'no_license_found' },
      ],
    ])(
      'checkLicenseForAddress(): a %s verdict is a result, without a state change',
      async (_name, setup, expected) => {
        const probe = await connected();
        probe.statuses.length = 0;
        setup();

        await expect(sdk.checkLicenseForAddress(OTHER_ADDRESS)).resolves.toMatchObject(expected);

        expect(probe.statuses).toEqual([]);
        expect(onError).not.toHaveBeenCalled();
      }
    );

    it('getAllLicenses(): [] only when the wallet owns no license; a failed read rejects', async () => {
      await connected();
      mockState.balanceOf.mockResolvedValue(0n);
      await expect(sdk.getAllLicenses()).resolves.toEqual([]);

      failCall('balanceOf', rpcDown());
      await expect(sdk.getAllLicenses()).rejects.toMatchObject({ code: 'RPC_ERROR' });
    });
  });
});
