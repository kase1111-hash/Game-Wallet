import type {
  MintingPortalConfig,
  MintConfig,
  MintRequest,
  MintResult,
  MintError,
  GLWMError,
} from '../types';

/**
 * Message types for portal communication
 */
interface PortalMessage {
  type: 'MINT_STARTED' | 'MINT_COMPLETED' | 'MINT_FAILED' | 'PORTAL_CLOSED' | 'PORTAL_READY';
  payload?: unknown;
}

/**
 * Controls the minting portal WebView/iframe/redirect
 */
export class MintingPortal {
  private config: MintingPortalConfig;
  private walletAddress: string | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private isOpen = false;

  private onMintStarted?: (transactionHash: string) => void;
  private onMintCompleted?: (result: MintResult) => void;
  private onClose?: () => void;

  constructor(
    config: MintingPortalConfig,
    callbacks?: {
      onMintStarted?: (transactionHash: string) => void;
      onMintCompleted?: (result: MintResult) => void;
      onClose?: () => void;
    }
  ) {
    this.config = config;
    this.onMintStarted = callbacks?.onMintStarted;
    this.onMintCompleted = callbacks?.onMintCompleted;
    this.onClose = callbacks?.onClose;
  }

  /**
   * Set the connected wallet address for the portal
   */
  setWalletAddress(address: string): void {
    this.walletAddress = address;
  }

  /**
   * Open the minting portal
   */
  async open(): Promise<void> {
    if (this.isOpen) {
      return;
    }

    switch (this.config.mode) {
      case 'iframe':
        await this.openIframe();
        break;
      case 'redirect':
        this.openRedirect();
        break;
      case 'webview':
        await this.openWebview();
        break;
      default:
        throw this.createError('CONFIGURATION_ERROR', `Unknown portal mode: ${this.config.mode}`);
    }

    this.isOpen = true;
  }

  /**
   * Close the minting portal
   */
  close(): void {
    if (!this.isOpen) {
      return;
    }

    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }

    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    this.isOpen = false;
    this.config.onClose?.();
    this.onClose?.();
  }

  /**
   * Check if portal is currently open
   */
  isPortalOpen(): boolean {
    return this.isOpen;
  }

  /**
   * Build the portal URL with wallet address parameter
   */
  private buildPortalUrl(): string {
    const url = new URL(this.config.url);
    if (this.walletAddress) {
      url.searchParams.set('wallet', this.walletAddress);
    }
    return url.toString();
  }

  /**
   * Open portal as iframe
   */
  private async openIframe(): Promise<void> {
    if (typeof document === 'undefined') {
      throw this.createError(
        'CONFIGURATION_ERROR',
        'Iframe mode not supported in this environment'
      );
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'glwm-portal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    // Create container
    const container = document.createElement('div');
    container.style.cssText = `
      position: relative;
      width: ${this.config.width ?? 500}px;
      height: ${this.config.height ?? 700}px;
      max-width: 95vw;
      max-height: 95vh;
      background: white;
      border-radius: 12px;
      overflow: hidden;
    `;

    // Create close button
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      width: 30px;
      height: 30px;
      border: none;
      background: rgba(0, 0, 0, 0.1);
      border-radius: 50%;
      font-size: 20px;
      cursor: pointer;
      z-index: 1;
    `;
    closeButton.onclick = () => this.close();

    // Create iframe
    this.iframe = document.createElement('iframe');
    this.iframe.src = this.buildPortalUrl();
    this.iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
    `;

    // Set up message listener
    this.setupMessageListener();

    // Assemble and add to DOM
    container.appendChild(closeButton);
    container.appendChild(this.iframe);
    overlay.appendChild(container);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        this.close();
      }
    };

    // Store overlay reference for cleanup
    this.iframe.dataset['overlay'] = overlay.id;
  }

  /**
   * Open portal as redirect
   */
  private openRedirect(): void {
    if (typeof window === 'undefined') {
      throw this.createError(
        'CONFIGURATION_ERROR',
        'Redirect mode not supported in this environment'
      );
    }

    const url = new URL(this.buildPortalUrl());
    url.searchParams.set('returnUrl', window.location.href);

    window.location.href = url.toString();
  }

  /**
   * Open portal as webview (for native apps)
   */
  private async openWebview(): Promise<void> {
    // WebView implementation would depend on the platform (React Native, Electron, etc.)
    // For now, fall back to iframe in browser environment
    if (typeof document !== 'undefined') {
      return this.openIframe();
    }

    throw this.createError(
      'CONFIGURATION_ERROR',
      'WebView mode requires platform-specific implementation'
    );
  }

  /**
   * Set up message listener for portal communication
   */
  private setupMessageListener(): void {
    this.messageHandler = (event: MessageEvent) => {
      // Validate origin
      const portalOrigin = new URL(this.config.url).origin;
      if (event.origin !== portalOrigin) {
        return;
      }

      const message = event.data as PortalMessage;
      this.handlePortalMessage(message);
    };

    window.addEventListener('message', this.messageHandler);
  }

  /**
   * Handle messages from the portal
   */
  private handlePortalMessage(message: PortalMessage): void {
    switch (message.type) {
      case 'PORTAL_READY':
        // Portal is ready to receive wallet info
        this.sendToPortal({ type: 'WALLET_INFO', wallet: this.walletAddress });
        break;

      case 'MINT_STARTED':
        const txHash = (message.payload as { transactionHash: string }).transactionHash;
        this.onMintStarted?.(txHash);
        break;

      case 'MINT_COMPLETED':
        const result = message.payload as MintResult;
        this.onMintCompleted?.(result);
        if (this.config.autoCloseOnMint !== false) {
          this.close();
        }
        break;

      case 'MINT_FAILED':
        const error = message.payload as MintError;
        this.onMintCompleted?.({
          success: false,
          error,
        });
        break;

      case 'PORTAL_CLOSED':
        this.close();
        break;
    }
  }

  /**
   * Send a message to the portal iframe
   */
  private sendToPortal(message: unknown): void {
    if (this.iframe?.contentWindow) {
      const portalOrigin = new URL(this.config.url).origin;
      this.iframe.contentWindow.postMessage(message, portalOrigin);
    }
  }

  /**
   * Create a GLWM error
   */
  private createError(code: GLWMError['code'], message: string): GLWMError {
    return {
      code,
      message,
      recoverable: false,
    };
  }
}

/**
 * Fetch mint configuration from a contract or API
 */
export async function fetchMintConfig(
  _contractAddress: string,
  _rpcUrl: string
): Promise<MintConfig> {
  // This would typically query the mint contract for:
  // - Available editions
  // - Prices
  // - Supply limits
  // - Current availability

  throw new Error('fetchMintConfig not yet implemented');
}

/**
 * Execute a mint transaction
 */
export async function executeMint(
  _request: MintRequest,
  _contractAddress: string,
  _signer: unknown
): Promise<MintResult> {
  // This would:
  // 1. Build the mint transaction
  // 2. Send to the user's wallet for signing
  // 3. Wait for confirmation
  // 4. Return the result

  throw new Error('executeMint not yet implemented');
}
