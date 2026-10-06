import type {
  GLWMConfig,
  GLWMState,
  GLWMEvent,
  GLWMError,
  WalletConnection,
  WalletSession,
  WalletProvider,
  ChainId,
  LicenseVerificationResult,
  LicenseNFT,
  CacheConfig,
} from './types';
import { RPCProvider } from './rpc';
import { WalletConnector } from './wallet';
import { LicenseVerifier } from './license';
import { MintingPortal } from './minting';
import { Cache } from './utils';
import { Logger } from './utils/Logger';

const logger = Logger.getInstance().child('GLWM');

type StateListener = (state: GLWMState) => void;
type EventHandler<T extends GLWMEvent['type']> = (payload: Extract<GLWMEvent, { type: T }>) => void;

/** The states that exist only while the minting portal is open (see syncMintingState()) */
type MintingState = Extract<GLWMState, { status: 'minting_portal_open' | 'minting_in_progress' }>;
/** Every other state: the only ones setState() accepts */
type NonMintingState = Exclude<GLWMState, MintingState>;

function isMintingState(state: GLWMState): state is MintingState {
  return state.status === 'minting_portal_open' || state.status === 'minting_in_progress';
}

/** An error's stack (or message) for log output */
function describeError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

/**
 * Whether a verification result is a verdict about the license: valid, `no_license_found` or
 * `license_expired`. LicenseVerifier returns nothing else (a failed verification is thrown), but
 * earlier SDK versions cached failures as `verification_failed` / `contract_paused` results in
 * localStorage, where one can still be found until it expires.
 */
function isLicenseVerdict(result: LicenseVerificationResult): boolean {
  return (
    result.isValid || result.reason === 'no_license_found' || result.reason === 'license_expired'
  );
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  ttlSeconds: 300, // 5 minutes
  storageKey: 'glwm',
};

/**
 * Main entry point for GLWM SDK
 *
 * @example
 * ```typescript
 * const glwm = new GLWM({
 *   licenseContract: '0x1234...',
 *   chainId: 137,
 *   rpcProvider: { provider: 'alchemy', apiKey: 'xxx' },
 *   mintingPortal: { url: 'https://mint.mygame.com', mode: 'iframe' }
 * });
 *
 * await glwm.initialize();
 * const result = await glwm.verifyAndPlay();
 * ```
 */
export class GLWM {
  private config: GLWMConfig;
  private state: GLWMState = { status: 'uninitialized' };
  private stateListeners: Set<StateListener> = new Set();
  private eventHandlers: Map<string, Set<EventHandler<GLWMEvent['type']>>> = new Map();

  // Core components
  private rpcProvider: RPCProvider | null = null;
  private walletConnector: WalletConnector | null = null;
  private licenseVerifier: LicenseVerifier | null = null;
  private mintingPortal: MintingPortal | null = null;
  private cache: Cache | null = null;

  // Errors already reported (ERROR event + config.onError), so each is reported exactly once
  private readonly reportedErrors = new WeakSet<GLWMError>();

  // An openMintingPortal() still in progress, shared by concurrent calls (e.g. a double-click)
  private portalOpening: Promise<void> | null = null;

  private static readonly VERSION = '0.1.0';

