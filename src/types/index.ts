// ============================================
// WALLET TYPES
// ============================================

export type WalletProvider = 'metamask' | 'walletconnect' | 'phantom' | 'coinbase' | 'custom';

export type ChainId = number; // EIP-155 chain ID

export interface WalletConnection {
  address: string; // Checksummed wallet address (0x...)
  chainId: ChainId;
  provider: WalletProvider;
  connectedAt: number; // Unix timestamp
  sessionId: string; // UUID for session tracking
}

export interface WalletSession {
  connection: WalletConnection | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: WalletError | null;
}

// ============================================
// LICENSE TYPES
// ============================================

export interface LicenseNFT {
  tokenId: string; // BigNumber as string
  contractAddress: string; // License collection contract
  owner: string; // Current owner address
  metadata: LicenseMetadata;
  mintedAt: number; // Block timestamp
  transactionHash: string; // Mint transaction
}

export interface LicenseMetadata {
  name: string;
  description: string;
  image?: string; // IPFS URI or HTTP URL
  attributes: LicenseAttributes;
}

export interface LicenseAttributes {
  version: string; // "1.0", "2.0", etc.
  edition: LicenseEdition;
  mintedBy: string; // Original minter address
  gameId: string; // Unique game identifier
  soulbound?: boolean; // If true, non-transferable
  expiresAt?: number; // Optional expiration timestamp
  tier?: string; // "standard", "deluxe", "ultimate"
  crossGameAccess?: string[]; // Array of additional gameIds
}

export type LicenseEdition = 'standard' | 'deluxe' | 'ultimate' | 'founders' | 'limited';

export interface LicenseVerificationResult {
  isValid: boolean;
  license: LicenseNFT | null;
  checkedAt: number;
  blockNumber: number;
  reason?: LicenseInvalidReason;
}

export type LicenseInvalidReason =
  | 'no_license_found'
  | 'license_expired'
  | 'wrong_chain'
  | 'contract_paused'
  | 'verification_failed';

// ============================================
// MINTING TYPES
// ============================================

export interface MintConfig {
  contractAddress: string;
  chainId: ChainId;
  mintPrice: string; // Wei as string (BigNumber)
  maxSupply?: number;
  editionsAvailable: MintEdition[];
}

export interface MintEdition {
  edition: LicenseEdition;
  price: string; // Wei as string
  available: boolean;
  remaining?: number;
}

export interface MintRequest {
  edition: LicenseEdition;
  recipient: string; // Wallet address
  referralCode?: string; // Optional affiliate tracking
}

export interface MintResult {
  success: boolean;
  transactionHash?: string;
  tokenId?: string;
  error?: MintError;
}

// ============================================
// CONFIGURATION TYPES
// ============================================

export interface GLWMConfig {
  // Required
  licenseContract: string; // Contract address
  chainId: ChainId;

  // RPC Configuration
  rpcProvider: RPCConfig;

  // Minting Portal
  mintingPortal: MintingPortalConfig;

  // Optional Features
  cacheConfig?: CacheConfig;
  analytics?: AnalyticsConfig;

  // Callbacks
  onLicenseVerified?: (result: LicenseVerificationResult) => void;
  onWalletConnected?: (connection: WalletConnection) => void;
  onError?: (error: GLWMError) => void;
}

export interface RPCConfig {
  provider: 'alchemy' | 'infura' | 'custom';
  apiKey?: string;
  customUrl?: string;
  fallbackUrls?: string[];
  timeout?: number; // ms, default 30000
  retryAttempts?: number; // default 3
}

export interface MintingPortalConfig {
  url: string; // Minting page URL
  mode: 'webview' | 'redirect' | 'iframe';
  width?: number; // WebView dimensions
  height?: number;
  onClose?: () => void;
  autoCloseOnMint?: boolean; // default true
}

export interface CacheConfig {
  enabled: boolean;
  ttlSeconds: number; // Verification cache TTL
  storageKey: string; // Local storage key prefix
}

export interface AnalyticsConfig {
  enabled: boolean;
  trackingId?: string;
  customEvents?: boolean;
}

// ============================================
// ERROR TYPES
// ============================================

export type GLWMErrorCode =
  | 'WALLET_NOT_FOUND'
  | 'WALLET_CONNECTION_REJECTED'
  | 'WALLET_DISCONNECTED'
  | 'CHAIN_MISMATCH'
  | 'RPC_ERROR'
  | 'CONTRACT_ERROR'
  | 'VERIFICATION_FAILED'
  | 'MINT_FAILED'
  | 'MINT_REJECTED'
  | 'INSUFFICIENT_FUNDS'
  | 'USER_CANCELLED'
  | 'NETWORK_ERROR'
  | 'CONFIGURATION_ERROR';

export interface GLWMError {
  code: GLWMErrorCode;
  message: string;
  details?: unknown;
  recoverable: boolean;
  suggestedAction?: string;
}

export interface WalletError extends GLWMError {
  provider?: WalletProvider;
}

export interface MintError extends GLWMError {
  transactionHash?: string;
  revertReason?: string;
}

// ============================================
// STATE TYPES
// ============================================

export type GLWMState =
  | { status: 'uninitialized' }
  | { status: 'initializing' }
  | { status: 'awaiting_wallet' }
  | { status: 'connecting_wallet'; provider: WalletProvider }
  | { status: 'verifying_license'; address: string }
  | { status: 'license_valid'; license: LicenseNFT }
  | { status: 'no_license'; address: string }
  | { status: 'minting_portal_open' }
  | { status: 'minting_in_progress'; transactionHash: string }
  | { status: 'error'; error: GLWMError };

// State transitions
export type GLWMEvent =
  | { type: 'INITIALIZE'; config: GLWMConfig }
  | { type: 'CONNECT_WALLET'; provider: WalletProvider }
  | { type: 'WALLET_CONNECTED'; connection: WalletConnection }
  | { type: 'WALLET_DISCONNECTED' }
  | { type: 'VERIFY_LICENSE' }
  | { type: 'LICENSE_VERIFIED'; result: LicenseVerificationResult }
  | { type: 'OPEN_MINTING_PORTAL' }
  | { type: 'MINT_STARTED'; transactionHash: string }
  | { type: 'MINT_COMPLETED'; result: MintResult }
  | { type: 'CLOSE_MINTING_PORTAL' }
  | { type: 'ERROR'; error: GLWMError }
  | { type: 'RESET' };
