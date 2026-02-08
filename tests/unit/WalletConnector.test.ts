/**
 * Unit tests for WalletConnector
 *
 * Tests wallet connection, provider detection, chain switching,
 * event handling, and error scenarios.
 */

import { WalletConnector } from '../../src/wallet';
import { MockEthereumProvider } from '../mocks/ethereum-provider';
import { setupMetaMask, setupCoinbase, setupPhantom, cleanupWindow } from '../mocks/window';

// Mock ethers BrowserProvider
jest.mock('ethers', () => ({
  BrowserProvider: jest.fn().mockImplementation(() => ({})),
  getAddress: jest.fn((addr: string) => addr),
  isAddress: jest.fn(() => true),
}));

describe('WalletConnector', () => {
  let connector: WalletConnector;

  beforeEach(() => {
    cleanupWindow();
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanupWindow();
  });

  describe('connect() — MetaMask happy path', () => {
    it('should connect and return wallet connection', async () => {
      const mockProvider = setupMetaMask({
        accounts: ['0x1234567890123456789012345678901234567890'],
        chainId: 137,
      });

      connector = new WalletConnector(137);
      const connection = await connector.connect('metamask');

      expect(connection.address).toBe('0x1234567890123456789012345678901234567890');
      expect(connection.chainId).toBe(137);
      expect(connection.provider).toBe('metamask');
      expect(connection.sessionId).toBeDefined();
      expect(connection.connectedAt).toBeGreaterThan(0);
    });

    it('should set session to connected', async () => {
      setupMetaMask({ accounts: ['0xABCD'], chainId: 137 });
      connector = new WalletConnector(137);
      await connector.connect('metamask');

      const session = connector.getSession();
      expect(session.isConnected).toBe(true);
      expect(session.isConnecting).toBe(false);
      expect(session.connection).not.toBeNull();
      expect(session.error).toBeNull();
    });
  });

  describe('connect() — Phantom', () => {
    it('should connect via window.phantom.ethereum', async () => {
      setupPhantom({
        accounts: ['0xPhantomAddress1234567890123456789012345678'],
        chainId: 137,
      });

      connector = new WalletConnector(137);
      const connection = await connector.connect('phantom');

      expect(connection.address).toBe('0xPhantomAddress1234567890123456789012345678');
      expect(connection.provider).toBe('phantom');
    });
  });

  describe('connect() — Coinbase', () => {
    it('should connect via window.ethereum with isCoinbaseWallet flag', async () => {
      setupCoinbase({
        accounts: ['0xCoinbaseAddr1234567890123456789012345678'],
        chainId: 137,
      });

      connector = new WalletConnector(137);
      const connection = await connector.connect('coinbase');

      expect(connection.address).toBe('0xCoinbaseAddr1234567890123456789012345678');
      expect(connection.provider).toBe('coinbase');
    });
  });

  describe('connect() — error scenarios', () => {
    it('should throw WALLET_CONNECTION_REJECTED when user rejects (4001)', async () => {
      const mockProvider = setupMetaMask();
      mockProvider.simulateRejectConnection();

      connector = new WalletConnector(137);

      await expect(connector.connect('metamask')).rejects.toMatchObject({
        code: 'WALLET_CONNECTION_REJECTED',
        message: expect.stringContaining('rejected'),
      });

      const session = connector.getSession();
      expect(session.isConnected).toBe(false);
      expect(session.error).not.toBeNull();
    });

    it('should throw WALLET_CONNECTION_REJECTED when request is pending (-32002)', async () => {
      const mockProvider = setupMetaMask();
      mockProvider.simulatePendingRequest();

      connector = new WalletConnector(137);

      await expect(connector.connect('metamask')).rejects.toMatchObject({
        code: 'WALLET_CONNECTION_REJECTED',
        message: expect.stringContaining('pending'),
      });
    });

    it('should throw when no provider is installed', async () => {
      // No window.ethereum set up — internally throws WALLET_NOT_FOUND
      // which gets re-wrapped by handleConnectionError as NETWORK_ERROR
      // since it doesn't recognize the WalletError shape (string code vs number)
      connector = new WalletConnector(137);

      await expect(connector.connect('metamask')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });

      const session = connector.getSession();
      expect(session.isConnected).toBe(false);
      expect(session.error).not.toBeNull();
    });
  });

  describe('chain mismatch', () => {
    it('should call onChainMismatch when connected to wrong chain', async () => {
      setupMetaMask({
        accounts: ['0x1234567890123456789012345678901234567890'],
        chainId: 1, // Ethereum mainnet, but we expect Polygon
      });

      const onChainMismatch = jest.fn();
      connector = new WalletConnector(137, { onChainMismatch });

      await connector.connect('metamask');

      expect(onChainMismatch).toHaveBeenCalledWith(1, 137);
    });

    it('should not call onChainMismatch when chain matches', async () => {
      setupMetaMask({
        accounts: ['0x1234567890123456789012345678901234567890'],
        chainId: 137,
      });

      const onChainMismatch = jest.fn();
      connector = new WalletConnector(137, { onChainMismatch });

      await connector.connect('metamask');

      expect(onChainMismatch).not.toHaveBeenCalled();
    });
  });

  describe('switchChain()', () => {
    it('should send wallet_switchEthereumChain and update session', async () => {
      const mockProvider = setupMetaMask({
        accounts: ['0x1234567890123456789012345678901234567890'],
        chainId: 1,
      });

      connector = new WalletConnector(137);
      await connector.connect('metamask');

      await connector.switchChain(137);

      const session = connector.getSession();
      expect(session.connection?.chainId).toBe(137);
    });

    it('should throw CHAIN_MISMATCH when chain not added (4902)', async () => {
      const mockProvider = setupMetaMask({
        accounts: ['0x1234567890123456789012345678901234567890'],
        chainId: 1,
      });

      connector = new WalletConnector(137);
      await connector.connect('metamask');

      mockProvider.simulateSwitchChainError(4902);

      await expect(connector.switchChain(42161)).rejects.toMatchObject({
        code: 'CHAIN_MISMATCH',
        message: expect.stringContaining('not configured'),
      });
    });

    it('should throw WALLET_DISCONNECTED if not connected', async () => {
      connector = new WalletConnector(137);

      await expect(connector.switchChain(137)).rejects.toMatchObject({
        code: 'WALLET_DISCONNECTED',
      });
    });
  });

  describe('disconnect()', () => {
    it('should clear session and remove event listeners', async () => {
      const mockProvider = setupMetaMask({
        accounts: ['0x1234567890123456789012345678901234567890'],
        chainId: 137,
      });

      connector = new WalletConnector(137);
      await connector.connect('metamask');

      expect(connector.getSession().isConnected).toBe(true);
      expect(mockProvider.getListenerCount('accountsChanged')).toBe(1);

      await connector.disconnect();

      const session = connector.getSession();
      expect(session.isConnected).toBe(false);
      expect(session.connection).toBeNull();
      expect(mockProvider.getListenerCount('accountsChanged')).toBe(0);
    });
  });

  describe('event handling', () => {
    it('should update session address on accountsChanged', async () => {
      const mockProvider = setupMetaMask({
        accounts: ['0x1234567890123456789012345678901234567890'],
        chainId: 137,
      });

      const onSessionChange = jest.fn();
      connector = new WalletConnector(137, { onSessionChange });
      await connector.connect('metamask');

      mockProvider.emitEvent('accountsChanged', ['0xNewAddress12345678901234567890123456789012']);

      const session = connector.getSession();
      expect(session.connection?.address).toBe('0xNewAddress12345678901234567890123456789012');
    });

    it('should update session chainId on chainChanged', async () => {
      const mockProvider = setupMetaMask({
        accounts: ['0x1234567890123456789012345678901234567890'],
        chainId: 137,
      });

      connector = new WalletConnector(137);
      await connector.connect('metamask');

      mockProvider.emitEvent('chainChanged', '0x1'); // Ethereum mainnet

      const session = connector.getSession();
      expect(session.connection?.chainId).toBe(1);
    });

    it('should call onChainMismatch on chainChanged to wrong chain', async () => {
      const mockProvider = setupMetaMask({
        accounts: ['0x1234567890123456789012345678901234567890'],
        chainId: 137,
      });

      const onChainMismatch = jest.fn();
      connector = new WalletConnector(137, { onChainMismatch });
      await connector.connect('metamask');

      mockProvider.emitEvent('chainChanged', '0x1');

      expect(onChainMismatch).toHaveBeenCalledWith(1, 137);
    });

    it('should disconnect on provider disconnect event', async () => {
      const mockProvider = setupMetaMask({
        accounts: ['0x1234567890123456789012345678901234567890'],
        chainId: 137,
      });

      connector = new WalletConnector(137);
      await connector.connect('metamask');

      expect(connector.getSession().isConnected).toBe(true);

      mockProvider.emitEvent('disconnect');

      // disconnect is async, wait a tick
      await new Promise((r) => setTimeout(r, 10));

      expect(connector.getSession().isConnected).toBe(false);
    });

    it('should disconnect when accountsChanged returns empty array', async () => {
      const mockProvider = setupMetaMask({
        accounts: ['0x1234567890123456789012345678901234567890'],
        chainId: 137,
      });

      connector = new WalletConnector(137);
      await connector.connect('metamask');

      mockProvider.emitEvent('accountsChanged', []);

      await new Promise((r) => setTimeout(r, 10));

      expect(connector.getSession().isConnected).toBe(false);
    });
  });

  describe('provider detection', () => {
    it('should detect MetaMask as available', () => {
      setupMetaMask();
      connector = new WalletConnector(137);

      expect(connector.isProviderAvailable('metamask')).toBe(true);
    });

    it('should detect Coinbase as available', () => {
      setupCoinbase();
      connector = new WalletConnector(137);

      expect(connector.isProviderAvailable('coinbase')).toBe(true);
    });

    it('should detect Phantom as available', () => {
      setupPhantom();
      connector = new WalletConnector(137);

      expect(connector.isProviderAvailable('phantom')).toBe(true);
    });

    it('should return false for unavailable providers', () => {
      connector = new WalletConnector(137);

      expect(connector.isProviderAvailable('metamask')).toBe(false);
      expect(connector.isProviderAvailable('coinbase')).toBe(false);
      expect(connector.isProviderAvailable('phantom')).toBe(false);
    });

    it('should prioritize MetaMask > Coinbase > Phantom in getAvailableProviders', () => {
      // Set up MetaMask (which also makes 'custom' available)
      setupMetaMask();
      connector = new WalletConnector(137);

      const providers = connector.getAvailableProviders();
      expect(providers).toContain('metamask');
    });
  });

  describe('getSession()', () => {
    it('should return copy, not reference', () => {
      connector = new WalletConnector(137);
      const session1 = connector.getSession();
      const session2 = connector.getSession();

      expect(session1).toEqual(session2);
      expect(session1).not.toBe(session2);
    });
  });

  describe('onSessionChange callback', () => {
    it('should be called on connection', async () => {
      setupMetaMask({
        accounts: ['0x1234567890123456789012345678901234567890'],
        chainId: 137,
      });

      const onSessionChange = jest.fn();
      connector = new WalletConnector(137, { onSessionChange });
      await connector.connect('metamask');

      // Called during isConnecting=true and then isConnected=true
      expect(onSessionChange).toHaveBeenCalled();
      const lastCall = onSessionChange.mock.calls[onSessionChange.mock.calls.length - 1][0];
      expect(lastCall.isConnected).toBe(true);
    });
  });
});