  constructor(config: GLWMConfig) {
    const validation = GLWM.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }
    this.config = config;
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  /**
   * Initialize the SDK with configuration
   * Must be called before any other methods
   */
  async initialize(): Promise<void> {
    this.setState({ status: 'initializing' });

    try {
      // Release components from a previous initialize(), so their wallet listeners and portal
      // callbacks stop firing into this instance. They are detached first, and a failure while
      // releasing them (e.g. an app handler throwing on WALLET_DISCONNECTED) is logged rather
      // than failing this initialize().
      const previousConnector = this.walletConnector;
      const previousPortal = this.mintingPortal;
      this.walletConnector = null;
      this.mintingPortal = null;
      await this.releaseQuietly('wallet connector', async () => {
        // Listeners are attached only together with a connection
        if (previousConnector?.getSession().connection) {
          await previousConnector.disconnect();
        }
      });
      await this.releaseQuietly('minting portal', () => previousPortal?.close());

      // Initialize cache
      this.cache = new Cache(this.config.cacheConfig ?? DEFAULT_CACHE_CONFIG);

      // Initialize RPC provider
      this.rpcProvider = new RPCProvider(this.config.rpcProvider, this.config.chainId);
      await this.rpcProvider.initialize();

      // Initialize wallet connector
      this.walletConnector = new WalletConnector(this.config.chainId, {
        onSessionChange: (session) => {
          if (session.isConnected && session.connection) {
            this.emitEvent({ type: 'WALLET_CONNECTED', connection: session.connection });
            this.config.onWalletConnected?.(session.connection);
          } else if (!session.isConnected) {
            this.emitEvent({ type: 'WALLET_DISCONNECTED' });
          }
        },
        onChainMismatch: (current, expected) => {
          this.createError(
            'CHAIN_MISMATCH',
            `Connected to chain ${current}, but expected ${expected}`
          );
        },
      });

      // Initialize license verifier
      this.licenseVerifier = new LicenseVerifier(this.rpcProvider, this.config.licenseContract);
      this.licenseVerifier.initialize();

      // Initialize minting portal. Its lifecycle callbacks drive the minting states, through
      // syncMintingState() only.
      this.mintingPortal = new MintingPortal(this.config.mintingPortal, {
        onMintStarted: (txHash): void => {
          this.syncMintingState({ status: 'minting_in_progress', transactionHash: txHash });
          this.emitEvent({ type: 'MINT_STARTED', transactionHash: txHash });
        },
        onMintCompleted: (result) => {
          try {
            this.emitEvent({ type: 'MINT_COMPLETED', result });
          } finally {
            if (!result.success && result.error) {
              this.reportError(result.error);
            }
          }
        },
        onClose: (): void => {
          // CLOSE_MINTING_PORTAL ends verifyAndPlay()'s wait, so it fires even if a state
          // listener throws
          try {
            this.syncMintingState();
          } finally {
            this.emitEvent({ type: 'CLOSE_MINTING_PORTAL' });
          }
        },
      });

      this.setState({ status: 'awaiting_wallet' });
    } catch (error) {
      const glwmError = this.handleError(error);
      try {
        this.setState({ status: 'error', error: glwmError });
      } finally {
        this.reportError(glwmError);
      }
      throw glwmError;
    }
  }

  /**
   * Clean up resources, disconnect wallet, close portals
   */
  async dispose(): Promise<void> {
    await this.disconnectWallet();
    this.mintingPortal?.close();
    this.stateListeners.clear();
    this.eventHandlers.clear();
    this.rpcProvider = null;
    this.walletConnector = null;
    this.licenseVerifier = null;
    this.mintingPortal = null;
    this.cache = null;
    this.setState({ status: 'uninitialized' });
  }

  // ============================================
  // MAIN WORKFLOW
  // ============================================

  /**
   * Primary method: Verify license and start game if valid
   * Handles the full flow: wallet -> verify -> mint if needed -> verify again
   *
   * The minting portal opens only for a verdict that the wallet has no valid license
   * (`no_license_found` or `license_expired`). If the license cannot be verified, before or after
   * the portal (an RPC call fails: `RPC_ERROR`; the license contract is paused:
   * `CONTRACT_ERROR`), this rejects with that error, as verifyLicense() does.
   *
   * @returns Promise resolving when game should start
   * @throws GLWMError if flow cannot complete
   */
  async verifyAndPlay(): Promise<LicenseVerificationResult> {
    this.ensureInitialized();

    // Check if minting is already in progress (a minting state implies the portal is open; see
    // syncMintingState())
    if (isMintingState(this.state)) {
      throw this.createError(
        'USER_CANCELLED',
        'Minting is already in progress. Please complete or close the current minting session.',
        true
      );
    }

    // Ensure wallet is connected
    const session = this.getWalletSession();
    if (!session.isConnected) {
      await this.connectWallet();
    }

    // Verify license
    const result = await this.verifyLicense();

    if (result.isValid) {
      if (result.license) {
        this.setState({ status: 'license_valid', license: result.license });
      }
      return result;
    }

    // No valid license - check portal isn't already open before opening
    if (this.mintingPortal?.isPortalOpen()) {
      throw this.createError('USER_CANCELLED', 'Minting portal is already open.', true);
    }

    // Open minting portal
    await this.openMintingPortal();

    // Wait for portal to close (user minted or cancelled)
    await this.waitForPortalClose();

    // After minting portal closes, verify again
    const postMintResult = await this.verifyLicenseFresh();

    if (postMintResult.isValid && postMintResult.license) {
      this.setState({ status: 'license_valid', license: postMintResult.license });
    }

    return postMintResult;
  }

  // ============================================
  // WALLET METHODS
  // ============================================

