import { Contract } from 'ethers';
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

const logger = Logger.getInstance().child('LicenseVerifier');

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
   */
  async verifyLicense(address: string): Promise<LicenseVerificationResult> {
    if (!this.contract) {
      throw this.createError('CONTRACT_ERROR', 'License contract not initialized');
    }

    const contract = this.contract;
    const blockNumber = await this.rpcProvider.getBlockNumber();
    const checkedAt = Date.now();

    try {
      // Check if the address owns any tokens
      const balance = await this.rpcProvider.call(async () => {
        const balanceOf = contract.getFunction('balanceOf');
        return balanceOf(address);
      });

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
      const tokenId = await this.rpcProvider.call(async () => {
        const tokenOfOwnerByIndex = contract.getFunction('tokenOfOwnerByIndex');
        return tokenOfOwnerByIndex(address, 0);
      });

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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const errorDetails = error instanceof Error ? error.stack : String(error);

      // Log the error for debugging
      logger.error('License verification failed', {
        address,
        error: message,
        details: errorDetails,
      });

      // Handle specific contract errors
      if (message.includes('paused')) {
        logger.warn('Contract is paused', { address });
        return {
          isValid: false,
          license: null,
          checkedAt,
          blockNumber,
          reason: 'contract_paused',
        };
      }

      // Include error details in the result for better debugging
      return {
        isValid: false,
        license: null,
        checkedAt,
        blockNumber,
        reason: 'verification_failed',
        // Store error message in a way consumers can access for debugging
        ...(process.env.NODE_ENV !== 'production' && {
          _debug: { error: message, stack: errorDetails },
        }),
      };
    }
  }

  /**
   * Get all licenses owned by an address
   */
  async getAllLicenses(address: string): Promise<LicenseNFT[]> {
    if (!this.contract) {
      throw this.createError('CONTRACT_ERROR', 'License contract not initialized');
    }

    const contract = this.contract;
    const licenses: LicenseNFT[] = [];

    const balance = await this.rpcProvider.call(async () => {
      const balanceOf = contract.getFunction('balanceOf');
      return balanceOf(address);
    });

    for (let i = 0n; i < balance; i++) {
      const tokenId = await this.rpcProvider.call(async () => {
        const tokenOfOwnerByIndex = contract.getFunction('tokenOfOwnerByIndex');
        return tokenOfOwnerByIndex(address, i);
      });

      const license = await this.getLicenseById(tokenId.toString(), address);
      licenses.push(license);
    }

    return licenses;
  }

  /**
   * Get license details by token ID
   */
  async getLicenseById(tokenId: string, owner?: string): Promise<LicenseNFT> {
    if (!this.contract) {
      throw this.createError('CONTRACT_ERROR', 'License contract not initialized');
    }

    const contract = this.contract;

    // Get owner if not provided
    const licenseOwner =
      owner ??
      (await this.rpcProvider.call(async () => {
        const ownerOf = contract.getFunction('ownerOf');
        return ownerOf(tokenId);
      }));

    // Get token URI
    const tokenUri = await this.rpcProvider.call(async () => {
      const tokenURI = contract.getFunction('tokenURI');
      return tokenURI(tokenId);
    });

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
   * Fetch and parse token metadata from URI
   */
  private async fetchMetadata(tokenUri: string): Promise<LicenseMetadata> {
    try {
      // Handle IPFS URIs
      const url = this.resolveUri(tokenUri);

      logger.debug('Fetching metadata', { tokenUri, resolvedUrl: url });

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.status}`);
      }

      const data = await response.json();

      return {
        name: data.name ?? 'Unknown License',
        description: data.description ?? '',
        image: data.image,
        attributes: this.parseAttributes(data.attributes ?? []),
      };
    } catch (error) {
      // Log the error for debugging
      const message = error instanceof Error ? error.message : 'Unknown error';
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
