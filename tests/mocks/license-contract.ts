/**
 * Mock ERC-721 license contract for testing LicenseVerifier
 */

export interface MockContractOptions {
  balances?: Record<string, bigint>;
  tokenIds?: Record<string, bigint[]>;
  owners?: Record<string, string>;
  tokenURIs?: Record<string, string>;
  isPaused?: boolean;
}

export class MockLicenseContract {
  private balances: Record<string, bigint>;
  private tokenIds: Record<string, bigint[]>;
  private owners: Record<string, string>;
  private tokenURIs: Record<string, string>;
  private isPaused: boolean;

  constructor(options: MockContractOptions = {}) {
    this.balances = options.balances ?? {};
    this.tokenIds = options.tokenIds ?? {};
    this.owners = options.owners ?? {};
    this.tokenURIs = options.tokenURIs ?? {};
    this.isPaused = options.isPaused ?? false;
  }

  getFunction(name: string): (...args: unknown[]) => Promise<unknown> {
    switch (name) {
      case 'balanceOf':
        return async (address: unknown) => {
          if (this.isPaused) throw new Error('Execution reverted: contract is paused');
          return this.balances[address as string] ?? 0n;
        };

      case 'tokenOfOwnerByIndex':
        return async (address: unknown, index: unknown) => {
          if (this.isPaused) throw new Error('Execution reverted: contract is paused');
          const tokens = this.tokenIds[address as string] ?? [];
          const idx = Number(index);
          if (idx >= tokens.length) throw new Error('ERC721Enumerable: owner index out of bounds');
          return tokens[idx];
        };

      case 'ownerOf':
        return async (tokenId: unknown) => {
          if (this.isPaused) throw new Error('Execution reverted: contract is paused');
          const owner = this.owners[String(tokenId)];
          if (!owner) throw new Error('ERC721: invalid token ID');
          return owner;
        };

      case 'tokenURI':
        return async (tokenId: unknown) => {
          if (this.isPaused) throw new Error('Execution reverted: contract is paused');
          const uri = this.tokenURIs[String(tokenId)];
          if (!uri) throw new Error('ERC721: invalid token ID');
          return uri;
        };

      default:
        return async () => {
          throw new Error(`Unknown function: ${name}`);
        };
    }
  }

  // --- Test helpers ---

  setBalance(address: string, balance: bigint): void {
    this.balances[address] = balance;
  }

  setTokenIds(address: string, tokens: bigint[]): void {
    this.tokenIds[address] = tokens;
  }

  setOwner(tokenId: string, owner: string): void {
    this.owners[tokenId] = owner;
  }

  setTokenURI(tokenId: string, uri: string): void {
    this.tokenURIs[tokenId] = uri;
  }

  setPaused(paused: boolean): void {
    this.isPaused = paused;
  }
}

/**
 * Standard metadata JSON for testing
 */
export function createMockMetadata(overrides: Partial<{
  name: string;
  description: string;
  image: string;
  attributes: Array<{ trait_type: string; value: unknown }>;
}> = {}) {
  return {
    name: overrides.name ?? 'Game License #1',
    description: overrides.description ?? 'A valid game license NFT',
    image: overrides.image ?? 'ipfs://QmTest123/image.png',
    attributes: overrides.attributes ?? [
      { trait_type: 'version', value: '2.0' },
      { trait_type: 'edition', value: 'deluxe' },
      { trait_type: 'minted_by', value: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12' },
      { trait_type: 'game_id', value: 'my-game-001' },
      { trait_type: 'soulbound', value: false },
      { trait_type: 'tier', value: 'premium' },
    ],
  };
}