  /**
   * Connect to user's wallet
   * Shows wallet selection UI if multiple providers available
   *
   * @param preferredProvider - Optional preferred wallet provider
   */
  async connectWallet(preferredProvider?: WalletProvider): Promise<WalletConnection> {
    this.ensureInitialized();

    const provider = preferredProvider ?? 'metamask';
    this.setState({ status: 'connecting_wallet', provider });

    const connector = this.walletConnector!;
    let connection: WalletConnection;
    try {
      connection = await connector.connect(preferredProvider);
    } catch (error) {
      const glwmError = this.handleError(error);
      if (connector !== this.walletConnector) {
        // initialize() ran meanwhile: its state is not this connection attempt's to change
        throw this.reportError(glwmError);
      }
      try {
        this.setState({ status: 'error', error: glwmError });
      } finally {
        this.reportError(glwmError);
      }
      throw glwmError;
    }

    if (connector !== this.walletConnector) {
      // initialize() replaced the connector while connecting: release this connection rather
      // than leave its wallet listeners attached
      await connector.disconnect();
      throw this.createError(
        'WALLET_DISCONNECTED',
        'initialize() was called while the wallet was connecting. Connect again.'
      );
    }

    // Set wallet address in minting portal
    this.mintingPortal?.setWalletAddress(connection.address);

    return connection;
  }

  /**
   * Disconnect current wallet session
   */
  async disconnectWallet(): Promise<void> {
    if (this.walletConnector) {
      // Clear cached verification before disconnecting
      const session = this.getWalletSession();
      if (session.connection) {
        this.cache?.clearVerification(session.connection.address);
      }

      await this.walletConnector.disconnect();
    }

    this.setState({ status: 'awaiting_wallet' });
  }

  /**
   * Get current wallet connection status
   */
  getWalletSession(): WalletSession {
    if (!this.walletConnector) {
      return {
        connection: null,
        isConnected: false,
        isConnecting: false,
        error: null,
      };
    }
    return this.walletConnector.getSession();
  }

  /**
   * Check if a specific wallet provider is available
   */
  isProviderAvailable(provider: WalletProvider): boolean {
    if (!this.walletConnector) {
      // Fallback detection when SDK not initialized
      if (typeof window === 'undefined') {
        return false;
      }
      if (provider === 'metamask') {
        return 'ethereum' in window;
      }
      return false;
    }
    return this.walletConnector.isProviderAvailable(provider);
  }

  /**
   * Get list of available wallet providers
   */
  getAvailableProviders(): WalletProvider[] {
    if (!this.walletConnector) {
      return [];
    }
    return this.walletConnector.getAvailableProviders();
  }

  /**
   * Request chain switch if connected to wrong network
   */
  async switchChain(chainId: ChainId): Promise<void> {
    this.ensureInitialized();
    await this.withErrorReporting(() => this.walletConnector!.switchChain(chainId));
  }

  // ============================================
  // LICENSE METHODS
  // ============================================

  /**
   * Verify license ownership for connected wallet
   * Uses cache if available and not expired
   *
   * Resolves with a verdict: valid, `no_license_found` or `license_expired`. If the license
   * cannot be verified (an RPC call fails: `RPC_ERROR`; the license contract is paused:
   * `CONTRACT_ERROR`), the error is reported (ERROR event + onError) and thrown, the state
   * becomes 'error', and nothing is cached.
   */
  async verifyLicense(): Promise<LicenseVerificationResult> {
    this.ensureInitialized();

    const session = this.getWalletSession();
    if (!session.connection) {
      throw this.createError('WALLET_DISCONNECTED', 'No wallet connected');
    }

    const address = session.connection.address;
    this.setState({ status: 'verifying_license', address });

    // Check cache first. Only a verdict is reused: a failure cached by an earlier SDK version is
    // verified again (this version never caches one: verifyLicense() throws it)
    const cached = this.cache?.getVerification(address);
    if (cached && isLicenseVerdict(cached)) {
      this.emitEvent({ type: 'LICENSE_VERIFIED', result: cached });
      this.config.onLicenseVerified?.(cached);
      return cached;
    }

    try {
      const result = await this.requestVerdict(address);

      // Cache the result
      this.cache?.setVerification(address, result);

      this.emitEvent({ type: 'LICENSE_VERIFIED', result });
      this.config.onLicenseVerified?.(result);

      if (result.isValid && result.license) {
        this.setState({ status: 'license_valid', license: result.license });
      } else {
        this.setState({ status: 'no_license', address });
      }

      return result;
    } catch (error) {
      const glwmError = this.handleError(error);
      try {
        this.setState({ status: 'error', error: glwmError });
      } finally {
        this.reportError(glwmError);
      }
      throw glwmError;
    }
  }

