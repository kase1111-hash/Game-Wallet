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
  MintConfig,
  MintRequest,
  MintResult,
} from './types';

type StateListener = (state: GLWMState) => void;
type EventHandler<T extends GLWMEvent['type']> = (
  payload: Extract<GLWMEvent, { type: T }>
) => void;

/**
 * Main entry point for GLWM SDK
 *
 * @example
 * ```typescript
 * const glwm = new GLWM({
 *   licenseContract: '0x1234...',
 *   chainId: 137,
 *   rpcProvider: { provider: 'alchemy', apiKey: 'xxx' },
 *   mintingPortal: { url: 'https://mint.mygame.com', mode: 'webview' }
 * });
 *
 * await glwm.initialize();
 * const result = await glwm.verifyAndPlay();
 * ```
 */
export class GLWM {
  private config: GLWMConfig;
  private state: GLWMState = { status: 'uninitialized' };
  private walletSession: WalletSession = {
    connection: null,
    isConnected: false,
    isConnecting: false,
    error: null,
  };
  private stateListeners: Set<StateListener> = new Set();
  private eventHandlers: Map<string, Set<EventHandler<GLWMEvent['type']>>> = new Map();

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

    // TODO: Initialize RPC provider
    // TODO: Set up event listeners
    // TODO: Restore cached wallet session if available

    this.setState({ status: 'awaiting_wallet' });
  }

  /**
   * Clean up resources, disconnect wallet, close portals
   */
  async dispose(): Promise<void> {
    await this.disconnectWallet();
    this.closeMintingPortal();
    this.stateListeners.clear();
    this.eventHandlers.clear();
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
    // Ensure wallet is connected
    if (!this.walletSession.isConnected) {
      await this.connectWallet();
    }

    // Verify license
    const result = await this.verifyLicense();

    if (result.isValid) {
      return result;
    }

    // No valid license - open minting portal
    await this.openMintingPortal();

    // After minting portal closes, verify again
    return this.verifyLicenseFresh();
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
    const provider = preferredProvider ?? 'metamask';
    this.setState({ status: 'connecting_wallet', provider });

    this.walletSession = {
      ...this.walletSession,
      isConnecting: true,
      error: null,
    };

    // TODO: Implement actual wallet connection logic
    throw new Error('Wallet connection not yet implemented');
  }

  /**
   * Disconnect current wallet session
   */
  async disconnectWallet(): Promise<void> {
    this.walletSession = {
      connection: null,
      isConnected: false,
      isConnecting: false,
      error: null,
    };
    this.emitEvent({ type: 'WALLET_DISCONNECTED' });
    this.setState({ status: 'awaiting_wallet' });
  }

  /**
   * Get current wallet connection status
   */
  getWalletSession(): WalletSession {
    return { ...this.walletSession };
  }

  /**
   * Check if a specific wallet provider is available
   */
  isProviderAvailable(provider: WalletProvider): boolean {
    // TODO: Implement provider detection
    switch (provider) {
      case 'metamask':
        return typeof window !== 'undefined' && 'ethereum' in window;
      case 'walletconnect':
        return true; // WalletConnect is always available as it doesn't require an extension
      default:
        return false;
    }
  }

  /**
   * Get list of available wallet providers
   */
  getAvailableProviders(): WalletProvider[] {
    const providers: WalletProvider[] = [];
    const allProviders: WalletProvider[] = ['metamask', 'walletconnect', 'phantom', 'coinbase'];

    for (const provider of allProviders) {
      if (this.isProviderAvailable(provider)) {
        providers.push(provider);
      }
    }

    return providers;
  }

  /**
   * Request chain switch if connected to wrong network
   */
  async switchChain(_chainId: ChainId): Promise<void> {
    // TODO: Implement chain switching
    throw new Error('Chain switching not yet implemented');
  }

  // ============================================
  // LICENSE METHODS
  // ============================================

  /**
   * Verify license ownership for connected wallet
   * Uses cache if available and not expired
   */
  async verifyLicense(): Promise<LicenseVerificationResult> {
    if (!this.walletSession.connection) {
      throw this.createError('WALLET_DISCONNECTED', 'No wallet connected');
    }

    this.setState({ status: 'verifying_license', address: this.walletSession.connection.address });

    // TODO: Check cache first
    // TODO: Implement actual license verification
    throw new Error('License verification not yet implemented');
  }

  /**
   * Force fresh verification, bypassing cache
   */
  async verifyLicenseFresh(): Promise<LicenseVerificationResult> {
    // TODO: Clear cache entry
    return this.verifyLicense();
  }

  /**
   * Check license for arbitrary address (read-only)
   */
  async checkLicenseForAddress(_address: string): Promise<LicenseVerificationResult> {
    // TODO: Implement license check for arbitrary address
    throw new Error('License check not yet implemented');
  }

  /**
   * Get full license details including metadata
   */
  async getLicenseDetails(_tokenId: string): Promise<LicenseNFT> {
    // TODO: Implement license details fetching
    throw new Error('License details fetching not yet implemented');
  }

  /**
   * Get all licenses owned by connected wallet
   * (For multi-license scenarios)
   */
  async getAllLicenses(): Promise<LicenseNFT[]> {
    // TODO: Implement fetching all licenses
    throw new Error('Fetching all licenses not yet implemented');
  }

  // ============================================
  // MINTING METHODS
  // ============================================

  /**
   * Open the minting portal
   */
  async openMintingPortal(): Promise<void> {
    this.setState({ status: 'minting_portal_open' });
    this.emitEvent({ type: 'OPEN_MINTING_PORTAL' });

    // TODO: Implement portal opening based on config.mintingPortal.mode
    throw new Error('Minting portal not yet implemented');
  }

  /**
   * Close the minting portal
   */
  closeMintingPortal(): void {
    this.emitEvent({ type: 'CLOSE_MINTING_PORTAL' });
    if (this.walletSession.connection) {
      this.setState({ status: 'no_license', address: this.walletSession.connection.address });
    } else {
      this.setState({ status: 'awaiting_wallet' });
    }
  }

  /**
   * Get current mint configuration and pricing
   */
  async getMintConfig(): Promise<MintConfig> {
    // TODO: Implement mint config fetching
    throw new Error('Mint config fetching not yet implemented');
  }

  /**
   * Programmatically initiate mint (advanced usage)
   * Most implementations should use openMintingPortal() instead
   */
  async mint(_request: MintRequest): Promise<MintResult> {
    // TODO: Implement minting
    throw new Error('Minting not yet implemented');
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
    handlers?.add(handler as EventHandler<GLWMEvent['type']>);

    return () => {
      handlers?.delete(handler as EventHandler<GLWMEvent['type']>);
    };
  }

  // ============================================
  // UTILITIES
  // ============================================

  /**
   * Clear local cache
   */
  clearCache(): void {
    // TODO: Implement cache clearing
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
    return {
      code,
      message,
      recoverable,
    };
  }
}
