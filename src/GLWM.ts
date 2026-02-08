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

type StateListener = (state: GLWMState) => void;
type EventHandler<T extends GLWMEvent['type']> = (payload: Extract<GLWMEvent, { type: T }>) => void;

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
          const error = this.createError(
            'CHAIN_MISMATCH',
            `Connected to chain ${current}, but expected ${expected}`
          );
          this.config.onError?.(error);
        },
      });

      // Initialize license verifier
      this.licenseVerifier = new LicenseVerifier(this.rpcProvider, this.config.licenseContract);
      this.licenseVerifier.initialize();

      // Initialize minting portal
      this.mintingPortal = new MintingPortal(this.config.mintingPortal, {
        onMintStarted: (txHash) => {
          this.setState({ status: 'minting_in_progress', transactionHash: txHash });
          this.emitEvent({ type: 'MINT_STARTED', transactionHash: txHash });
        },
        onMintCompleted: (result) => {
          this.emitEvent({ type: 'MINT_COMPLETED', result });
        },
        onClose: () => {
          this.emitEvent({ type: 'CLOSE_MINTING_PORTAL' });
        },
      });

      this.setState({ status: 'awaiting_wallet' });
    } catch (error) {
      const glwmError = this.handleError(error);
      this.setState({ status: 'error', error: glwmError });
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
   * @returns Promise resolving when game should start
   * @throws GLWMError if flow cannot complete
   */
  async verifyAndPlay(): Promise<LicenseVerificationResult> {
    this.ensureInitialized();

    // Check if minting is already in progress
    if (
      this.state.status === 'minting_portal_open' ||
      this.state.status === 'minting_in_progress'
    ) {
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
      throw this.createError(
        'USER_CANCELLED',
        'Minting portal is already open.',
        true
      );
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

    try {
      const connection = await this.walletConnector!.connect(preferredProvider);

      // Set wallet address in minting portal
      this.mintingPortal?.setWalletAddress(connection.address);

      return connection;
    } catch (error) {
      const glwmError = this.handleError(error);
      this.setState({ status: 'error', error: glwmError });
      throw glwmError;
    }
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
    await this.walletConnector!.switchChain(chainId);
  }

  // ============================================
  // LICENSE METHODS
  // ============================================

  /**
   * Verify license ownership for connected wallet
   * Uses cache if available and not expired
   */
  async verifyLicense(): Promise<LicenseVerificationResult> {
    this.ensureInitialized();

    const session = this.getWalletSession();
    if (!session.connection) {
      throw this.createError('WALLET_DISCONNECTED', 'No wallet connected');
    }

    const address = session.connection.address;
    this.setState({ status: 'verifying_license', address });

    // Check cache first
    const cached = this.cache?.getVerification(address);
    if (cached) {
      this.emitEvent({ type: 'LICENSE_VERIFIED', result: cached });
      this.config.onLicenseVerified?.(cached);
      return cached;
    }

    try {
      const result = await this.licenseVerifier!.verifyLicense(address);

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
      this.setState({ status: 'error', error: glwmError });
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
   */
  async checkLicenseForAddress(address: string): Promise<LicenseVerificationResult> {
    this.ensureInitialized();
    return this.licenseVerifier!.verifyLicense(address);
  }

  /**
   * Get full license details including metadata
   */
  async getLicenseDetails(tokenId: string): Promise<LicenseNFT> {
    this.ensureInitialized();
    return this.licenseVerifier!.getLicenseById(tokenId);
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

    return this.licenseVerifier!.getAllLicenses(session.connection.address);
  }

  // ============================================
  // MINTING METHODS
  // ============================================

  /**
   * Open the minting portal
   */
  async openMintingPortal(): Promise<void> {
    this.ensureInitialized();

    this.setState({ status: 'minting_portal_open' });
    this.emitEvent({ type: 'OPEN_MINTING_PORTAL' });

    await this.mintingPortal!.open();
  }

  /**
   * Close the minting portal
   */
  closeMintingPortal(): void {
    this.mintingPortal?.close();

    const session = this.getWalletSession();
    if (session.connection) {
      this.setState({ status: 'no_license', address: session.connection.address });
    } else {
      this.setState({ status: 'awaiting_wallet' });
    }
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
    if (this.state.status === 'error') {
      const errorState = this.state as { status: 'error'; error: GLWMError };
      throw this.createError(
        'CONFIGURATION_ERROR',
        `SDK is in error state: ${errorState.error.message}. Call initialize() to retry.`
      );
    }
  }

  private setState(newState: GLWMState): void {
    this.state = newState;
    for (const listener of this.stateListeners) {
      listener(this.state);
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

  private createError(code: GLWMError['code'], message: string, recoverable = true): GLWMError {
    const error: GLWMError = {
      code,
      message,
      recoverable,
    };
    this.config.onError?.(error);
    return error;
  }

  private handleError(error: unknown): GLWMError {
    if (this.isGLWMError(error)) {
      return error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return this.createError('NETWORK_ERROR', message);
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

  private waitForPortalClose(): Promise<void> {
    return new Promise((resolve) => {
      // Subscribe first to avoid race condition where portal closes
      // between check and subscription
      const unsubscribe = this.on('CLOSE_MINTING_PORTAL', () => {
        unsubscribe();
        resolve();
      });

      // Then check if already closed (handles race condition)
      if (!this.mintingPortal?.isPortalOpen()) {
        unsubscribe();
        resolve();
      }
    });
  }
}