  /**
   * Force fresh verification, bypassing cache
   */
  async verifyLicenseFresh(): Promise<LicenseVerificationResult> {
    const session = this.getWalletSession();
    if (session.connection) {
      this.cache?.clearVerification(session.connection.address);
    }
    return this.verifyLicense();
  }

  /**
   * Check license for arbitrary address (read-only)
   *
   * Resolves with a verdict, like verifyLicense(). If the license cannot be verified, the error
   * is reported and thrown; the SDK state and the cache are not changed.
   */
  async checkLicenseForAddress(address: string): Promise<LicenseVerificationResult> {
    this.ensureInitialized();
    return this.withErrorReporting(() => this.requestVerdict(address));
  }

  /**
   * Get full license details including metadata
   */
  async getLicenseDetails(tokenId: string): Promise<LicenseNFT> {
    this.ensureInitialized();
    return this.withErrorReporting(() => this.licenseVerifier!.getLicenseById(tokenId));
  }

  /**
   * Get all licenses owned by connected wallet
   * (For multi-license scenarios)
   */
  async getAllLicenses(): Promise<LicenseNFT[]> {
    this.ensureInitialized();

    const session = this.getWalletSession();
    if (!session.connection) {
      throw this.createError('WALLET_DISCONNECTED', 'No wallet connected');
    }

    const address = session.connection.address;
    return this.withErrorReporting(() => this.licenseVerifier!.getAllLicenses(address));
  }

  // ============================================
  // MINTING METHODS
  // ============================================

  /**
   * Open the minting portal
   *
   * Once the portal is open, the state becomes 'minting_portal_open' and OPEN_MINTING_PORTAL is
   * emitted. If the portal cannot open, the state is left unchanged and the error is reported and
   * thrown. Does nothing if the portal is already open.
   */
  async openMintingPortal(): Promise<void> {
    this.ensureInitialized();

    // A second call while the first is still opening waits for it: MintingPortal.open() is not
    // re-entrant, and two concurrent opens would stack a second, orphaned overlay
    this.portalOpening ??= this.openPortalOnce().finally(() => {
      this.portalOpening = null;
    });
    return this.portalOpening;
  }

  private async openPortalOnce(): Promise<void> {
    const portal = this.mintingPortal;
    if (!portal) {
      throw this.createError(
        'CONFIGURATION_ERROR',
        'SDK not initialized. Call initialize() first.'
      );
    }
    if (portal.isPortalOpen()) {
      return;
    }

    await this.withErrorReporting(() => portal.open());

    if (portal !== this.mintingPortal) {
      // initialize() or dispose() replaced the portal while it was opening: don't leave it on screen
      portal.close();
      return;
    }

    // Announced outside the error reporting: an exception from an app's state listener or
    // OPEN_MINTING_PORTAL handler is not a failure to open the portal
    if (portal.isPortalOpen()) {
      this.syncMintingState();
      // A state listener may already have closed the portal again
      if (portal.isPortalOpen()) {
        this.emitEvent({ type: 'OPEN_MINTING_PORTAL' });
      }
    }
  }

  /**
   * Close the minting portal
   *
   * As with every other way the portal closes, the SDK then leaves the minting state: to
   * 'no_license' if a wallet is connected, else 'awaiting_wallet'. Does nothing if the portal is
   * not open.
   */
  closeMintingPortal(): void {
    this.mintingPortal?.close();
  }

  // ============================================
  // STATE & EVENTS
  // ============================================

  /**
   * Get current SDK state
   */
  getState(): GLWMState {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * Subscribe to specific events
   */
  on<T extends GLWMEvent['type']>(event: T, handler: EventHandler<T>): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    const handlers = this.eventHandlers.get(event);
    handlers?.add(handler as unknown as EventHandler<GLWMEvent['type']>);

    return () => {
      handlers?.delete(handler as unknown as EventHandler<GLWMEvent['type']>);
    };
  }

  // ============================================
  // UTILITIES
  // ============================================

  /**
   * Clear local cache
   */
  clearCache(): void {
    this.cache?.clearAll();
  }

  /**
   * Get SDK version
   */
  static getVersion(): string {
    return GLWM.VERSION;
  }

  /**
   * Validate configuration without initializing
   */
  static validateConfig(config: GLWMConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.licenseContract) {
      errors.push('licenseContract is required');
    } else if (!/^0x[a-fA-F0-9]{40}$/.test(config.licenseContract)) {
      errors.push('licenseContract must be a valid Ethereum address');
    }

