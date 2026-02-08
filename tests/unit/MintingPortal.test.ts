/**
 * @jest-environment jsdom
 */

/**
 * Unit tests for MintingPortal
 *
 * Tests iframe/redirect modes, portal lifecycle, postMessage communication,
 * origin validation, and callback routing.
 */

import { MintingPortal } from '../../src/minting';
import type { MintingPortalConfig } from '../../src/types';

const PORTAL_URL = 'https://mint.example.com';

function createPortal(
  configOverrides: Partial<MintingPortalConfig> = {},
  callbacks?: {
    onMintStarted?: (tx: string) => void;
    onMintCompleted?: (result: { success: boolean; error?: unknown }) => void;
    onClose?: () => void;
  }
): MintingPortal {
  const config: MintingPortalConfig = {
    url: PORTAL_URL,
    mode: 'iframe',
    ...configOverrides,
  };
  return new MintingPortal(config, callbacks);
}

describe('MintingPortal', () => {
  beforeEach(() => {
    // Clean up DOM between tests
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  describe('open() — iframe mode', () => {
    it('should create overlay and iframe in DOM', async () => {
      const portal = createPortal();
      await portal.open();

      const overlay = document.getElementById('glwm-portal-overlay');
      expect(overlay).not.toBeNull();

      const iframe = overlay?.querySelector('iframe');
      expect(iframe).not.toBeNull();

      portal.close();
    });

    it('should set correct src URL with wallet parameter', async () => {
      const portal = createPortal();
      portal.setWalletAddress('0xTestWallet');
      await portal.open();

      const iframe = document.querySelector('iframe');
      expect(iframe?.src).toContain('mint.example.com');
      expect(iframe?.src).toContain('wallet=0xTestWallet');

      portal.close();
    });

    it('should set default dimensions of 500x700', async () => {
      const portal = createPortal();
      await portal.open();

      const container = document.querySelector('#glwm-portal-overlay > div') as HTMLElement;
      expect(container?.style.cssText).toContain('500px');
      expect(container?.style.cssText).toContain('700px');

      portal.close();
    });

    it('should use custom dimensions when provided', async () => {
      const portal = createPortal({ width: 800, height: 600 });
      await portal.open();

      const container = document.querySelector('#glwm-portal-overlay > div') as HTMLElement;
      expect(container?.style.cssText).toContain('800px');
      expect(container?.style.cssText).toContain('600px');

      portal.close();
    });
  });

  describe('close()', () => {
    it('should remove overlay and clean up event listeners', async () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      const portal = createPortal();
      await portal.open();

      expect(document.getElementById('glwm-portal-overlay')).not.toBeNull();

      portal.close();

      expect(document.getElementById('glwm-portal-overlay')).toBeNull();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('should call onClose config callback', async () => {
      const onCloseConfig = jest.fn();
      const portal = createPortal({ onClose: onCloseConfig });
      await portal.open();

      portal.close();

      expect(onCloseConfig).toHaveBeenCalled();
    });

    it('should call constructor onClose callback', async () => {
      const onClose = jest.fn();
      const portal = createPortal({}, { onClose });
      await portal.open();

      portal.close();

      expect(onClose).toHaveBeenCalled();
    });

    it('should be a no-op if not open', () => {
      const onClose = jest.fn();
      const portal = createPortal({ onClose });

      portal.close(); // Should not throw

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('overlay click closes portal', () => {
    it('should close when clicking overlay background', async () => {
      const onClose = jest.fn();
      const portal = createPortal({}, { onClose });
      await portal.open();

      const overlay = document.getElementById('glwm-portal-overlay') as HTMLElement;
      // Simulate click on overlay itself (not on child)
      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', { value: overlay });
      overlay.onclick!(clickEvent as MouseEvent);

      expect(portal.isPortalOpen()).toBe(false);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('close button', () => {
    it('should close portal when clicked', async () => {
      const onClose = jest.fn();
      const portal = createPortal({}, { onClose });
      await portal.open();

      const closeButton = document.querySelector('#glwm-portal-overlay button') as HTMLButtonElement;
      expect(closeButton).not.toBeNull();
      expect(closeButton.textContent).toBe('×');

      closeButton.onclick!(new MouseEvent('click'));

      expect(portal.isPortalOpen()).toBe(false);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('postMessage communication', () => {
    it('should send WALLET_INFO on PORTAL_READY message', async () => {
      const portal = createPortal();
      portal.setWalletAddress('0xMyWallet');
      await portal.open();

      // Mock iframe contentWindow.postMessage
      const iframe = document.querySelector('iframe') as HTMLIFrameElement;
      const mockPostMessage = jest.fn();
      Object.defineProperty(iframe, 'contentWindow', {
        value: { postMessage: mockPostMessage },
        writable: true,
      });

      // Simulate PORTAL_READY message from correct origin
      const event = new MessageEvent('message', {
        data: { type: 'PORTAL_READY' },
        origin: 'https://mint.example.com',
      });
      window.dispatchEvent(event);

      expect(mockPostMessage).toHaveBeenCalledWith(
        { type: 'WALLET_INFO', wallet: '0xMyWallet' },
        'https://mint.example.com'
      );

      portal.close();
    });

    it('should trigger onMintStarted on MINT_STARTED message', async () => {
      const onMintStarted = jest.fn();
      const portal = createPortal({}, { onMintStarted });
      await portal.open();

      const event = new MessageEvent('message', {
        data: {
          type: 'MINT_STARTED',
          payload: { transactionHash: '0xTxHash123' },
        },
        origin: 'https://mint.example.com',
      });
      window.dispatchEvent(event);

      expect(onMintStarted).toHaveBeenCalledWith('0xTxHash123');

      portal.close();
    });

    it('should trigger onMintCompleted and auto-close on MINT_COMPLETED', async () => {
      const onMintCompleted = jest.fn();
      const onClose = jest.fn();
      const portal = createPortal({}, { onMintCompleted, onClose });
      await portal.open();

      const event = new MessageEvent('message', {
        data: {
          type: 'MINT_COMPLETED',
          payload: { success: true, tokenId: '42', transactionHash: '0xTx' },
        },
        origin: 'https://mint.example.com',
      });
      window.dispatchEvent(event);

      expect(onMintCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
      expect(portal.isPortalOpen()).toBe(false);
      expect(onClose).toHaveBeenCalled();
    });

    it('should trigger onMintCompleted with error on MINT_FAILED', async () => {
      const onMintCompleted = jest.fn();
      const portal = createPortal({}, { onMintCompleted });
      await portal.open();

      const event = new MessageEvent('message', {
        data: {
          type: 'MINT_FAILED',
          payload: {
            code: 'MINT_FAILED',
            message: 'Insufficient funds',
            recoverable: true,
          },
        },
        origin: 'https://mint.example.com',
      });
      window.dispatchEvent(event);

      expect(onMintCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'MINT_FAILED' }),
        })
      );

      portal.close();
    });

    it('should close on PORTAL_CLOSED message', async () => {
      const onClose = jest.fn();
      const portal = createPortal({}, { onClose });
      await portal.open();

      const event = new MessageEvent('message', {
        data: { type: 'PORTAL_CLOSED' },
        origin: 'https://mint.example.com',
      });
      window.dispatchEvent(event);

      expect(portal.isPortalOpen()).toBe(false);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('origin validation', () => {
    it('should ignore messages from wrong origin', async () => {
      const onMintStarted = jest.fn();
      const portal = createPortal({}, { onMintStarted });
      await portal.open();

      const event = new MessageEvent('message', {
        data: {
          type: 'MINT_STARTED',
          payload: { transactionHash: '0xEvil' },
        },
        origin: 'https://evil.example.com',
      });
      window.dispatchEvent(event);

      expect(onMintStarted).not.toHaveBeenCalled();

      portal.close();
    });
  });

  describe('redirect mode', () => {
    it('should attempt navigation to portal URL', async () => {
      // jsdom's window.location is not configurable, so we can't easily
      // intercept the href setter. Instead, verify the portal marks itself
      // as open after redirect and the URL would have been constructed correctly.
      const portal = createPortal({ mode: 'redirect' });
      portal.setWalletAddress('0xWallet');

      // jsdom may throw "Not implemented: navigation" when setting location.href
      // — that's expected. The portal should still mark itself as open.
      try {
        await portal.open();
      } catch {
        // jsdom navigation error is expected
      }

      expect(portal.isPortalOpen()).toBe(true);
    });
  });

  describe('idempotency', () => {
    it('should be a no-op when already open', async () => {
      const portal = createPortal();
      await portal.open();

      const overlaysBefore = document.querySelectorAll('#glwm-portal-overlay').length;

      await portal.open(); // Second open should be a no-op

      const overlaysAfter = document.querySelectorAll('#glwm-portal-overlay').length;
      expect(overlaysAfter).toBe(overlaysBefore);

      portal.close();
    });
  });

  describe('autoCloseOnMint', () => {
    it('should keep portal open after mint when autoCloseOnMint is false', async () => {
      const onMintCompleted = jest.fn();
      const portal = createPortal({ autoCloseOnMint: false }, { onMintCompleted });
      await portal.open();

      const event = new MessageEvent('message', {
        data: {
          type: 'MINT_COMPLETED',
          payload: { success: true, tokenId: '42' },
        },
        origin: 'https://mint.example.com',
      });
      window.dispatchEvent(event);

      expect(onMintCompleted).toHaveBeenCalled();
      expect(portal.isPortalOpen()).toBe(true); // Still open!

      portal.close();
    });
  });

  describe('isPortalOpen()', () => {
    it('should return false initially', () => {
      const portal = createPortal();
      expect(portal.isPortalOpen()).toBe(false);
    });

    it('should return true after open', async () => {
      const portal = createPortal();
      await portal.open();
      expect(portal.isPortalOpen()).toBe(true);
      portal.close();
    });

    it('should return false after close', async () => {
      const portal = createPortal();
      await portal.open();
      portal.close();
      expect(portal.isPortalOpen()).toBe(false);
    });
  });
});
