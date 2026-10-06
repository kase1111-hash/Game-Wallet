import { Contract } from 'ethers';
import type { JsonRpcProvider } from 'ethers';
import type { RPCProvider } from '../rpc';
import type {
  LicenseVerificationResult,
  LicenseNFT,
  LicenseMetadata,
  LicenseAttributes,
  LicenseEdition,
  GLWMError,
} from '../types';
import { Logger } from '../utils/Logger';
import { isValidAddress, summarizeError } from '../utils/helpers';

const logger = Logger.getInstance().child('LicenseVerifier');

// Shape of ERC-721 metadata JSON as served from tokenURI (all fields optional)
interface TokenMetadataJSON {
  name?: string;
  description?: string;
  image?: string;
  attributes?: Array<{ trait_type: string; value: unknown }>;
}

/**
 * Extract a message from an Error or a GLWMError-shaped object.
 * RPCProvider.call() throws plain GLWMError objects, not Error instances.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return 'Unknown error';
}

function isGLWMError(error: unknown): error is GLWMError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'recoverable' in error
  );
}

/**
 * A failed RPC read as a GLWMError: a GLWMError from the RPC layer as is (RPCProvider.call()
 * already wraps failures in one), anything else as RPC_ERROR with a JSON-safe summary of the
 * original as `details`
 */
function toRpcError(operation: string, error: unknown): GLWMError {
  if (isGLWMError(error)) {
    return error;
  }
  return {
    code: 'RPC_ERROR',
    message: `${operation} failed: ${getErrorMessage(error)}`,
    details: summarizeError(error),
    recoverable: true,
    suggestedAction: 'Try again. If it keeps failing, check the RPC provider configuration.',
  };
}

// Minimal ERC721 ABI for license verification
const LICENSE_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
];

/**
 * Handles on-chain license NFT verification
 */
export class LicenseVerifier {
  private rpcProvider: RPCProvider;
  private contractAddress: string;
  private contract: Contract | null = null;
  // The license contract bound to each fallback provider RPCProvider.call() tries
  private contractsByProvider = new WeakMap<JsonRpcProvider, Contract>();

  constructor(rpcProvider: RPCProvider, contractAddress: string) {
    this.rpcProvider = rpcProvider;
    this.contractAddress = contractAddress;
  }

  /**
   * Initialize the license contract
   */
  initialize(): void {
    const provider = this.rpcProvider.getProvider();
    this.contract = new Contract(this.contractAddress, LICENSE_ABI, provider);
  }

  /**
   * Verify if an address owns a valid license
   *
   * Resolves only with a verdict about the license: valid, `no_license_found` or
   * `license_expired`. A read that fails says nothing about the license, so it is thrown as a
   * GLWMError instead of being returned as a result: `RPC_ERROR` when an RPC call fails (block
   * number, balanceOf, tokenOfOwnerByIndex, tokenURI), `CONTRACT_ERROR` when the license contract
   * is paused. A metadata fetch that fails still falls back to default metadata.
   */
  async verifyLicense(address: string): Promise<LicenseVerificationResult> {
    if (!this.contract) {
      throw this.createError('CONTRACT_ERROR', 'License contract not initialized');
    }

    if (!isValidAddress(address)) {
      throw this.createError('CONFIGURATION_ERROR', `Invalid Ethereum address: ${address}`);
    }

    const blockNumber = await this.getBlockNumber();
    const checkedAt = Date.now();

    // Check if the address owns any tokens
    const balance = await this.callContract<bigint>('balanceOf', address);

    if (balance === 0n) {
      return {
        isValid: false,
        license: null,
        checkedAt,
        blockNumber,
        reason: 'no_license_found',
      };
    }

    // Get the first token owned by the address
    const tokenId = await this.callContract<bigint>('tokenOfOwnerByIndex', address, 0);

    // Fetch license details
    const license = await this.getLicenseById(tokenId.toString(), address);

    // Check if license is expired
    if (license.metadata.attributes.expiresAt) {
      const now = Math.floor(Date.now() / 1000);
      if (license.metadata.attributes.expiresAt < now) {
        return {
          isValid: false,
          license,
          checkedAt,
          blockNumber,
          reason: 'license_expired',
        };
      }
    }

    return {
      isValid: true,
      license,
      checkedAt,
      blockNumber,
    };
  }

  /**
   * Get all licenses owned by an address
   *
   * A failed read is thrown as in verifyLicense()
   */
  async getAllLicenses(address: string): Promise<LicenseNFT[]> {
    if (!this.contract) {
      throw this.createError('CONTRACT_ERROR', 'License contract not initialized');
    }

    const balance = await this.callContract<bigint>('balanceOf', address);

    // Fetch all token IDs first
    const tokenIds: bigint[] = [];
    for (let i = 0n; i < balance; i++) {
      tokenIds.push(await this.callContract<bigint>('tokenOfOwnerByIndex', address, i));
    }

    // Fetch license details in parallel
    const results = await Promise.all(
      tokenIds.map((tokenId) => this.getLicenseById(tokenId.toString(), address))
    );

    return results;
  }

