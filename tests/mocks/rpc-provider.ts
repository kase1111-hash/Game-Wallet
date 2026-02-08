/**
 * Mock RPCProvider for testing modules that depend on blockchain RPC
 */

export class MockRPCProvider {
  private blockNumber = 12345678;
  private shouldFail = false;
  private shouldCallFail = false;
  private failureMessage = 'RPC call failed';
  private mockProvider: MockJsonRpcProvider;

  constructor() {
    this.mockProvider = new MockJsonRpcProvider();
  }

  async initialize(): Promise<void> {
    if (this.shouldFail) {
      throw { code: 'RPC_ERROR', message: 'Failed to connect to RPC provider', recoverable: true };
    }
  }

  getProvider(): MockJsonRpcProvider {
    return this.mockProvider;
  }

  async call<T>(fn: (provider: MockJsonRpcProvider) => Promise<T>): Promise<T> {
    if (this.shouldFail || this.shouldCallFail) {
      throw new Error(this.failureMessage);
    }
    return fn(this.mockProvider);
  }

  async getBlockNumber(): Promise<number> {
    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }
    return this.blockNumber;
  }

  async getChainId(): Promise<bigint> {
    return 137n;
  }

  // --- Test helpers ---

  setBlockNumber(n: number): void {
    this.blockNumber = n;
  }

  /** Make both call() and getBlockNumber() fail */
  simulateFailure(message = 'RPC call failed'): void {
    this.shouldFail = true;
    this.failureMessage = message;
  }

  /** Make only call() fail (getBlockNumber still works) */
  simulateCallFailure(message = 'RPC call failed'): void {
    this.shouldCallFail = true;
    this.failureMessage = message;
  }

  resetSimulations(): void {
    this.shouldFail = false;
    this.shouldCallFail = false;
    this.failureMessage = 'RPC call failed';
  }
}

export class MockJsonRpcProvider {
  async getBlockNumber(): Promise<number> {
    return 12345678;
  }

  async getNetwork(): Promise<{ chainId: bigint }> {
    return { chainId: 137n };
  }
}