    if (!config.chainId || config.chainId <= 0) {
      errors.push('chainId must be a positive number');
    }

    if (!config.rpcProvider) {
      errors.push('rpcProvider configuration is required');
    } else if (!['alchemy', 'infura', 'custom'].includes(config.rpcProvider.provider)) {
      errors.push('rpcProvider.provider must be one of: alchemy, infura, custom');
    }

    if (!config.mintingPortal) {
      errors.push('mintingPortal configuration is required');
    } else if (!config.mintingPortal.url) {
      errors.push('mintingPortal.url is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private ensureInitialized(): void {
    if (this.state.status === 'uninitialized') {
      throw this.createError(
        'CONFIGURATION_ERROR',
        'SDK not initialized. Call initialize() first.'
      );
    }
    if (this.state.status === 'initializing') {
      // The components are being (re)created: using them now would act on a half-built SDK
      throw this.createError(
        'CONFIGURATION_ERROR',
        'SDK is still initializing. Wait for initialize() to finish.'
      );
    }
    if (this.state.status === 'error') {
      const errorState = this.state as { status: 'error'; error: GLWMError };
      throw this.createError(
        'CONFIGURATION_ERROR',
        `SDK is in error state: ${errorState.error.message}. Call initialize() to retry.`
      );
    }
  }

  /**
   * Set a state that is not a minting state. Minting states are entered and left only by
   * syncMintingState(), so they are not accepted here.
   */
  private setState(newState: NonMintingState): void {
    this.commitState(newState);
  }

  /**
   * Store the state and notify listeners. Called only by setState() and syncMintingState().
   */
  private commitState(newState: GLWMState): void {
    logger.debug(`State: ${this.state.status} → ${newState.status}`);
    this.state = newState;
    for (const listener of this.stateListeners) {
      listener(this.state);
    }
  }

  /**
   * Minting-state invariant: the SDK is in a minting state ('minting_portal_open' or
   * 'minting_in_progress') only while the minting portal is open, and the portal opening puts
   * it in one.
   *
   * This is the only place a minting state is entered or left (setState() does not accept
   * them). It runs once the portal has opened (openMintingPortal()) and from the portal's
   * onMintStarted / onClose callbacks, and reads the portal's actual open status. Every close
   * path goes through MintingPortal.close() and so through onClose: the close button, an overlay
   * click, PORTAL_CLOSED, auto-close after MINT_COMPLETED, the verifyAndPlay() timeout,
   * closeMintingPortal(), dispose() and initialize(). A portal that fails to open is never
   * announced, so the state is left as it was.
   *
   * It changes the state only when the state and the portal disagree, or when `next` moves an
   * open portal's session forward, so no transition is notified twice.
   *
   * Public calls made while the portal is open (verifyLicense(), connectWallet(),
   * disconnectWallet()) can still move the state off a minting state; verifyAndPlay() covers
   * that case by checking isPortalOpen().
   *
   * @param next - The minting state to enter while the portal is open. Without it, an open
   *   portal enters 'minting_portal_open' unless already in a minting state.
   */
  private syncMintingState(next?: MintingState): void {
    const portalOpen = this.mintingPortal?.isPortalOpen() === true;

    if (portalOpen) {
      if (next) {
        this.commitState(next);
      } else if (!isMintingState(this.state)) {
        this.commitState({ status: 'minting_portal_open' });
      }
    } else if (isMintingState(this.state)) {
      const connection = this.getWalletSession().connection;
      this.setState(
        connection
          ? { status: 'no_license', address: connection.address }
          : { status: 'awaiting_wallet' }
      );
    }
  }

  private emitEvent(event: GLWMEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        handler(event);
      }
    }
  }

  /**
   * Create an error and report it (ERROR event + config.onError)
   */
  private createError(code: GLWMError['code'], message: string, recoverable = true): GLWMError {
    return this.reportError({ code, message, recoverable });
  }

  /**
   * Emit the ERROR event and call config.onError, once per error object. A throwing listener
   * is logged rather than allowed to replace the SDK error or interrupt its state handling.
   */
  private reportError<E extends GLWMError>(error: E): E {
    if (this.reportedErrors.has(error)) {
      return error;
    }
    this.reportedErrors.add(error);

    const event: GLWMEvent = { type: 'ERROR', error };
    // Snapshot: handlers (un)subscribed during dispatch don't affect this error
    for (const handler of [...(this.eventHandlers.get('ERROR') ?? [])]) {
      this.runErrorListener('ERROR event handler', () => handler(event));
    }
    this.runErrorListener('onError callback', () => this.config.onError?.(error));
    return error;
  }

  private runErrorListener(name: string, listener: () => void): void {
    try {
      listener();
    } catch (listenerError) {
      logger.error(`${name} threw`, { error: describeError(listenerError) });
    }
  }

  /** Release a component from a previous initialize(), logging instead of throwing */
  private async releaseQuietly(name: string, release: () => void | Promise<void>): Promise<void> {
    try {
      await release();
    } catch (releaseError) {
      logger.error(`Releasing the previous ${name} threw`, { error: describeError(releaseError) });
    }
  }

  /**
   * Verify an address with LicenseVerifier, accepting only a verdict about the license.
   *
   * LicenseVerifier throws a verification that cannot complete. Anything else that is not a
   * verdict (e.g. the deprecated 'verification_failed' or 'wrong_chain' reasons, or no reason)
   * is thrown here as VERIFICATION_FAILED, so it can never be cached as, or acted on as, "no
   * license". The error is returned unreported: the caller reports it.
   */
  private async requestVerdict(address: string): Promise<LicenseVerificationResult> {
    const result = await this.licenseVerifier!.verifyLicense(address);
    if (!isLicenseVerdict(result)) {
      throw {
        code: 'VERIFICATION_FAILED',
        message: `The license could not be verified (${result.reason ?? 'no reason given'})`,
        details: { reason: result.reason ?? null },
        recoverable: true,
      } satisfies GLWMError;
    }
    return result;
  }

  /**
   * Run an operation and report any error it throws before rethrowing it as a GLWMError
   */
  private async withErrorReporting<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw this.reportError(this.handleError(error));
    }
  }

  /**
   * Normalize a thrown value to a GLWMError (without reporting it)
   */
  private handleError(error: unknown): GLWMError {
    if (this.isGLWMError(error)) {
      logger.error(`${error.code}: ${error.message}`);
      return error;
    }

    // Duck-typed so errors from another realm (iframes, jsdom) keep their message
    const rawMessage = (error as { message?: unknown } | null)?.message;
    const message = typeof rawMessage === 'string' ? rawMessage : 'Unknown error';
    logger.error('Unhandled error', { error: message });

    // Classify the error based on message content; keep the original for its stack
    const code = this.classifyError(message);
    return { code, message, recoverable: true, details: error };
  }

  private classifyError(message: string): GLWMError['code'] {
    const lower = message.toLowerCase();

    // User-initiated cancellations
    if (
      lower.includes('user rejected') ||
      lower.includes('user denied') ||
      lower.includes('user cancelled')
    ) {
      return 'USER_CANCELLED';
    }

    // Contract/on-chain errors
    if (
      lower.includes('contract') ||
      lower.includes('revert') ||
      lower.includes('execution reverted') ||
      lower.includes('call exception')
    ) {
      return 'CONTRACT_ERROR';
    }

    // Configuration errors
    if (
      lower.includes('invalid address') ||
      lower.includes('invalid config') ||
      lower.includes('not initialized')
    ) {
      return 'CONFIGURATION_ERROR';
    }

    // Default to network error for genuinely unknown cases
    return 'NETWORK_ERROR';
  }

  private isGLWMError(error: unknown): error is GLWMError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error &&
      'recoverable' in error
    );
  }

  private static readonly PORTAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  private waitForPortalClose(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        unsubscribe();
        try {
          // Closing the portal also leaves the minting state (see syncMintingState())
          this.mintingPortal?.close();
        } catch (closeError) {
          // An app listener threw during the close: still reject below, or the caller would
          // wait forever (this wait no longer listens for CLOSE_MINTING_PORTAL)
          logger.error('Closing the timed-out minting portal threw', {
            error: describeError(closeError),
          });
        }
        reject(this.createError('USER_CANCELLED', 'Minting portal timed out after 10 minutes'));
      }, GLWM.PORTAL_TIMEOUT_MS);

      // Subscribe first to avoid race condition where portal closes
      // between check and subscription
      const unsubscribe = this.on('CLOSE_MINTING_PORTAL', () => {
        clearTimeout(timeoutId);
        unsubscribe();
        resolve();
      });

      // Then check if already closed (handles race condition)
      if (!this.mintingPortal?.isPortalOpen()) {
        clearTimeout(timeoutId);
        unsubscribe();
        resolve();
      }
    });
  }
}