  /**
   * Get license details by token ID
   *
   * A failed read is thrown as in verifyLicense()
   */
  async getLicenseById(tokenId: string, owner?: string): Promise<LicenseNFT> {
    if (!this.contract) {
      throw this.createError('CONTRACT_ERROR', 'License contract not initialized');
    }

    // Get owner if not provided
    const licenseOwner = owner ?? (await this.callContract<string>('ownerOf', tokenId));

    // Get token URI
    const tokenUri = await this.callContract<string>('tokenURI', tokenId);

    // Fetch and parse metadata
    const metadata = await this.fetchMetadata(tokenUri);

    return {
      tokenId,
      contractAddress: this.contractAddress,
      owner: licenseOwner,
      metadata,
      // Note: mintedAt and transactionHash require event querying and are omitted
    };
  }

  /**
   * Get the current block number. A failure is thrown as RPC_ERROR (see toRpcError()).
   */
  private async getBlockNumber(): Promise<number> {
    try {
      return await this.rpcProvider.getBlockNumber();
    } catch (error) {
      throw toRpcError('getBlockNumber', error);
    }
  }

  /** The license contract bound to `provider` (the primary's is the one from initialize()) */
  private contractOn(provider: JsonRpcProvider): Contract {
    if (provider === this.rpcProvider.getProvider() && this.contract) {
      return this.contract;
    }
    let contract = this.contractsByProvider.get(provider);
    if (!contract) {
      contract = new Contract(this.contractAddress, LICENSE_ABI, provider);
      this.contractsByProvider.set(provider, contract);
    }
    return contract;
  }

  /**
   * Call a view function of the license contract, with the RPC provider's retry and fallback.
   *
   * A failure is thrown, never turned into a verdict about the license: as CONTRACT_ERROR if the
   * call reverted because the contract is paused (with a JSON-safe summary of the revert as
   * `details`), else as RPC_ERROR (see toRpcError()).
   */
  private async callContract<T>(name: string, ...args: unknown[]): Promise<T> {
    try {
      // Each attempt reads through the provider RPCProvider.call() hands it, so a failing
      // primary RPC falls back to rpcProvider.fallbackUrls
      return await this.rpcProvider.call(
        async (provider) => (await this.contractOn(provider).getFunction(name)(...args)) as T
      );
    } catch (error) {
      const message = getErrorMessage(error);
      if (message.includes('paused')) {
        logger.warn('License contract is paused', { call: name });
        throw {
          code: 'CONTRACT_ERROR',
          message: `License contract is paused: ${message}`,
          // The same JSON-safe summary of the underlying error as an RPC_ERROR's details
          details: isGLWMError(error)
            ? (error.details ?? summarizeError(error))
            : summarizeError(error),
          recoverable: true,
          suggestedAction: 'Try again once the license contract is unpaused.',
        } satisfies GLWMError;
      }
      throw toRpcError(name, error);
    }
  }

  /**
   * Fetch and parse token metadata from URI
   */
  private async fetchMetadata(tokenUri: string): Promise<LicenseMetadata> {
    try {
      // Handle IPFS URIs
      const url = this.resolveUri(tokenUri);

      logger.debug('Fetching metadata', { tokenUri, resolvedUrl: url });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.status}`);
      }

      const data = (await response.json()) as TokenMetadataJSON;

      return {
        name: data.name ?? 'Unknown License',
        description: data.description ?? '',
        image: data.image,
        attributes: this.parseAttributes(data.attributes ?? []),
      };
    } catch (error) {
      // Log the error for debugging
      const message = getErrorMessage(error);
      logger.warn('Failed to fetch metadata, using defaults', {
        tokenUri,
        error: message,
      });

      // Return default metadata if fetch fails
      return {
        name: 'Game License',
        description: 'Game license NFT',
        attributes: {
          version: '1.0',
          edition: 'standard' as LicenseEdition,
          mintedBy: '',
          gameId: '',
        },
      };
    }
  }

  /**
   * Resolve IPFS or other special URIs to fetchable URLs
   */
  private resolveUri(uri: string): string {
    if (uri.startsWith('ipfs://')) {
      return uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
    }
    if (uri.startsWith('ar://')) {
      return uri.replace('ar://', 'https://arweave.net/');
    }
    return uri;
  }

  /**
   * Parse NFT attributes array into LicenseAttributes
   */
  private parseAttributes(
    attributes: Array<{ trait_type: string; value: unknown }>
  ): LicenseAttributes {
    const result: LicenseAttributes = {
      version: '1.0',
      edition: 'standard',
      mintedBy: '',
      gameId: '',
    };

    for (const attr of attributes) {
      switch (attr.trait_type.toLowerCase()) {
        case 'version':
          result.version = String(attr.value);
          break;
        case 'edition':
          result.edition = attr.value as LicenseEdition;
          break;
        case 'minted_by':
        case 'mintedby':
          result.mintedBy = String(attr.value);
          break;
        case 'game_id':
        case 'gameid':
          result.gameId = String(attr.value);
          break;
        case 'soulbound':
          result.soulbound = Boolean(attr.value);
          break;
        case 'expires_at':
        case 'expiresat':
          result.expiresAt = Number(attr.value);
          break;
        case 'tier':
          result.tier = String(attr.value);
          break;
        case 'cross_game_access':
        case 'crossgameaccess':
          result.crossGameAccess = Array.isArray(attr.value)
            ? attr.value.map(String)
            : [String(attr.value)];
          break;
      }
    }

    return result;
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
