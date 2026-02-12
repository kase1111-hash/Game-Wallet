import { BrowserProvider } from 'ethers';
import type {
  WalletConnection,
  WalletSession,
  WalletProvider,
  WalletError,
  ChainId,
} from '../types';
import { generateSessionId, checksumAddress } from '../utils/helpers';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance().child('WalletConnector');

/**
 * Type guard for errors with code and message properties (EIP-1193 errors)
 */
function isEIP1193Error(error: unknown): error is { code: number; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'number' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

/**
 * Safely extract error code from unknown error
 */
function getErrorCode(error: unknown): number | undefined {
  if (isEIP1193Error(error)) {
    return error.code;
  }
  return undefined;
}

/**
 * Safely extract error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  if (isEIP1193Error(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

// Ethereum provider interface (EIP-1193)
interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isPhantom?: boolean;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
    phantom?: { ethereum?: EthereumProvider };
  }
}

/**
 * Handles wallet connection and session management
 */
export class WalletConnector {
  private session: WalletSession = {
    connection: null,
    isConnected: false,
    isConnecting: false,
    error: null,
  };

  private expectedChainId: ChainId;
  private browserProvider: BrowserProvider | null = null;
  private eventHandlers: Map<string, (...args: unknown[]) => void> = new Map();
  private onSessionChange?: (session: WalletSession) => void;
  private onChainMismatch?: (currentChain: ChainId, expectedChain: ChainId) => void;

  constructor(
    expectedChainId: ChainId,
    options?: {
      onSessionChange?: (session: WalletSession) => void;
      onChainMismatch?: (currentChain: ChainId, expectedChain: ChainId) => void;
    }
  ) {
    this.expectedChainId = expectedChainId;
    this.onSessionChange = options?.onSessionChange;
    this.onChainMismatch = options?.onChainMismatch;
  }

  /**
   * Get current session state
   */
  getSession(): WalletSession {
    return { ...this.session };
  }

  /**
   * Check if a wallet provider is available
   */
  isProviderAvailable(provider: WalletProvider): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    switch (provider) {
      case 'metamask':
        return Boolean(window.ethereum?.isMetaMask);
      case 'coinbase':
        return Boolean(window.ethereum?.isCoinbaseWallet);
      case 'phantom':
        return Boolean(window.phantom?.ethereum);
      case 'custom':
        return Boolean(window.ethereum);
      default:
        return false;
    }
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): WalletProvider[] {
    const providers: WalletProvider[] = [];
    const allProviders: WalletProvider[] = ['metamask', 'coinbase', 'phantom'];

    for (const provider of allProviders) {
      if (this.isProviderAvailable(provider)) {
        providers.push(provider);
      }
    }

    return providers;
  }

  /**
   * Connect to a wallet
   */
  async connect(preferredProvider?: WalletProvider): Promise<WalletConnection> {
    const provider = preferredProvider ?? this.detectBestProvider();

    logger.debug(`Connecting to ${provider}`);

    this.updateSession({
      isConnecting: true,
      error: null,
    });

    try {
      const ethereumProvider = this.getEthereumProvider(provider);
      if (!ethereumProvider) {
        throw this.createError(
          'WALLET_NOT_FOUND',
          `${provider} wallet not found. Please install the wallet extension.`,
          provider
        );
      }

      // Request account access
      const accounts = (await ethereumProvider.request({
        method: 'eth_requestAccounts',
      })) as string[];

      if (!accounts || accounts.length === 0) {
        throw this.createError(
          'WALLET_CONNECTION_REJECTED',
          'User rejected the connection request',
          provider
        );
      }

      // Get chain ID
      const chainIdHex = (await ethereumProvider.request({
        method: 'eth_chainId',
      })) as string;
      const chainId = parseInt(chainIdHex, 16);

      // Check chain mismatch
      if (chainId !== this.expectedChainId) {
        logger.warn(`Chain mismatch: connected to ${chainId}, expected ${this.expectedChainId}`);
        this.onChainMismatch?.(chainId, this.expectedChainId);
      }

      // Create connection
      const connection: WalletConnection = {
        address: checksumAddress(accounts[0] as string),
        chainId,
        provider,
        connectedAt: Date.now(),
        sessionId: generateSessionId(),
      };

      // Set up event listeners
      this.setupEventListeners(ethereumProvider);

      // Create browser provider for ethers
      this.browserProvider = new BrowserProvider(ethereumProvider);

      this.updateSession({
        connection,
        isConnected: true,
        isConnecting: false,
        error: null,
      });

      logger.debug(`Connected to ${provider}`, { address: connection.address, chainId: connection.chainId });
      return connection;
    } catch (error) {
      const walletError = this.handleConnectionError(error, provider);

      this.updateSession({
        connection: null,
        isConnected: false,
        isConnecting: false,
        error: walletError,
      });

      throw walletError;
    }
  }

  /**
   * Disconnect the wallet
   */
  async disconnect(): Promise<void> {
    this.removeEventListeners();
    this.browserProvider = null;

    this.updateSession({
      connection: null,
      isConnected: false,
      isConnecting: false,
      error: null,
    });
  }

  /**
   * Request chain switch
   */
  async switchChain(chainId: ChainId): Promise<void> {
    const provider = this.session.connection?.provider;
    if (!provider) {
      throw this.createError('WALLET_DISCONNECTED', 'No wallet connected');
    }

    const ethereumProvider = this.getEthereumProvider(provider);
    if (!ethereumProvider) {
      throw this.createError('WALLET_NOT_FOUND', 'Wallet provider not found');
    }

    const chainIdHex = `0x${chainId.toString(16)}`;

    try {
      await ethereumProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });

      // Update session with new chain ID
      if (this.session.connection) {
        this.updateSession({
          connection: {
            ...this.session.connection,
            chainId,
          },
        });
      }
    } catch (error) {
      const errorCode = getErrorCode(error);

      // Chain not added to wallet - try to add it
      if (errorCode === 4902) {
        throw this.createError(
          'CHAIN_MISMATCH',
          `Chain ${chainId} is not configured in your wallet. Please add it manually.`
        );
      }

      throw this.createError('CHAIN_MISMATCH', 'Failed to switch chain');
    }
  }

  /**
   * Get the browser provider for ethers interactions
   */
  getBrowserProvider(): BrowserProvider | null {
    return this.browserProvider;
  }

  /**
   * Detect the best available provider
   */
  private detectBestProvider(): WalletProvider {
    if (this.isProviderAvailable('metamask')) {
      return 'metamask';
    }
    if (this.isProviderAvailable('coinbase')) {
      return 'coinbase';
    }
    if (this.isProviderAvailable('phantom')) {
      return 'phantom';
    }
    // Fall back to custom (any EIP-1193 provider) if no specific wallet detected
    return 'custom';
  }

  /**
   * Get the Ethereum provider for a wallet type
   */
  private getEthereumProvider(provider: WalletProvider): EthereumProvider | null {
    if (typeof window === 'undefined') {
      return null;
    }

    switch (provider) {
      case 'phantom':
        return window.phantom?.ethereum ?? null;
      case 'metamask':
      case 'coinbase':
      case 'custom':
        return window.ethereum ?? null;
      default:
        return null;
    }
  }

  /**
   * Set up wallet event listeners
   */
  private setupEventListeners(provider: EthereumProvider): void {
    const handleAccountsChanged = (accounts: unknown) => {
      const accountList = accounts as string[];
      if (accountList.length === 0) {
        this.disconnect();
      } else if (this.session.connection) {
        this.updateSession({
          connection: {
            ...this.session.connection,
            address: checksumAddress(accountList[0] as string),
          },
        });
      }
    };

    const handleChainChanged = (chainId: unknown) => {
      const newChainId = parseInt(chainId as string, 16);
      if (this.session.connection) {
        this.updateSession({
          connection: {
            ...this.session.connection,
            chainId: newChainId,
          },
        });

        if (newChainId !== this.expectedChainId) {
          this.onChainMismatch?.(newChainId, this.expectedChainId);
        }
      }
    };

    const handleDisconnect = () => {
      this.disconnect();
    };

    provider.on('accountsChanged', handleAccountsChanged);
    provider.on('chainChanged', handleChainChanged);
    provider.on('disconnect', handleDisconnect);

    this.eventHandlers.set('accountsChanged', handleAccountsChanged);
    this.eventHandlers.set('chainChanged', handleChainChanged);
    this.eventHandlers.set('disconnect', handleDisconnect);
  }

  /**
   * Remove wallet event listeners
   */
  private removeEventListeners(): void {
    const provider = this.session.connection?.provider;
    if (!provider) {
      return;
    }

    const ethereumProvider = this.getEthereumProvider(provider);
    if (!ethereumProvider) {
      return;
    }

    for (const [event, handler] of this.eventHandlers) {
      ethereumProvider.removeListener(event, handler);
    }

    this.eventHandlers.clear();
  }

  /**
   * Update session state
   */
  private updateSession(updates: Partial<WalletSession>): void {
    this.session = { ...this.session, ...updates };
    this.onSessionChange?.(this.session);
  }

  /**
   * Handle connection errors
   */
  private handleConnectionError(error: unknown, provider: WalletProvider): WalletError {
    const errorCode = getErrorCode(error);
    const errorMessage = getErrorMessage(error);

    if (errorCode === 4001) {
      return this.createError(
        'WALLET_CONNECTION_REJECTED',
        'User rejected the connection request',
        provider
      );
    }

    if (errorCode === -32002) {
      return this.createError(
        'WALLET_CONNECTION_REJECTED',
        'Connection request already pending. Please check your wallet.',
        provider
      );
    }

    return this.createError('NETWORK_ERROR', errorMessage || 'Failed to connect wallet', provider);
  }

  /**
   * Create a wallet error
   */
  private createError(
    code: WalletError['code'],
    message: string,
    provider?: WalletProvider
  ): WalletError {
    return {
      code,
      message,
      recoverable: code !== 'WALLET_NOT_FOUND',
      provider,
    };
  }
}
