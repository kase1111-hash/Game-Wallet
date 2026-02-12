import type {
  MintingPortalConfig,
  MintResult,
  MintError,
  GLWMError,
} from '../types';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance().child('MintingPortal');

/**
 * Message types for portal communication
 */
interface PortalMessage {
  type: 'MINT_STARTED' | 'MINT_COMPLETED' | 'MINT_FAILED' | 'PORTAL_CLOSED' | 'PORTAL_READY';
  payload?: unknown;
}

/**
 * Type guard for mint started payload
 */
function isMintStartedPayload(payload: unknown): payload is { transactionHash: string } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'transactionHash' in payload &&
    typeof (payload as { transactionHash: unknown }).transactionHash === 'string'
  );
}

/**
 * Type guard for MintResult
 */
function isMintResult(payload: unknown): payload is MintResult {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'success' in payload &&
    typeof (payload as { success: unknown }).success === 'boolean'
  );
}

/**
 * Type guard for MintError
 */
function isMintError(payload: unknown): payload is MintError {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'code' in payload &&
    'message' in payload &&
    typeof (payload as { code: unknown }).code === 'string' &&
    typeof (payload as { message: unknown }).message === 'string'
  );
}

/**
 * Controls the minting portal iframe/redirect
 *
 * Supported modes:
 * - 'iframe': Opens portal in an iframe overlay (browser environments)
 * - 'redirect': Redirects to portal URL (browser environments)
 */
export class MintingPortal {
  private config: MintingPortalConfig;
  private walletAddress: string | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private overlay: HTMLDivElement | null = null;
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
      default:
        throw this.createError('CONFIGURATION_ERROR', `Unknown portal mode: ${this.config.mode}`);
    }

    this.isOpen = true;
    logger.debug(`Portal opened in ${this.config.mode} mode`);
  }

  /**
   * Close the minting portal
   */
  close(): void {
    if (!this.isOpen) {
      return;
    }

    // Remove overlay (which contains the iframe)
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }

    // Clear iframe reference
    this.iframe = null;

    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    this.isOpen = false;
    logger.debug('Portal closed');
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

    // Create overlay and store reference for proper cleanup
    this.overlay = document.createElement('div');
    this.overlay.id = 'glwm-portal-overlay';
    this.overlay.style.cssText = `
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
    this.overlay.appendChild(container);
    document.body.appendChild(this.overlay);

    // Close on overlay click
    this.overlay.onclick = (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    };
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
        if (isMintStartedPayload(message.payload)) {
          this.onMintStarted?.(message.payload.transactionHash);
        }
        break;

      case 'MINT_COMPLETED':
        if (isMintResult(message.payload)) {
          this.onMintCompleted?.(message.payload);
          if (this.config.autoCloseOnMint !== false) {
            this.close();
          }
        }
        break;

      case 'MINT_FAILED':
        if (isMintError(message.payload)) {
          this.onMintCompleted?.({
            success: false,
            error: message.payload,
          });
        }
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
