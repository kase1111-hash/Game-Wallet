/**
 * Mock EIP-1193 Ethereum provider for testing wallet interactions
 */

export interface MockProviderOptions {
  accounts?: string[];
  chainId?: number;
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isPhantom?: boolean;
}

export class MockEthereumProvider {
  private accounts: string[];
  private chainId: number;
  private listeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();

  // Provider flags
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isPhantom?: boolean;

  // Error simulation
  private shouldRejectConnection = false;
  private pendingRequest = false;
  private switchChainError: number | null = null;

  constructor(options: MockProviderOptions = {}) {
    this.accounts = options.accounts ?? ['0x1234567890123456789012345678901234567890'];
    this.chainId = options.chainId ?? 137;
    this.isMetaMask = options.isMetaMask;
    this.isCoinbaseWallet = options.isCoinbaseWallet;
    this.isPhantom = options.isPhantom;
  }

  async request(args: { method: string; params?: unknown[] }): Promise<unknown> {
    switch (args.method) {
      case 'eth_requestAccounts': {
        if (this.shouldRejectConnection) {
          throw { code: 4001, message: 'User rejected the request' };
        }
        if (this.pendingRequest) {
          throw { code: -32002, message: 'Request already pending' };
        }
        return this.accounts;
      }

      case 'eth_chainId':
        return `0x${this.chainId.toString(16)}`;

      case 'wallet_switchEthereumChain': {
        if (this.switchChainError !== null) {
          throw { code: this.switchChainError, message: 'Chain switch failed' };
        }
        const params = args.params as [{ chainId: string }] | undefined;
        if (params?.[0]) {
          this.chainId = parseInt(params[0].chainId, 16);
        }
        return null;
      }

      default:
        throw new Error(`Unhandled method: ${args.method}`);
    }
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  removeListener(event: string, handler: (...args: unknown[]) => void): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }
  }

  // --- Test helpers ---

  simulateRejectConnection(): void {
    this.shouldRejectConnection = true;
  }

  simulatePendingRequest(): void {
    this.pendingRequest = true;
  }

  simulateSwitchChainError(code: number): void {
    this.switchChainError = code;
  }

  resetSimulations(): void {
    this.shouldRejectConnection = false;
    this.pendingRequest = false;
    this.switchChainError = null;
  }

  emitEvent(event: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event) ?? [];
    for (const handler of handlers) {
      handler(...args);
    }
  }

  getListenerCount(event: string): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  setAccounts(accounts: string[]): void {
    this.accounts = accounts;
  }

  setChainId(chainId: number): void {
    this.chainId = chainId;
  }
}
