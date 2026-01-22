# Game License Wallet Module (GLWM) — Technical Specification v1.0

## Executive Summary

GLWM is a plug-and-play SDK enabling game developers to implement NFT-based license verification. The module handles wallet authentication, on-chain license verification, and seamless minting flow when no license exists.

---

## Quick Links

| Resource | Description |
|----------|-------------|
| [Quick Start Guide](docs/quickstart.md) | Get started with GLWM SDK |
| [API Reference](docs/api.md) | Complete API documentation |
| [FAQ](docs/FAQ.md) | Frequently asked questions |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and solutions |
| [Contributing](CONTRIBUTING.md) | How to contribute to GLWM |
| [Support](SUPPORT.md) | Get help and support |
| [Security](SECURITY.md) | Security policy and reporting |
| [Changelog](CHANGELOG.md) | Version history |

---

## 1. System Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         GAME APPLICATION                            │
├─────────────────────────────────────────────────────────────────────┤
│                           GLWM SDK                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │  Wallet Auth    │  │  License         │  │  Minting Portal   │  │
│  │  Layer          │──│  Verification    │──│  Controller       │  │
│  │                 │  │  Layer           │  │                   │  │
│  └────────┬────────┘  └────────┬─────────┘  └─────────┬─────────┘  │
│           │                    │                      │             │
│  ┌────────▼────────────────────▼──────────────────────▼─────────┐  │
│  │                    RPC Provider Abstraction                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │  Alchemy  │   │  Infura   │   │  Custom   │
            │    RPC    │   │    RPC    │   │    RPC    │
            └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
                  └───────────────┼───────────────┘
                                  ▼
                    ┌─────────────────────────┐
                    │       BLOCKCHAIN        │
                    │  (Ethereum/Polygon/etc) │
                    └─────────────────────────┘
```

### 1.2 Component Breakdown

| Component | Responsibility | Dependencies |
|-----------|---------------|--------------|
| WalletAuthLayer | Wallet connection, session management | ethers.js, WalletConnect SDK |
| LicenseVerificationLayer | On-chain NFT ownership queries | RPC Provider |
| MintingPortalController | WebView orchestration, mint transaction handling | React (web), platform WebView |
| RPCProviderAbstraction | Unified interface for multiple RPC providers | Provider SDKs |
| EventBus | Cross-component communication | None (internal) |
| LocalCache | Wallet address persistence, verification caching | Platform storage API |

---

## 2. Data Models

### 2.1 Core Types

```typescript
// ============================================
// WALLET TYPES
// ============================================

type WalletProvider = 'metamask' | 'walletconnect' | 'phantom' | 'coinbase' | 'custom';

type ChainId = number; // EIP-155 chain ID

interface WalletConnection {
  address: string;           // Checksummed wallet address (0x...)
  chainId: ChainId;
  provider: WalletProvider;
  connectedAt: number;       // Unix timestamp
  sessionId: string;         // UUID for session tracking
}

interface WalletSession {
  connection: WalletConnection | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: WalletError | null;
}

// ============================================
// LICENSE TYPES
// ============================================

interface LicenseNFT {
  tokenId: string;           // BigNumber as string
  contractAddress: string;   // License collection contract
  owner: string;             // Current owner address
  metadata: LicenseMetadata;
  mintedAt: number;          // Block timestamp
  transactionHash: string;   // Mint transaction
}

interface LicenseMetadata {
  name: string;
  description: string;
  image?: string;            // IPFS URI or HTTP URL
  attributes: LicenseAttributes;
}

interface LicenseAttributes {
  version: string;           // "1.0", "2.0", etc.
  edition: LicenseEdition;
  mintedBy: string;          // Original minter address
  gameId: string;            // Unique game identifier
  soulbound?: boolean;       // If true, non-transferable
  expiresAt?: number;        // Optional expiration timestamp
  tier?: string;             // "standard", "deluxe", "ultimate"
  crossGameAccess?: string[];// Array of additional gameIds
}

type LicenseEdition = 'standard' | 'deluxe' | 'ultimate' | 'founders' | 'limited';

interface LicenseVerificationResult {
  isValid: boolean;
  license: LicenseNFT | null;
  checkedAt: number;
  blockNumber: number;
  reason?: LicenseInvalidReason;
}

type LicenseInvalidReason = 
  | 'no_license_found'
  | 'license_expired'
  | 'wrong_chain'
  | 'contract_paused'
  | 'verification_failed';

// ============================================
// MINTING TYPES
// ============================================

interface MintConfig {
  contractAddress: string;
  chainId: ChainId;
  mintPrice: string;         // Wei as string (BigNumber)
  maxSupply?: number;
  editionsAvailable: MintEdition[];
}

interface MintEdition {
  edition: LicenseEdition;
  price: string;             // Wei as string
  available: boolean;
  remaining?: number;
}

interface MintRequest {
  edition: LicenseEdition;
  recipient: string;         // Wallet address
  referralCode?: string;     // Optional affiliate tracking
}

interface MintResult {
  success: boolean;
  transactionHash?: string;
  tokenId?: string;
  error?: MintError;
}

// ============================================
// CONFIGURATION TYPES
// ============================================

interface GLWMConfig {
  // Required
  licenseContract: string;   // Contract address
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

interface RPCConfig {
  provider: 'alchemy' | 'infura' | 'custom';
  apiKey?: string;
  customUrl?: string;
  fallbackUrls?: string[];
  timeout?: number;          // ms, default 30000
  retryAttempts?: number;    // default 3
}

interface MintingPortalConfig {
  url: string;               // Minting page URL
  mode: 'webview' | 'redirect' | 'iframe';
  width?: number;            // WebView dimensions
  height?: number;
  onClose?: () => void;
  autoCloseOnMint?: boolean; // default true
}

interface CacheConfig {
  enabled: boolean;
  ttlSeconds: number;        // Verification cache TTL
  storageKey: string;        // Local storage key prefix
}

// ============================================
// ERROR TYPES
// ============================================

type GLWMErrorCode = 
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

interface GLWMError {
  code: GLWMErrorCode;
  message: string;
  details?: unknown;
  recoverable: boolean;
  suggestedAction?: string;
}

interface WalletError extends GLWMError {
  provider?: WalletProvider;
}

interface MintError extends GLWMError {
  transactionHash?: string;
  revertReason?: string;
}
```

### 2.2 State Machine

```typescript
type GLWMState = 
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
type GLWMEvent =
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
```

---

## 3. SDK Public Interface

### 3.1 Core SDK Class

```typescript
/**
 * Main entry point for GLWM SDK
 * 
 * @example
 * ```typescript
 * const glwm = new GLWM({
 *   licenseContract: '0x1234...',
 *   chainId: 137,
 *   rpcProvider: { provider: 'alchemy', apiKey: 'xxx' },
 *   mintingPortal: { url: 'https://mint.mygame.com', mode: 'webview' }
 * });
 * 
 * await glwm.initialize();
 * const result = await glwm.verifyAndPlay();
 * ```
 */
class GLWM {
  // ============================================
  // LIFECYCLE
  // ============================================
  
  /**
   * Initialize the SDK with configuration
   * Must be called before any other methods
   */
  async initialize(): Promise<void>;
  
  /**
   * Clean up resources, disconnect wallet, close portals
   */
  async dispose(): Promise<void>;
  
  // ============================================
  // MAIN WORKFLOW
  // ============================================
  
  /**
   * Primary method: Verify license and start game if valid
   * Handles the full flow: wallet → verify → mint if needed → verify again
   * 
   * @returns Promise resolving when game should start
   * @throws GLWMError if flow cannot complete
   */
  async verifyAndPlay(): Promise<LicenseVerificationResult>;
  
  // ============================================
  // WALLET METHODS
  // ============================================
  
  /**
   * Connect to user's wallet
   * Shows wallet selection UI if multiple providers available
   * 
   * @param preferredProvider - Optional preferred wallet provider
   */
  async connectWallet(preferredProvider?: WalletProvider): Promise<WalletConnection>;
  
  /**
   * Disconnect current wallet session
   */
  async disconnectWallet(): Promise<void>;
  
  /**
   * Get current wallet connection status
   */
  getWalletSession(): WalletSession;
  
  /**
   * Check if a specific wallet provider is available
   */
  isProviderAvailable(provider: WalletProvider): boolean;
  
  /**
   * Get list of available wallet providers
   */
  getAvailableProviders(): WalletProvider[];
  
  /**
   * Request chain switch if connected to wrong network
   */
  async switchChain(chainId: ChainId): Promise<void>;
  
  // ============================================
  // LICENSE METHODS
  // ============================================
  
  /**
   * Verify license ownership for connected wallet
   * Uses cache if available and not expired
   */
  async verifyLicense(): Promise<LicenseVerificationResult>;
  
  /**
   * Force fresh verification, bypassing cache
   */
  async verifyLicenseFresh(): Promise<LicenseVerificationResult>;
  
  /**
   * Check license for arbitrary address (read-only)
   */
  async checkLicenseForAddress(address: string): Promise<LicenseVerificationResult>;
  
  /**
   * Get full license details including metadata
   */
  async getLicenseDetails(tokenId: string): Promise<LicenseNFT>;
  
  /**
   * Get all licenses owned by connected wallet
   * (For multi-license scenarios)
   */
  async getAllLicenses(): Promise<LicenseNFT[]>;
  
  // ============================================
  // MINTING METHODS
  // ============================================
  
  /**
   * Open the minting portal
   */
  async openMintingPortal(): Promise<void>;
  
  /**
   * Close the minting portal
   */
  closeMintingPortal(): void;
  
  /**
   * Get current mint configuration and pricing
   */
  async getMintConfig(): Promise<MintConfig>;
  
  /**
   * Programmatically initiate mint (advanced usage)
   * Most implementations should use openMintingPortal() instead
   */
  async mint(request: MintRequest): Promise<MintResult>;
  
  // ============================================
  // STATE & EVENTS
  // ============================================
  
  /**
   * Get current SDK state
   */
  getState(): GLWMState;
  
  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: GLWMState) => void): () => void;
  
  /**
   * Subscribe to specific events
   */
  on<T extends GLWMEvent['type']>(
    event: T,
    handler: (payload: Extract<GLWMEvent, { type: T }>) => void
  ): () => void;
  
  // ============================================
  // UTILITIES
  // ============================================
  
  /**
   * Clear local cache
   */
  clearCache(): void;
  
  /**
   * Get SDK version
   */
  static getVersion(): string;
  
  /**
   * Validate configuration without initializing
   */
  static validateConfig(config: GLWMConfig): { valid: boolean; errors: string[] };
}
```

### 3.2 React Hooks (Optional Package: @glwm/react)

```typescript
/**
 * Main hook for GLWM integration in React
 */
function useGLWM(): {
  // State
  state: GLWMState;
  walletSession: WalletSession;
  license: LicenseNFT | null;
  isLoading: boolean;
  error: GLWMError | null;
  
  // Actions
  connect: (provider?: WalletProvider) => Promise<void>;
  disconnect: () => Promise<void>;
  verify: () => Promise<LicenseVerificationResult>;
  openMintPortal: () => Promise<void>;
  verifyAndPlay: () => Promise<LicenseVerificationResult>;
};

/**
 * Provider component for GLWM context
 */
function GLWMProvider(props: {
  config: GLWMConfig;
  children: React.ReactNode;
}): JSX.Element;

/**
 * Wallet connection button component
 */
function WalletConnectButton(props: {
  onConnect?: (connection: WalletConnection) => void;
  onError?: (error: WalletError) => void;
  className?: string;
}): JSX.Element;

/**
 * License status display component
 */
function LicenseStatus(props: {
  showDetails?: boolean;
  onMintClick?: () => void;
  className?: string;
}): JSX.Element;
```

### 3.3 Unity SDK Interface (C#)

```csharp
namespace GLWM
{
    /// <summary>
    /// Main SDK interface for Unity integration
    /// </summary>
    public class GLWMClient : MonoBehaviour
    {
        // Events
        public event Action<WalletConnection> OnWalletConnected;
        public event Action OnWalletDisconnected;
        public event Action<LicenseVerificationResult> OnLicenseVerified;
        public event Action<MintResult> OnMintCompleted;
        public event Action<GLWMError> OnError;
        
        // Configuration
        public void Initialize(GLWMConfig config);
        public void Dispose();
        
        // Main workflow
        public async Task<LicenseVerificationResult> VerifyAndPlayAsync();
        
        // Wallet
        public async Task<WalletConnection> ConnectWalletAsync(WalletProvider? preferred = null);
        public async Task DisconnectWalletAsync();
        public WalletSession GetWalletSession();
        
        // License
        public async Task<LicenseVerificationResult> VerifyLicenseAsync();
        public async Task<LicenseNFT> GetLicenseDetailsAsync(string tokenId);
        
        // Minting
        public void OpenMintingPortal();
        public void CloseMintingPortal();
        public async Task<MintConfig> GetMintConfigAsync();
        
        // State
        public GLWMState CurrentState { get; }
    }
}
```

### 3.4 Unreal Engine Interface (C++)

```cpp
// GLWM.h
#pragma once

#include "CoreMinimal.h"
#include "GLWMTypes.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnWalletConnected, FWalletConnection, Connection);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnWalletDisconnected);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnLicenseVerified, FLicenseVerificationResult, Result);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGLWMError, FGLWMError, Error);

UCLASS(BlueprintType)
class GLWM_API UGLWMSubsystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()
    
public:
    // Delegates
    UPROPERTY(BlueprintAssignable)
    FOnWalletConnected OnWalletConnected;
    
    UPROPERTY(BlueprintAssignable)
    FOnWalletDisconnected OnWalletDisconnected;
    
    UPROPERTY(BlueprintAssignable)
    FOnLicenseVerified OnLicenseVerified;
    
    UPROPERTY(BlueprintAssignable)
    FOnGLWMError OnError;
    
    // Initialization
    UFUNCTION(BlueprintCallable, Category = "GLWM")
    void Initialize(const FGLWMConfig& Config);
    
    // Main workflow
    UFUNCTION(BlueprintCallable, Category = "GLWM")
    void VerifyAndPlay();
    
    // Wallet
    UFUNCTION(BlueprintCallable, Category = "GLWM")
    void ConnectWallet(EWalletProvider PreferredProvider = EWalletProvider::None);
    
    UFUNCTION(BlueprintCallable, Category = "GLWM")
    void DisconnectWallet();
    
    UFUNCTION(BlueprintPure, Category = "GLWM")
    FWalletSession GetWalletSession() const;
    
    // License
    UFUNCTION(BlueprintCallable, Category = "GLWM")
    void VerifyLicense();
    
    // Minting Portal
    UFUNCTION(BlueprintCallable, Category = "GLWM")
    void OpenMintingPortal();
    
    UFUNCTION(BlueprintCallable, Category = "GLWM")
    void CloseMintingPortal();
    
    // State
    UFUNCTION(BlueprintPure, Category = "GLWM")
    EGLWMState GetCurrentState() const;
};
```

---

## 4. Smart Contract Specification

### 4.1 License NFT Contract (ERC-721)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title GameLicenseNFT
 * @notice ERC-721 contract for game license NFTs with optional soulbound functionality
 * @dev Implements minting, royalties, editions, and cross-game access
 */
contract GameLicenseNFT is 
    ERC721,
    ERC721Enumerable,
    ERC721URIStorage,
    ERC721Royalty,
    Ownable,
    Pausable,
    ReentrancyGuard 
{
    using Counters for Counters.Counter;
    
    // ============================================
    // STATE VARIABLES
    // ============================================
    
    Counters.Counter private _tokenIds;
    
    // Edition configuration
    enum Edition { Standard, Deluxe, Ultimate, Founders, Limited }
    
    struct EditionConfig {
        uint256 price;
        uint256 maxSupply;      // 0 = unlimited
        uint256 minted;
        bool active;
    }
    
    mapping(Edition => EditionConfig) public editions;
    
    // Token metadata
    struct LicenseData {
        Edition edition;
        uint256 mintedAt;
        address originalMinter;
        bool soulbound;
        uint256 expiresAt;      // 0 = never expires
    }
    
    mapping(uint256 => LicenseData) public licenseData;
    
    // Game configuration
    string public gameId;
    string public gameVersion;
    bool public soulboundByDefault;
    
    // Cross-game access
    mapping(uint256 => string[]) public crossGameAccess;
    
    // Revenue split
    address public treasuryAddress;
    uint96 public royaltyBps;   // Basis points (e.g., 500 = 5%)
    
    // ============================================
    // EVENTS
    // ============================================
    
    event LicenseMinted(
        uint256 indexed tokenId,
        address indexed minter,
        Edition edition,
        uint256 price
    );
    
    event EditionConfigured(
        Edition indexed edition,
        uint256 price,
        uint256 maxSupply,
        bool active
    );
    
    event CrossGameAccessGranted(
        uint256 indexed tokenId,
        string gameId
    );
    
    event LicenseExpired(uint256 indexed tokenId);
    
    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    constructor(
        string memory name_,
        string memory symbol_,
        string memory gameId_,
        string memory gameVersion_,
        address treasury_,
        uint96 royaltyBps_,
        bool soulboundDefault_
    ) ERC721(name_, symbol_) {
        gameId = gameId_;
        gameVersion = gameVersion_;
        treasuryAddress = treasury_;
        royaltyBps = royaltyBps_;
        soulboundByDefault = soulboundDefault_;
        
        // Set default royalty
        _setDefaultRoyalty(treasury_, royaltyBps_);
    }
    
    // ============================================
    // MINTING
    // ============================================
    
    /**
     * @notice Mint a new license NFT
     * @param edition The edition to mint
     * @param soulbound Whether the license should be soulbound (non-transferable)
     * @param expiresAt Optional expiration timestamp (0 for never)
     */
    function mint(
        Edition edition,
        bool soulbound,
        uint256 expiresAt
    ) external payable nonReentrant whenNotPaused returns (uint256) {
        EditionConfig storage config = editions[edition];
        
        require(config.active, "Edition not active");
        require(msg.value >= config.price, "Insufficient payment");
        require(
            config.maxSupply == 0 || config.minted < config.maxSupply,
            "Edition sold out"
        );
        
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        
        _safeMint(msg.sender, newTokenId);
        
        // Store license data
        licenseData[newTokenId] = LicenseData({
            edition: edition,
            mintedAt: block.timestamp,
            originalMinter: msg.sender,
            soulbound: soulbound || soulboundByDefault,
            expiresAt: expiresAt
        });
        
        config.minted++;
        
        // Send payment to treasury
        (bool sent, ) = treasuryAddress.call{value: msg.value}("");
        require(sent, "Payment failed");
        
        emit LicenseMinted(newTokenId, msg.sender, edition, msg.value);
        
        return newTokenId;
    }
    
    /**
     * @notice Mint with default settings (not soulbound, no expiration)
     */
    function mintSimple(Edition edition) external payable returns (uint256) {
        return this.mint{value: msg.value}(edition, false, 0);
    }
    
    /**
     * @notice Admin mint for airdrops/giveaways
     */
    function adminMint(
        address to,
        Edition edition,
        bool soulbound,
        uint256 expiresAt
    ) external onlyOwner returns (uint256) {
        EditionConfig storage config = editions[edition];
        require(config.active, "Edition not active");
        
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        
        _safeMint(to, newTokenId);
        
        licenseData[newTokenId] = LicenseData({
            edition: edition,
            mintedAt: block.timestamp,
            originalMinter: to,
            soulbound: soulbound,
            expiresAt: expiresAt
        });
        
        config.minted++;
        
        emit LicenseMinted(newTokenId, to, edition, 0);
        
        return newTokenId;
    }
    
    // ============================================
    // LICENSE VERIFICATION
    // ============================================
    
    /**
     * @notice Check if an address owns a valid license
     * @param owner Address to check
     * @return hasLicense Whether the address owns a valid license
     * @return tokenId The token ID if found (0 if none)
     */
    function hasValidLicense(address owner) 
        external 
        view 
        returns (bool hasLicense, uint256 tokenId) 
    {
        uint256 balance = balanceOf(owner);
        if (balance == 0) {
            return (false, 0);
        }
        
        // Check each token for validity
        for (uint256 i = 0; i < balance; i++) {
            uint256 tid = tokenOfOwnerByIndex(owner, i);
            if (_isLicenseValid(tid)) {
                return (true, tid);
            }
        }
        
        return (false, 0);
    }
    
    /**
     * @notice Check if a specific token is a valid license
     */
    function isLicenseValid(uint256 tokenId) external view returns (bool) {
        return _isLicenseValid(tokenId);
    }
    
    function _isLicenseValid(uint256 tokenId) internal view returns (bool) {
        if (!_exists(tokenId)) return false;
        
        LicenseData storage data = licenseData[tokenId];
        
        // Check expiration
        if (data.expiresAt > 0 && block.timestamp > data.expiresAt) {
            return false;
        }
        
        return true;
    }
    
    /**
     * @notice Get full license data for verification
     */
    function getLicenseData(uint256 tokenId) 
        external 
        view 
        returns (
            Edition edition,
            uint256 mintedAt,
            address originalMinter,
            bool soulbound,
            uint256 expiresAt,
            bool isValid,
            address currentOwner
        ) 
    {
        require(_exists(tokenId), "Token does not exist");
        
        LicenseData storage data = licenseData[tokenId];
        
        return (
            data.edition,
            data.mintedAt,
            data.originalMinter,
            data.soulbound,
            data.expiresAt,
            _isLicenseValid(tokenId),
            ownerOf(tokenId)
        );
    }
    
    // ============================================
    // CROSS-GAME ACCESS
    // ============================================
    
    /**
     * @notice Grant cross-game access to a token
     * @dev Only owner can grant cross-game access
     */
    function grantCrossGameAccess(uint256 tokenId, string calldata otherGameId) 
        external 
        onlyOwner 
    {
        require(_exists(tokenId), "Token does not exist");
        crossGameAccess[tokenId].push(otherGameId);
        emit CrossGameAccessGranted(tokenId, otherGameId);
    }
    
    /**
     * @notice Check if token has access to a specific game
     */
    function hasCrossGameAccess(uint256 tokenId, string calldata otherGameId) 
        external 
        view 
        returns (bool) 
    {
        // Primary game always has access
        if (keccak256(bytes(otherGameId)) == keccak256(bytes(gameId))) {
            return _isLicenseValid(tokenId);
        }
        
        string[] storage access = crossGameAccess[tokenId];
        for (uint256 i = 0; i < access.length; i++) {
            if (keccak256(bytes(access[i])) == keccak256(bytes(otherGameId))) {
                return _isLicenseValid(tokenId);
            }
        }
        
        return false;
    }
    
    // ============================================
    // EDITION MANAGEMENT
    // ============================================
    
    /**
     * @notice Configure an edition
     */
    function configureEdition(
        Edition edition,
        uint256 price,
        uint256 maxSupply,
        bool active
    ) external onlyOwner {
        editions[edition] = EditionConfig({
            price: price,
            maxSupply: maxSupply,
            minted: editions[edition].minted,
            active: active
        });
        
        emit EditionConfigured(edition, price, maxSupply, active);
    }
    
    /**
     * @notice Get edition info
     */
    function getEditionInfo(Edition edition) 
        external 
        view 
        returns (
            uint256 price,
            uint256 maxSupply,
            uint256 minted,
            uint256 remaining,
            bool active
        ) 
    {
        EditionConfig storage config = editions[edition];
        uint256 rem = config.maxSupply == 0 
            ? type(uint256).max 
            : config.maxSupply - config.minted;
            
        return (
            config.price,
            config.maxSupply,
            config.minted,
            rem,
            config.active
        );
    }
    
    // ============================================
    // TRANSFER RESTRICTIONS (SOULBOUND)
    // ============================================
    
    /**
     * @dev Override to enforce soulbound restrictions
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override(ERC721, ERC721Enumerable) {
        // Allow minting (from = 0) and burning (to = 0)
        if (from != address(0) && to != address(0)) {
            require(
                !licenseData[tokenId].soulbound,
                "Token is soulbound"
            );
        }
        
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }
    
    // ============================================
    // ADMIN FUNCTIONS
    // ============================================
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function setTreasury(address newTreasury) external onlyOwner {
        treasuryAddress = newTreasury;
        _setDefaultRoyalty(newTreasury, royaltyBps);
    }
    
    function setRoyalty(uint96 newRoyaltyBps) external onlyOwner {
        royaltyBps = newRoyaltyBps;
        _setDefaultRoyalty(treasuryAddress, newRoyaltyBps);
    }
    
    function setGameVersion(string calldata newVersion) external onlyOwner {
        gameVersion = newVersion;
    }
    
    // ============================================
    // REQUIRED OVERRIDES
    // ============================================
    
    function _burn(uint256 tokenId) 
        internal 
        override(ERC721, ERC721URIStorage, ERC721Royalty) 
    {
        super._burn(tokenId);
    }
    
    function tokenURI(uint256 tokenId) 
        public 
        view 
        override(ERC721, ERC721URIStorage) 
        returns (string memory) 
    {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage, ERC721Royalty)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
    
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
}
```

### 4.2 Contract ABI (Key Functions)

```json
{
  "abi": [
    {
      "name": "mint",
      "type": "function",
      "stateMutability": "payable",
      "inputs": [
        { "name": "edition", "type": "uint8" },
        { "name": "soulbound", "type": "bool" },
        { "name": "expiresAt", "type": "uint256" }
      ],
      "outputs": [{ "name": "tokenId", "type": "uint256" }]
    },
    {
      "name": "mintSimple",
      "type": "function",
      "stateMutability": "payable",
      "inputs": [{ "name": "edition", "type": "uint8" }],
      "outputs": [{ "name": "tokenId", "type": "uint256" }]
    },
    {
      "name": "hasValidLicense",
      "type": "function",
      "stateMutability": "view",
      "inputs": [{ "name": "owner", "type": "address" }],
      "outputs": [
        { "name": "hasLicense", "type": "bool" },
        { "name": "tokenId", "type": "uint256" }
      ]
    },
    {
      "name": "isLicenseValid",
      "type": "function",
      "stateMutability": "view",
      "inputs": [{ "name": "tokenId", "type": "uint256" }],
      "outputs": [{ "name": "", "type": "bool" }]
    },
    {
      "name": "getLicenseData",
      "type": "function",
      "stateMutability": "view",
      "inputs": [{ "name": "tokenId", "type": "uint256" }],
      "outputs": [
        { "name": "edition", "type": "uint8" },
        { "name": "mintedAt", "type": "uint256" },
        { "name": "originalMinter", "type": "address" },
        { "name": "soulbound", "type": "bool" },
        { "name": "expiresAt", "type": "uint256" },
        { "name": "isValid", "type": "bool" },
        { "name": "currentOwner", "type": "address" }
      ]
    },
    {
      "name": "getEditionInfo",
      "type": "function",
      "stateMutability": "view",
      "inputs": [{ "name": "edition", "type": "uint8" }],
      "outputs": [
        { "name": "price", "type": "uint256" },
        { "name": "maxSupply", "type": "uint256" },
        { "name": "minted", "type": "uint256" },
        { "name": "remaining", "type": "uint256" },
        { "name": "active", "type": "bool" }
      ]
    },
    {
      "name": "LicenseMinted",
      "type": "event",
      "inputs": [
        { "name": "tokenId", "type": "uint256", "indexed": true },
        { "name": "minter", "type": "address", "indexed": true },
        { "name": "edition", "type": "uint8", "indexed": false },
        { "name": "price", "type": "uint256", "indexed": false }
      ]
    }
  ]
}
```

---

## 5. Implementation Modules

### 5.1 Wallet Auth Layer

```typescript
// wallet-auth-layer.ts

import { ethers } from 'ethers';
import WalletConnectProvider from '@walletconnect/web3-provider';

interface WalletAuthConfig {
  supportedChains: ChainId[];
  requiredChain: ChainId;
  walletConnectProjectId?: string;
  autoReconnect: boolean;
}

class WalletAuthLayer {
  private config: WalletAuthConfig;
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.Signer | null = null;
  private connection: WalletConnection | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  
  constructor(config: WalletAuthConfig) {
    this.config = config;
    this.initializeEventListeners();
  }
  
  // ============================================
  // CONNECTION MANAGEMENT
  // ============================================
  
  async connect(preferredProvider?: WalletProvider): Promise<WalletConnection> {
    const provider = preferredProvider || this.detectBestProvider();
    
    switch (provider) {
      case 'metamask':
        return this.connectMetaMask();
      case 'walletconnect':
        return this.connectWalletConnect();
      case 'phantom':
        return this.connectPhantom();
      case 'coinbase':
        return this.connectCoinbase();
      default:
        throw this.createError('WALLET_NOT_FOUND', `Provider ${provider} not supported`);
    }
  }
  
  private async connectMetaMask(): Promise<WalletConnection> {
    if (!window.ethereum?.isMetaMask) {
      throw this.createError('WALLET_NOT_FOUND', 'MetaMask not installed');
    }
    
    try {
      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });
      
      if (!accounts || accounts.length === 0) {
        throw this.createError('WALLET_CONNECTION_REJECTED', 'No accounts returned');
      }
      
      // Get chain ID
      const chainIdHex = await window.ethereum.request({
        method: 'eth_chainId'
      });
      const chainId = parseInt(chainIdHex, 16);
      
      // Verify chain
      if (chainId !== this.config.requiredChain) {
        await this.requestChainSwitch(this.config.requiredChain);
      }
      
      // Setup provider and signer
      this.provider = new ethers.BrowserProvider(window.ethereum);
      this.signer = await this.provider.getSigner();
      
      // Create connection object
      this.connection = {
        address: ethers.getAddress(accounts[0]), // Checksummed
        chainId: this.config.requiredChain,
        provider: 'metamask',
        connectedAt: Date.now(),
        sessionId: crypto.randomUUID()
      };
      
      // Persist to local storage
      this.persistConnection();
      
      // Emit event
      this.emit('connected', this.connection);
      
      return this.connection;
      
    } catch (error: any) {
      if (error.code === 4001) {
        throw this.createError('WALLET_CONNECTION_REJECTED', 'User rejected connection');
      }
      throw this.createError('WALLET_NOT_FOUND', error.message);
    }
  }
  
  private async connectWalletConnect(): Promise<WalletConnection> {
    const wcProvider = new WalletConnectProvider({
      projectId: this.config.walletConnectProjectId,
      chains: [this.config.requiredChain],
      showQrModal: true
    });
    
    try {
      await wcProvider.enable();
      
      this.provider = new ethers.BrowserProvider(wcProvider);
      this.signer = await this.provider.getSigner();
      const address = await this.signer.getAddress();
      
      this.connection = {
        address: ethers.getAddress(address),
        chainId: this.config.requiredChain,
        provider: 'walletconnect',
        connectedAt: Date.now(),
        sessionId: crypto.randomUUID()
      };
      
      this.persistConnection();
      this.emit('connected', this.connection);
      
      return this.connection;
      
    } catch (error: any) {
      throw this.createError('WALLET_CONNECTION_REJECTED', error.message);
    }
  }
  
  private async connectPhantom(): Promise<WalletConnection> {
    // Phantom EVM support
    const phantom = window.phantom?.ethereum;
    
    if (!phantom) {
      throw this.createError('WALLET_NOT_FOUND', 'Phantom not installed');
    }
    
    try {
      const accounts = await phantom.request({
        method: 'eth_requestAccounts'
      });
      
      this.provider = new ethers.BrowserProvider(phantom);
      this.signer = await this.provider.getSigner();
      
      this.connection = {
        address: ethers.getAddress(accounts[0]),
        chainId: this.config.requiredChain,
        provider: 'phantom',
        connectedAt: Date.now(),
        sessionId: crypto.randomUUID()
      };
      
      this.persistConnection();
      this.emit('connected', this.connection);
      
      return this.connection;
      
    } catch (error: any) {
      throw this.createError('WALLET_CONNECTION_REJECTED', error.message);
    }
  }
  
  private async connectCoinbase(): Promise<WalletConnection> {
    // Implementation for Coinbase Wallet SDK
    // Similar pattern to MetaMask
    throw this.createError('WALLET_NOT_FOUND', 'Coinbase Wallet not yet implemented');
  }
  
  async disconnect(): Promise<void> {
    this.provider = null;
    this.signer = null;
    this.connection = null;
    this.clearPersistedConnection();
    this.emit('disconnected', null);
  }
  
  // ============================================
  // CHAIN MANAGEMENT
  // ============================================
  
  async requestChainSwitch(chainId: ChainId): Promise<void> {
    const chainIdHex = `0x${chainId.toString(16)}`;
    
    try {
      await window.ethereum?.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }]
      });
    } catch (error: any) {
      // Chain not added, try to add it
      if (error.code === 4902) {
        await this.addChain(chainId);
      } else {
        throw this.createError('CHAIN_MISMATCH', error.message);
      }
    }
  }
  
  private async addChain(chainId: ChainId): Promise<void> {
    const chainConfig = this.getChainConfig(chainId);
    
    await window.ethereum?.request({
      method: 'wallet_addEthereumChain',
      params: [chainConfig]
    });
  }
  
  private getChainConfig(chainId: ChainId): object {
    const configs: Record<number, object> = {
      1: {
        chainId: '0x1',
        chainName: 'Ethereum Mainnet',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://eth.llamarpc.com'],
        blockExplorerUrls: ['https://etherscan.io']
      },
      137: {
        chainId: '0x89',
        chainName: 'Polygon Mainnet',
        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
        rpcUrls: ['https://polygon-rpc.com'],
        blockExplorerUrls: ['https://polygonscan.com']
      },
      8453: {
        chainId: '0x2105',
        chainName: 'Base',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://mainnet.base.org'],
        blockExplorerUrls: ['https://basescan.org']
      }
    };
    
    return configs[chainId] || configs[1];
  }
  
  // ============================================
  // UTILITIES
  // ============================================
  
  getSession(): WalletSession {
    return {
      connection: this.connection,
      isConnected: this.connection !== null,
      isConnecting: false,
      error: null
    };
  }
  
  getProvider(): ethers.BrowserProvider | null {
    return this.provider;
  }
  
  getSigner(): ethers.Signer | null {
    return this.signer;
  }
  
  detectBestProvider(): WalletProvider {
    if (window.ethereum?.isMetaMask) return 'metamask';
    if (window.phantom?.ethereum) return 'phantom';
    if (window.coinbaseWalletExtension) return 'coinbase';
    return 'walletconnect'; // Fallback to WC
  }
  
  getAvailableProviders(): WalletProvider[] {
    const providers: WalletProvider[] = [];
    
    if (window.ethereum?.isMetaMask) providers.push('metamask');
    if (window.phantom?.ethereum) providers.push('phantom');
    if (window.coinbaseWalletExtension) providers.push('coinbase');
    providers.push('walletconnect'); // Always available
    
    return providers;
  }
  
  isProviderAvailable(provider: WalletProvider): boolean {
    return this.getAvailableProviders().includes(provider);
  }
  
  // ============================================
  // PERSISTENCE
  // ============================================
  
  private persistConnection(): void {
    if (this.connection) {
      localStorage.setItem('glwm_wallet', JSON.stringify({
        address: this.connection.address,
        provider: this.connection.provider
      }));
    }
  }
  
  private clearPersistedConnection(): void {
    localStorage.removeItem('glwm_wallet');
  }
  
  async tryAutoReconnect(): Promise<WalletConnection | null> {
    if (!this.config.autoReconnect) return null;
    
    const stored = localStorage.getItem('glwm_wallet');
    if (!stored) return null;
    
    try {
      const { provider } = JSON.parse(stored);
      return await this.connect(provider);
    } catch {
      this.clearPersistedConnection();
      return null;
    }
  }
  
  // ============================================
  // EVENT HANDLING
  // ============================================
  
  private initializeEventListeners(): void {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length === 0) {
          this.disconnect();
        } else if (this.connection) {
          this.connection.address = ethers.getAddress(accounts[0]);
          this.emit('accountChanged', this.connection);
        }
      });
      
      window.ethereum.on('chainChanged', (chainIdHex: string) => {
        const chainId = parseInt(chainIdHex, 16);
        if (chainId !== this.config.requiredChain) {
          this.emit('chainMismatch', { expected: this.config.requiredChain, actual: chainId });
        }
      });
      
      window.ethereum.on('disconnect', () => {
        this.disconnect();
      });
    }
  }
  
  on(event: string, handler: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }
  
  private emit(event: string, payload: any): void {
    this.listeners.get(event)?.forEach(handler => handler(payload));
  }
  
  private createError(code: GLWMErrorCode, message: string): WalletError {
    return {
      code,
      message,
      recoverable: code !== 'WALLET_NOT_FOUND',
      provider: this.connection?.provider
    };
  }
}

export { WalletAuthLayer, WalletAuthConfig };
```

### 5.2 License Verification Layer

```typescript
// license-verification-layer.ts

import { ethers } from 'ethers';
import { LRUCache } from 'lru-cache';

interface VerificationConfig {
  contractAddress: string;
  chainId: ChainId;
  rpcUrl: string;
  cacheTTL: number; // seconds
  retryAttempts: number;
  retryDelay: number; // ms
}

// Minimal ABI for verification
const LICENSE_ABI = [
  'function hasValidLicense(address owner) view returns (bool hasLicense, uint256 tokenId)',
  'function isLicenseValid(uint256 tokenId) view returns (bool)',
  'function getLicenseData(uint256 tokenId) view returns (uint8 edition, uint256 mintedAt, address originalMinter, bool soulbound, uint256 expiresAt, bool isValid, address currentOwner)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function gameId() view returns (string)',
  'function gameVersion() view returns (string)',
  'event LicenseMinted(uint256 indexed tokenId, address indexed minter, uint8 edition, uint256 price)'
];

class LicenseVerificationLayer {
  private config: VerificationConfig;
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private cache: LRUCache<string, LicenseVerificationResult>;
  
  constructor(config: VerificationConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.contract = new ethers.Contract(
      config.contractAddress,
      LICENSE_ABI,
      this.provider
    );
    
    this.cache = new LRUCache({
      max: 1000,
      ttl: config.cacheTTL * 1000
    });
  }
  
  // ============================================
  // MAIN VERIFICATION
  // ============================================
  
  async verifyLicense(address: string, bypassCache = false): Promise<LicenseVerificationResult> {
    const checksumAddress = ethers.getAddress(address);
    const cacheKey = `license:${checksumAddress}`;
    
    // Check cache
    if (!bypassCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }
    
    // Perform verification with retry
    const result = await this.retryOperation(
      () => this.performVerification(checksumAddress)
    );
    
    // Cache result
    this.cache.set(cacheKey, result);
    
    return result;
  }
  
  private async performVerification(address: string): Promise<LicenseVerificationResult> {
    const blockNumber = await this.provider.getBlockNumber();
    
    try {
      // Use contract's hasValidLicense function
      const [hasLicense, tokenId] = await this.contract.hasValidLicense(address);
      
      if (!hasLicense) {
        return {
          isValid: false,
          license: null,
          checkedAt: Date.now(),
          blockNumber,
          reason: 'no_license_found'
        };
      }
      
      // Get full license details
      const license = await this.getLicenseDetails(tokenId.toString());
      
      return {
        isValid: true,
        license,
        checkedAt: Date.now(),
        blockNumber
      };
      
    } catch (error: any) {
      // Handle specific contract errors
      if (error.code === 'CALL_EXCEPTION') {
        return {
          isValid: false,
          license: null,
          checkedAt: Date.now(),
          blockNumber,
          reason: 'contract_paused'
        };
      }
      
      throw this.createError('VERIFICATION_FAILED', error.message);
    }
  }
  
  // ============================================
  // LICENSE DETAILS
  // ============================================
  
  async getLicenseDetails(tokenId: string): Promise<LicenseNFT> {
    const [
      edition,
      mintedAt,
      originalMinter,
      soulbound,
      expiresAt,
      isValid,
      currentOwner
    ] = await this.contract.getLicenseData(tokenId);
    
    // Get token URI for metadata
    const tokenURI = await this.contract.tokenURI(tokenId);
    const metadata = await this.fetchMetadata(tokenURI);
    
    return {
      tokenId,
      contractAddress: this.config.contractAddress,
      owner: currentOwner,
      metadata: {
        name: metadata.name || `Game License #${tokenId}`,
        description: metadata.description || '',
        image: metadata.image,
        attributes: {
          version: metadata.attributes?.version || '1.0',
          edition: this.editionToString(edition),
          mintedBy: originalMinter,
          gameId: await this.contract.gameId(),
          soulbound,
          expiresAt: expiresAt > 0 ? Number(expiresAt) : undefined
        }
      },
      mintedAt: Number(mintedAt),
      transactionHash: '' // Would need event query for this
    };
  }
  
  async getAllLicenses(address: string): Promise<LicenseNFT[]> {
    const balance = await this.contract.balanceOf(address);
    const licenses: LicenseNFT[] = [];
    
    for (let i = 0; i < balance; i++) {
      const tokenId = await this.contract.tokenOfOwnerByIndex(address, i);
      const license = await this.getLicenseDetails(tokenId.toString());
      licenses.push(license);
    }
    
    return licenses;
  }
  
  // ============================================
  // REAL-TIME MONITORING
  // ============================================
  
  watchForNewLicense(
    address: string,
    callback: (license: LicenseNFT) => void
  ): () => void {
    const filter = this.contract.filters.LicenseMinted(null, address);
    
    const handler = async (tokenId: bigint, minter: string) => {
      const license = await this.getLicenseDetails(tokenId.toString());
      
      // Invalidate cache
      this.cache.delete(`license:${ethers.getAddress(address)}`);
      
      callback(license);
    };
    
    this.contract.on(filter, handler);
    
    // Return unsubscribe function
    return () => {
      this.contract.off(filter, handler);
    };
  }
  
  // ============================================
  // UTILITIES
  // ============================================
  
  private async fetchMetadata(uri: string): Promise<any> {
    // Handle IPFS URIs
    if (uri.startsWith('ipfs://')) {
      uri = uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
    }
    
    try {
      const response = await fetch(uri);
      return await response.json();
    } catch {
      return {};
    }
  }
  
  private editionToString(edition: number): LicenseEdition {
    const editions: LicenseEdition[] = ['standard', 'deluxe', 'ultimate', 'founders', 'limited'];
    return editions[edition] || 'standard';
  }
  
  private async retryOperation<T>(
    operation: () => Promise<T>,
    attempt = 1
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= this.config.retryAttempts) {
        throw error;
      }
      
      await this.delay(this.config.retryDelay * attempt);
      return this.retryOperation(operation, attempt + 1);
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  clearCache(): void {
    this.cache.clear();
  }
  
  private createError(code: GLWMErrorCode, message: string): GLWMError {
    return {
      code,
      message,
      recoverable: true,
      suggestedAction: 'Try again or contact support'
    };
  }
}

export { LicenseVerificationLayer, VerificationConfig };
```

### 5.3 Minting Portal Controller

```typescript
// minting-portal-controller.ts

interface PortalConfig {
  url: string;
  mode: 'webview' | 'redirect' | 'iframe';
  width?: number;
  height?: number;
  autoCloseOnMint?: boolean;
}

interface PortalMessage {
  type: 'MINT_STARTED' | 'MINT_COMPLETED' | 'MINT_FAILED' | 'PORTAL_CLOSED' | 'PORTAL_READY';
  payload?: any;
}

class MintingPortalController {
  private config: PortalConfig;
  private portal: Window | HTMLIFrameElement | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  
  constructor(config: PortalConfig) {
    this.config = {
      width: 480,
      height: 640,
      autoCloseOnMint: true,
      ...config
    };
  }
  
  // ============================================
  // PORTAL MANAGEMENT
  // ============================================
  
  async open(walletAddress: string, chainId: ChainId): Promise<void> {
    const url = this.buildPortalUrl(walletAddress, chainId);
    
    switch (this.config.mode) {
      case 'webview':
        await this.openWebView(url);
        break;
      case 'redirect':
        this.openRedirect(url);
        break;
      case 'iframe':
        await this.openIframe(url);
        break;
    }
    
    this.setupMessageListener();
  }
  
  private async openWebView(url: string): Promise<void> {
    // For Electron/NW.js/Tauri desktop apps
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      await (window as any).electronAPI.openWebView({
        url,
        width: this.config.width,
        height: this.config.height
      });
      return;
    }
    
    // Fallback to popup window
    const left = (screen.width - this.config.width!) / 2;
    const top = (screen.height - this.config.height!) / 2;
    
    this.portal = window.open(
      url,
      'glwm_mint_portal',
      `width=${this.config.width},height=${this.config.height},left=${left},top=${top},popup=true`
    );
    
    if (!this.portal) {
      throw new Error('Failed to open minting portal - popup may be blocked');
    }
    
    // Monitor for close
    const checkClosed = setInterval(() => {
      if ((this.portal as Window)?.closed) {
        clearInterval(checkClosed);
        this.handlePortalClosed();
      }
    }, 500);
  }
  
  private openRedirect(url: string): void {
    // Store return URL for post-mint redirect
    sessionStorage.setItem('glwm_return_url', window.location.href);
    window.location.href = url;
  }
  
  private async openIframe(url: string): Promise<void> {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'glwm-portal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
    `;
    
    // Create iframe container
    const container = document.createElement('div');
    container.style.cssText = `
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    `;
    
    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
      position: absolute;
      top: -40px;
      right: 0;
      background: none;
      border: none;
      color: white;
      font-size: 32px;
      cursor: pointer;
    `;
    closeBtn.onclick = () => this.close();
    
    // Create iframe
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.width = String(this.config.width);
    iframe.height = String(this.config.height);
    iframe.style.border = 'none';
    
    container.appendChild(iframe);
    container.appendChild(closeBtn);
    overlay.appendChild(container);
    document.body.appendChild(overlay);
    
    this.portal = iframe;
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });
    
    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }
  
  close(): void {
    if (this.config.mode === 'webview' && this.portal instanceof Window) {
      this.portal.close();
    } else if (this.config.mode === 'iframe') {
      const overlay = document.getElementById('glwm-portal-overlay');
      overlay?.remove();
    }
    
    this.portal = null;
    this.removeMessageListener();
    this.emit('closed', null);
  }
  
  isOpen(): boolean {
    if (!this.portal) return false;
    
    if (this.portal instanceof Window) {
      return !this.portal.closed;
    }
    
    return document.contains(this.portal);
  }
  
  // ============================================
  // COMMUNICATION
  // ============================================
  
  private setupMessageListener(): void {
    this.messageHandler = (event: MessageEvent) => {
      // Validate origin
      const portalOrigin = new URL(this.config.url).origin;
      if (event.origin !== portalOrigin) return;
      
      const message = event.data as PortalMessage;
      
      switch (message.type) {
        case 'PORTAL_READY':
          this.emit('ready', null);
          break;
          
        case 'MINT_STARTED':
          this.emit('mintStarted', message.payload);
          break;
          
        case 'MINT_COMPLETED':
          this.emit('mintCompleted', message.payload);
          if (this.config.autoCloseOnMint) {
            setTimeout(() => this.close(), 2000);
          }
          break;
          
        case 'MINT_FAILED':
          this.emit('mintFailed', message.payload);
          break;
          
        case 'PORTAL_CLOSED':
          this.handlePortalClosed();
          break;
      }
    };
    
    window.addEventListener('message', this.messageHandler);
  }
  
  private removeMessageListener(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
  }
  
  private handlePortalClosed(): void {
    this.portal = null;
    this.removeMessageListener();
    this.emit('closed', null);
  }
  
  // Send message to portal
  postMessage(message: any): void {
    if (!this.portal) return;
    
    const targetOrigin = new URL(this.config.url).origin;
    
    if (this.portal instanceof Window) {
      this.portal.postMessage(message, targetOrigin);
    } else {
      this.portal.contentWindow?.postMessage(message, targetOrigin);
    }
  }
  
  // ============================================
  // URL BUILDING
  // ============================================
  
  private buildPortalUrl(walletAddress: string, chainId: ChainId): string {
    const url = new URL(this.config.url);
    
    // Add parameters for portal
    url.searchParams.set('wallet', walletAddress);
    url.searchParams.set('chain', String(chainId));
    url.searchParams.set('origin', window.location.origin);
    url.searchParams.set('mode', 'embedded');
    
    return url.toString();
  }
  
  // ============================================
  // EVENTS
  // ============================================
  
  on(event: string, handler: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }
  
  private emit(event: string, payload: any): void {
    this.listeners.get(event)?.forEach(handler => handler(payload));
  }
}

export { MintingPortalController, PortalConfig, PortalMessage };
```

---

## 6. Minting Portal Frontend

### 6.1 Portal Page Structure

```typescript
// minting-portal/src/App.tsx

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

interface MintPortalProps {
  contractAddress: string;
  chainId: number;
}

interface Edition {
  id: number;
  name: string;
  price: bigint;
  remaining: number;
  active: boolean;
}

const MintPortal: React.FC<MintPortalProps> = ({ contractAddress, chainId }) => {
  // State
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [selectedEdition, setSelectedEdition] = useState<number>(0);
  const [isMinting, setIsMinting] = useState(false);
  const [mintStatus, setMintStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Parse URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wallet = params.get('wallet');
    if (wallet) {
      setWalletAddress(wallet);
    }
    
    // Notify parent we're ready
    notifyParent({ type: 'PORTAL_READY' });
  }, []);
  
  // Load editions
  useEffect(() => {
    loadEditions();
  }, []);
  
  const loadEditions = async () => {
    // Fetch edition info from contract
    const provider = new ethers.JsonRpcProvider(getRpcUrl(chainId));
    const contract = new ethers.Contract(contractAddress, LICENSE_ABI, provider);
    
    const editionNames = ['Standard', 'Deluxe', 'Ultimate', 'Founders', 'Limited'];
    const loadedEditions: Edition[] = [];
    
    for (let i = 0; i < editionNames.length; i++) {
      try {
        const [price, maxSupply, minted, remaining, active] = await contract.getEditionInfo(i);
        
        if (active) {
          loadedEditions.push({
            id: i,
            name: editionNames[i],
            price,
            remaining: maxSupply === 0n ? Infinity : Number(remaining),
            active
          });
        }
      } catch (e) {
        // Edition not configured
      }
    }
    
    setEditions(loadedEditions);
    if (loadedEditions.length > 0) {
      setSelectedEdition(loadedEditions[0].id);
    }
  };
  
  const handleMint = async () => {
    if (!walletAddress) {
      setError('Wallet not connected');
      return;
    }
    
    setIsMinting(true);
    setMintStatus('pending');
    setError(null);
    
    try {
      // Get the provider from window.ethereum
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const contract = new ethers.Contract(contractAddress, LICENSE_ABI, signer);
      const edition = editions.find(e => e.id === selectedEdition)!;
      
      // Notify parent that mint started
      notifyParent({ type: 'MINT_STARTED', payload: { edition: selectedEdition } });
      
      // Execute mint
      const tx = await contract.mintSimple(selectedEdition, {
        value: edition.price
      });
      
      setTxHash(tx.hash);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      // Extract token ID from event
      const mintEvent = receipt.logs.find((log: any) => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed?.name === 'LicenseMinted';
        } catch {
          return false;
        }
      });
      
      const tokenId = mintEvent ? 
        contract.interface.parseLog(mintEvent)?.args.tokenId.toString() : 
        null;
      
      setMintStatus('success');
      
      // Notify parent of success
      notifyParent({
        type: 'MINT_COMPLETED',
        payload: {
          transactionHash: tx.hash,
          tokenId,
          edition: selectedEdition
        }
      });
      
    } catch (err: any) {
      setMintStatus('error');
      
      let errorMessage = 'Mint failed';
      if (err.code === 'ACTION_REJECTED') {
        errorMessage = 'Transaction rejected by user';
      } else if (err.code === 'INSUFFICIENT_FUNDS') {
        errorMessage = 'Insufficient funds for mint';
      } else if (err.reason) {
        errorMessage = err.reason;
      }
      
      setError(errorMessage);
      
      notifyParent({
        type: 'MINT_FAILED',
        payload: { error: errorMessage }
      });
    } finally {
      setIsMinting(false);
    }
  };
  
  const notifyParent = (message: any) => {
    const params = new URLSearchParams(window.location.search);
    const origin = params.get('origin');
    
    if (origin && window.opener) {
      window.opener.postMessage(message, origin);
    } else if (origin && window.parent !== window) {
      window.parent.postMessage(message, origin);
    }
  };
  
  const formatPrice = (price: bigint) => {
    return ethers.formatEther(price) + ' ETH';
  };
  
  return (
    <div className="mint-portal">
      <header className="portal-header">
        <h1>Game License</h1>
        <p>Purchase your license to play</p>
      </header>
      
      {walletAddress && (
        <div className="wallet-display">
          Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
        </div>
      )}
      
      <div className="editions-grid">
        {editions.map(edition => (
          <div
            key={edition.id}
            className={`edition-card ${selectedEdition === edition.id ? 'selected' : ''}`}
            onClick={() => setSelectedEdition(edition.id)}
          >
            <h3>{edition.name}</h3>
            <p className="price">{formatPrice(edition.price)}</p>
            {edition.remaining !== Infinity && (
              <p className="remaining">{edition.remaining} remaining</p>
            )}
          </div>
        ))}
      </div>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      {mintStatus === 'success' ? (
        <div className="success-message">
          <h2>🎉 License Minted!</h2>
          <p>Your game license has been created.</p>
          {txHash && (
            <a 
              href={`${getExplorerUrl(chainId)}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View Transaction
            </a>
          )}
          <p className="auto-close">This window will close automatically...</p>
        </div>
      ) : (
        <button
          className="mint-button"
          onClick={handleMint}
          disabled={isMinting || editions.length === 0}
        >
          {isMinting ? 'Minting...' : `Mint ${editions.find(e => e.id === selectedEdition)?.name || ''} License`}
        </button>
      )}
    </div>
  );
};

// Helper functions
function getRpcUrl(chainId: number): string {
  const rpcs: Record<number, string> = {
    1: 'https://eth.llamarpc.com',
    137: 'https://polygon-rpc.com',
    8453: 'https://mainnet.base.org'
  };
  return rpcs[chainId] || rpcs[1];
}

function getExplorerUrl(chainId: number): string {
  const explorers: Record<number, string> = {
    1: 'https://etherscan.io',
    137: 'https://polygonscan.com',
    8453: 'https://basescan.org'
  };
  return explorers[chainId] || explorers[1];
}

export default MintPortal;
```

### 6.2 Portal Styles

```css
/* minting-portal/src/styles.css */

.mint-portal {
  max-width: 400px;
  margin: 0 auto;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.portal-header {
  text-align: center;
  margin-bottom: 24px;
}

.portal-header h1 {
  font-size: 24px;
  margin: 0 0 8px;
}

.portal-header p {
  color: #666;
  margin: 0;
}

.wallet-display {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 8px;
  text-align: center;
  font-family: monospace;
  margin-bottom: 24px;
}

.editions-grid {
  display: grid;
  gap: 12px;
  margin-bottom: 24px;
}

.edition-card {
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.edition-card:hover {
  border-color: #999;
}

.edition-card.selected {
  border-color: #007bff;
  background: #f0f7ff;
}

.edition-card h3 {
  margin: 0 0 8px;
}

.edition-card .price {
  font-size: 20px;
  font-weight: bold;
  margin: 0;
}

.edition-card .remaining {
  font-size: 12px;
  color: #666;
  margin: 8px 0 0;
}

.mint-button {
  width: 100%;
  padding: 16px;
  font-size: 18px;
  font-weight: bold;
  color: white;
  background: #007bff;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.mint-button:hover:not(:disabled) {
  background: #0056b3;
}

.mint-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.error-message {
  background: #fee;
  color: #c00;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  text-align: center;
}

.success-message {
  text-align: center;
  padding: 24px;
}

.success-message h2 {
  margin: 0 0 12px;
}

.success-message a {
  color: #007bff;
  text-decoration: none;
}

.success-message .auto-close {
  color: #666;
  font-size: 14px;
  margin-top: 16px;
}
```

---

## 7. Integration Examples

### 7.1 Basic Web Integration

```typescript
// Basic usage in a web game

import { GLWM, GLWMConfig } from '@glwm/sdk';

const config: GLWMConfig = {
  licenseContract: '0x1234567890abcdef...',
  chainId: 137, // Polygon
  
  rpcProvider: {
    provider: 'alchemy',
    apiKey: process.env.ALCHEMY_API_KEY
  },
  
  mintingPortal: {
    url: 'https://mint.mygame.com',
    mode: 'iframe',
    autoCloseOnMint: true
  },
  
  cacheConfig: {
    enabled: true,
    ttlSeconds: 300,
    storageKey: 'mygame_glwm'
  },
  
  onLicenseVerified: (result) => {
    console.log('License verified:', result);
  },
  
  onError: (error) => {
    console.error('GLWM Error:', error);
  }
};

async function initGame() {
  const glwm = new GLWM(config);
  
  try {
    await glwm.initialize();
    
    // Main flow: verify and start game
    const result = await glwm.verifyAndPlay();
    
    if (result.isValid) {
      // License verified - start the game
      startGame(result.license);
    }
    
  } catch (error) {
    // Handle errors
    if (error.code === 'USER_CANCELLED') {
      showMessage('License purchase cancelled');
    } else {
      showError(error.message);
    }
  }
}

function startGame(license: LicenseNFT) {
  // Store license reference for save/load
  localStorage.setItem('player_wallet', license.owner);
  
  // Initialize game with license tier
  const tier = license.metadata.attributes.tier || 'standard';
  
  initializeGameEngine({
    playerId: license.owner,
    tier,
    features: getFeaturesByTier(tier)
  });
}
```

### 7.2 React Integration

```tsx
// React app integration

import { GLWMProvider, useGLWM, WalletConnectButton, LicenseStatus } from '@glwm/react';

// App wrapper
function App() {
  const config = {
    licenseContract: '0x1234...',
    chainId: 137,
    rpcProvider: { provider: 'alchemy', apiKey: '...' },
    mintingPortal: { url: 'https://mint.mygame.com', mode: 'iframe' }
  };
  
  return (
    <GLWMProvider config={config}>
      <GameLauncher />
    </GLWMProvider>
  );
}

// Game launcher component
function GameLauncher() {
  const { 
    state, 
    license, 
    isLoading, 
    error,
    verifyAndPlay 
  } = useGLWM();
  
  const handleLaunch = async () => {
    try {
      const result = await verifyAndPlay();
      if (result.isValid) {
        // Navigate to game
        window.location.href = '/game';
      }
    } catch (err) {
      console.error('Launch failed:', err);
    }
  };
  
  if (state.status === 'license_valid') {
    return (
      <div className="launcher">
        <h1>Welcome back!</h1>
        <LicenseStatus showDetails />
        <button onClick={() => window.location.href = '/game'}>
          Play Now
        </button>
      </div>
    );
  }
  
  return (
    <div className="launcher">
      <h1>My Awesome Game</h1>
      
      <WalletConnectButton />
      
      {error && (
        <div className="error">{error.message}</div>
      )}
      
      <button 
        onClick={handleLaunch}
        disabled={isLoading}
      >
        {isLoading ? 'Checking...' : 'Launch Game'}
      </button>
    </div>
  );
}
```

### 7.3 Unity Integration

```csharp
// Unity integration

using UnityEngine;
using GLWM;

public class GameLauncher : MonoBehaviour
{
    [SerializeField] private string licenseContract;
    [SerializeField] private int chainId = 137;
    [SerializeField] private string mintingPortalUrl;
    
    private GLWMClient glwm;
    
    private void Start()
    {
        InitializeGLWM();
    }
    
    private void InitializeGLWM()
    {
        glwm = gameObject.AddComponent<GLWMClient>();
        
        var config = new GLWMConfig
        {
            LicenseContract = licenseContract,
            ChainId = chainId,
            RPCProvider = new RPCConfig
            {
                Provider = "alchemy",
                ApiKey = "your-api-key"
            },
            MintingPortal = new MintingPortalConfig
            {
                Url = mintingPortalUrl,
                Mode = PortalMode.WebView
            }
        };
        
        glwm.Initialize(config);
        
        // Subscribe to events
        glwm.OnWalletConnected += OnWalletConnected;
        glwm.OnLicenseVerified += OnLicenseVerified;
        glwm.OnMintCompleted += OnMintCompleted;
        glwm.OnError += OnError;
    }
    
    public async void LaunchGame()
    {
        try
        {
            var result = await glwm.VerifyAndPlayAsync();
            
            if (result.IsValid)
            {
                // Store player ID
                PlayerPrefs.SetString("PlayerWallet", result.License.Owner);
                
                // Load game scene
                SceneManager.LoadScene("MainGame");
            }
        }
        catch (GLWMException ex)
        {
            Debug.LogError($"GLWM Error: {ex.Message}");
            ShowErrorUI(ex.Message);
        }
    }
    
    private void OnWalletConnected(WalletConnection connection)
    {
        Debug.Log($"Wallet connected: {connection.Address}");
        UpdateUI();
    }
    
    private void OnLicenseVerified(LicenseVerificationResult result)
    {
        if (result.IsValid)
        {
            Debug.Log($"License valid: Token #{result.License.TokenId}");
        }
        else
        {
            Debug.Log($"No license found: {result.Reason}");
        }
    }
    
    private void OnMintCompleted(MintResult result)
    {
        if (result.Success)
        {
            Debug.Log($"Mint successful: Token #{result.TokenId}");
        }
    }
    
    private void OnError(GLWMError error)
    {
        Debug.LogError($"GLWM Error [{error.Code}]: {error.Message}");
        
        if (!error.Recoverable)
        {
            ShowFatalErrorUI(error.Message);
        }
    }
    
    private void OnDestroy()
    {
        if (glwm != null)
        {
            glwm.OnWalletConnected -= OnWalletConnected;
            glwm.OnLicenseVerified -= OnLicenseVerified;
            glwm.OnMintCompleted -= OnMintCompleted;
            glwm.OnError -= OnError;
            glwm.Dispose();
        }
    }
}
```

### 7.4 Unreal Engine Integration

```cpp
// Unreal Engine Blueprint-friendly integration

// GameLicenseManager.h
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GLWMSubsystem.h"
#include "GameLicenseManager.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnGameReady);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnLicenseError, FString, ErrorMessage);

UCLASS(BlueprintType)
class MYGAME_API AGameLicenseManager : public AActor
{
    GENERATED_BODY()
    
public:
    UPROPERTY(BlueprintAssignable, Category = "License")
    FOnGameReady OnGameReady;
    
    UPROPERTY(BlueprintAssignable, Category = "License")
    FOnLicenseError OnLicenseError;
    
    UFUNCTION(BlueprintCallable, Category = "License")
    void LaunchWithLicense();
    
    UFUNCTION(BlueprintPure, Category = "License")
    bool HasValidLicense() const;
    
    UFUNCTION(BlueprintPure, Category = "License")
    FString GetPlayerWalletAddress() const;
    
protected:
    virtual void BeginPlay() override;
    
private:
    UPROPERTY()
    UGLWMSubsystem* GLWMSubsystem;
    
    FLicenseNFT CurrentLicense;
    
    UFUNCTION()
    void HandleLicenseVerified(FLicenseVerificationResult Result);
    
    UFUNCTION()
    void HandleError(FGLWMError Error);
};

// GameLicenseManager.cpp
#include "GameLicenseManager.h"

void AGameLicenseManager::BeginPlay()
{
    Super::BeginPlay();
    
    GLWMSubsystem = GetGameInstance()->GetSubsystem<UGLWMSubsystem>();
    
    if (GLWMSubsystem)
    {
        // Configure
        FGLWMConfig Config;
        Config.LicenseContract = TEXT("0x1234...");
        Config.ChainId = 137;
        Config.RPCProvider.Provider = TEXT("alchemy");
        Config.RPCProvider.ApiKey = TEXT("your-api-key");
        Config.MintingPortal.Url = TEXT("https://mint.mygame.com");
        Config.MintingPortal.Mode = EPortalMode::WebView;
        
        GLWMSubsystem->Initialize(Config);
        
        // Bind events
        GLWMSubsystem->OnLicenseVerified.AddDynamic(this, &AGameLicenseManager::HandleLicenseVerified);
        GLWMSubsystem->OnError.AddDynamic(this, &AGameLicenseManager::HandleError);
    }
}

void AGameLicenseManager::LaunchWithLicense()
{
    if (GLWMSubsystem)
    {
        GLWMSubsystem->VerifyAndPlay();
    }
}

void AGameLicenseManager::HandleLicenseVerified(FLicenseVerificationResult Result)
{
    if (Result.IsValid)
    {
        CurrentLicense = Result.License;
        OnGameReady.Broadcast();
    }
}

void AGameLicenseManager::HandleError(FGLWMError Error)
{
    OnLicenseError.Broadcast(Error.Message);
}

bool AGameLicenseManager::HasValidLicense() const
{
    return !CurrentLicense.TokenId.IsEmpty();
}

FString AGameLicenseManager::GetPlayerWalletAddress() const
{
    return CurrentLicense.Owner;
}
```

---

## 8. Security Considerations

### 8.1 Threat Model

| Threat | Impact | Mitigation |
|--------|--------|------------|
| Wallet spoofing | High | Verify signatures, never trust client-provided addresses alone |
| RPC manipulation | Medium | Use multiple RPC providers, verify block numbers |
| Replay attacks | Medium | Include timestamps and nonces in verification requests |
| Portal injection | High | Validate portal origin, use CSP headers |
| Contract upgrade attacks | Critical | Use proxy patterns with timelock, multi-sig |

### 8.2 Security Best Practices

```typescript
// security-utils.ts

/**
 * Verify wallet ownership via signature
 * Use this for critical operations, not just presence of NFT
 */
async function verifyWalletOwnership(
  provider: ethers.BrowserProvider,
  expectedAddress: string
): Promise<boolean> {
  const nonce = crypto.randomUUID();
  const timestamp = Date.now();
  
  const message = `GLWM Verification\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
  
  const signer = await provider.getSigner();
  const signature = await signer.signMessage(message);
  
  const recoveredAddress = ethers.verifyMessage(message, signature);
  
  return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
}

/**
 * Validate RPC response integrity
 */
async function verifyRPCResponse(
  primaryProvider: ethers.JsonRpcProvider,
  fallbackProvider: ethers.JsonRpcProvider,
  address: string
): Promise<LicenseVerificationResult> {
  const [primary, fallback] = await Promise.all([
    queryLicense(primaryProvider, address),
    queryLicense(fallbackProvider, address)
  ]);
  
  // Compare results
  if (primary.isValid !== fallback.isValid) {
    throw new Error('RPC response mismatch - possible manipulation');
  }
  
  // Verify block numbers are close
  if (Math.abs(primary.blockNumber - fallback.blockNumber) > 5) {
    throw new Error('Block number discrepancy detected');
  }
  
  return primary;
}

/**
 * Server-side verification endpoint
 * Always verify on server for critical operations
 */
// server/verify-license.ts
import { ethers } from 'ethers';

export async function POST(request: Request) {
  const { address, signature, nonce } = await request.json();
  
  // Verify signature
  const message = `Verify ownership for ${address}\nNonce: ${nonce}`;
  const recovered = ethers.verifyMessage(message, signature);
  
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }
  
  // Query blockchain directly (don't trust client)
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const contract = new ethers.Contract(
    process.env.LICENSE_CONTRACT!,
    LICENSE_ABI,
    provider
  );
  
  const [hasLicense, tokenId] = await contract.hasValidLicense(address);
  
  return Response.json({
    valid: hasLicense,
    tokenId: tokenId.toString(),
    verifiedAt: Date.now()
  });
}
```

### 8.3 Rate Limiting & DDoS Protection

```typescript
// rpc-rate-limiter.ts

import { RateLimiter } from 'limiter';

class RateLimitedProvider {
  private provider: ethers.JsonRpcProvider;
  private limiter: RateLimiter;
  
  constructor(rpcUrl: string, requestsPerSecond: number = 10) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.limiter = new RateLimiter({
      tokensPerInterval: requestsPerSecond,
      interval: 'second'
    });
  }
  
  async call(method: string, params: any[]): Promise<any> {
    await this.limiter.removeTokens(1);
    return this.provider.send(method, params);
  }
}
```

---

## 9. Testing Requirements

### 9.1 Unit Tests

```typescript
// __tests__/license-verification.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LicenseVerificationLayer } from '../src/license-verification-layer';

describe('LicenseVerificationLayer', () => {
  let verifier: LicenseVerificationLayer;
  
  beforeEach(() => {
    verifier = new LicenseVerificationLayer({
      contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      chainId: 137,
      rpcUrl: 'https://polygon-rpc.com',
      cacheTTL: 300,
      retryAttempts: 3,
      retryDelay: 1000
    });
  });
  
  describe('verifyLicense', () => {
    it('should return valid result for license holder', async () => {
      // Mock contract call
      vi.spyOn(verifier['contract'], 'hasValidLicense')
        .mockResolvedValue([true, BigInt(123)]);
      
      vi.spyOn(verifier['contract'], 'getLicenseData')
        .mockResolvedValue([
          0, // edition
          BigInt(Date.now() / 1000),
          '0xOwner',
          false,
          BigInt(0),
          true,
          '0xOwner'
        ]);
      
      const result = await verifier.verifyLicense('0xOwner');
      
      expect(result.isValid).toBe(true);
      expect(result.license).not.toBeNull();
      expect(result.license?.tokenId).toBe('123');
    });
    
    it('should return invalid result for non-holder', async () => {
      vi.spyOn(verifier['contract'], 'hasValidLicense')
        .mockResolvedValue([false, BigInt(0)]);
      
      const result = await verifier.verifyLicense('0xNonHolder');
      
      expect(result.isValid).toBe(false);
      expect(result.license).toBeNull();
      expect(result.reason).toBe('no_license_found');
    });
    
    it('should cache results', async () => {
      const spy = vi.spyOn(verifier['contract'], 'hasValidLicense')
        .mockResolvedValue([true, BigInt(123)]);
      
      // First call
      await verifier.verifyLicense('0xOwner');
      
      // Second call (should use cache)
      await verifier.verifyLicense('0xOwner');
      
      expect(spy).toHaveBeenCalledTimes(1);
    });
    
    it('should bypass cache when requested', async () => {
      const spy = vi.spyOn(verifier['contract'], 'hasValidLicense')
        .mockResolvedValue([true, BigInt(123)]);
      
      await verifier.verifyLicense('0xOwner');
      await verifier.verifyLicense('0xOwner', true); // Bypass cache
      
      expect(spy).toHaveBeenCalledTimes(2);
    });
    
    it('should retry on failure', async () => {
      const spy = vi.spyOn(verifier['contract'], 'hasValidLicense')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue([true, BigInt(123)]);
      
      const result = await verifier.verifyLicense('0xOwner');
      
      expect(spy).toHaveBeenCalledTimes(3);
      expect(result.isValid).toBe(true);
    });
  });
  
  describe('watchForNewLicense', () => {
    it('should notify on new mint', async () => {
      const callback = vi.fn();
      
      verifier.watchForNewLicense('0xNewOwner', callback);
      
      // Simulate event
      verifier['contract'].emit('LicenseMinted', BigInt(456), '0xNewOwner', 0, BigInt(1e18));
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(callback).toHaveBeenCalled();
    });
  });
});
```

### 9.2 Integration Tests

```typescript
// __tests__/integration/full-flow.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GLWM } from '../src';
import { createTestProvider, deployTestContract, fundWallet } from './helpers';

describe('GLWM Full Flow Integration', () => {
  let glwm: GLWM;
  let contractAddress: string;
  let testWallet: ethers.Wallet;
  
  beforeAll(async () => {
    // Setup test environment
    const provider = createTestProvider();
    testWallet = ethers.Wallet.createRandom().connect(provider);
    
    // Fund test wallet
    await fundWallet(testWallet.address, '1.0');
    
    // Deploy test contract
    contractAddress = await deployTestContract(provider);
    
    // Initialize GLWM
    glwm = new GLWM({
      licenseContract: contractAddress,
      chainId: 31337, // Hardhat
      rpcProvider: {
        provider: 'custom',
        customUrl: 'http://localhost:8545'
      },
      mintingPortal: {
        url: 'http://localhost:3000/mint',
        mode: 'redirect'
      }
    });
    
    await glwm.initialize();
  });
  
  afterAll(async () => {
    await glwm.dispose();
  });
  
  it('should complete full license flow', async () => {
    // 1. Connect wallet (simulated)
    // ...
    
    // 2. Verify no license
    const initialCheck = await glwm.checkLicenseForAddress(testWallet.address);
    expect(initialCheck.isValid).toBe(false);
    
    // 3. Mint license directly on contract
    const contract = new ethers.Contract(contractAddress, LICENSE_ABI, testWallet);
    const tx = await contract.mintSimple(0, { value: ethers.parseEther('0.01') });
    await tx.wait();
    
    // 4. Verify license now valid
    const finalCheck = await glwm.verifyLicenseFresh();
    expect(finalCheck.isValid).toBe(true);
    expect(finalCheck.license?.owner.toLowerCase()).toBe(testWallet.address.toLowerCase());
  });
});
```

### 9.3 E2E Tests

```typescript
// __tests__/e2e/mint-flow.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Minting Portal E2E', () => {
  test('should complete mint flow', async ({ page }) => {
    // Navigate to game launcher
    await page.goto('http://localhost:3000/launcher');
    
    // Click connect wallet
    await page.click('[data-testid="connect-wallet"]');
    
    // Select MetaMask (mocked in test)
    await page.click('[data-testid="wallet-metamask"]');
    
    // Wait for wallet connection
    await expect(page.locator('[data-testid="wallet-address"]')).toBeVisible();
    
    // Click play - should open mint portal
    await page.click('[data-testid="play-button"]');
    
    // Verify mint portal opened
    const portal = page.frameLocator('[data-testid="mint-portal-iframe"]');
    await expect(portal.locator('.mint-portal')).toBeVisible();
    
    // Select edition
    await portal.locator('.edition-card').first().click();
    
    // Click mint
    await portal.locator('.mint-button').click();
    
    // Wait for success (mocked transaction)
    await expect(portal.locator('.success-message')).toBeVisible({ timeout: 10000 });
    
    // Portal should auto-close
    await expect(page.locator('[data-testid="mint-portal-iframe"]')).not.toBeVisible({ timeout: 5000 });
    
    // Game should now be accessible
    await expect(page.locator('[data-testid="game-ready"]')).toBeVisible();
  });
});
```

---

## 10. Deployment Checklist

### 10.1 Pre-Deployment

- [ ] Smart contract audited by reputable firm
- [ ] Contract deployed to testnet, thoroughly tested
- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Security review completed
- [ ] Rate limiting configured
- [ ] Monitoring and alerting setup
- [ ] Fallback RPC providers configured
- [ ] Error tracking integration (Sentry, etc.)

### 10.2 Contract Deployment

- [ ] Deploy to mainnet with correct parameters
- [ ] Verify contract on block explorer
- [ ] Configure editions and pricing
- [ ] Set treasury address
- [ ] Set royalty percentage
- [ ] Transfer ownership to multisig
- [ ] Test mint on mainnet (small amount)

### 10.3 SDK Release

- [ ] Build and test all platform SDKs
- [ ] Publish to npm (@glwm/sdk, @glwm/react)
- [ ] Publish to Unity Asset Store
- [ ] Publish to Unreal Marketplace
- [ ] Documentation published
- [ ] Example projects available
- [ ] Migration guide for updates

### 10.4 Minting Portal

- [ ] Deploy to production CDN
- [ ] SSL certificate configured
- [ ] CORS headers set correctly
- [ ] CSP headers configured
- [ ] Rate limiting enabled
- [ ] Analytics tracking enabled
- [ ] Error boundary in place

---

## 11. Game Wallet Hub (Optional Extension)

### 11.1 Hub Overview

A companion app that aggregates all game licenses owned by a user, similar to Steam but decentralized.

```typescript
// game-wallet-hub/types.ts

interface GameRegistry {
  gameId: string;
  name: string;
  developer: string;
  licenseContract: string;
  chainId: ChainId;
  iconUrl: string;
  launchUrl: string;
  supportedPlatforms: Platform[];
}

interface OwnedGame {
  game: GameRegistry;
  license: LicenseNFT;
  lastPlayed?: number;
  playtime?: number; // Optional on-chain playtime tracking
}

interface HubConfig {
  registryContract: string; // Registry of all supported games
  chainIds: ChainId[];      // Chains to scan for licenses
}

class GameWalletHub {
  private wallet: WalletConnection | null = null;
  private ownedGames: OwnedGame[] = [];
  
  async connect(): Promise<void>;
  async scanForGames(): Promise<OwnedGame[]>;
  async launchGame(gameId: string): Promise<void>;
  async refreshGame(gameId: string): Promise<OwnedGame>;
  
  // Cross-game features
  async getSharedAchievements(): Promise<Achievement[]>;
  async getPlaytimeStats(): Promise<PlaytimeStats>;
}
```

### 11.2 Registry Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title GameRegistry
 * @notice Central registry of games using GLWM license system
 */
contract GameRegistry is AccessControl {
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    
    struct GameInfo {
        string name;
        address developer;
        address licenseContract;
        uint256 chainId;
        string metadataUri;
        bool active;
    }
    
    mapping(bytes32 => GameInfo) public games;
    bytes32[] public gameIds;
    
    event GameRegistered(bytes32 indexed gameId, string name, address licenseContract);
    event GameUpdated(bytes32 indexed gameId);
    event GameDeactivated(bytes32 indexed gameId);
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REGISTRAR_ROLE, msg.sender);
    }
    
    function registerGame(
        string calldata name,
        address licenseContract,
        uint256 chainId,
        string calldata metadataUri
    ) external onlyRole(REGISTRAR_ROLE) returns (bytes32) {
        bytes32 gameId = keccak256(abi.encodePacked(name, licenseContract, chainId));
        
        require(games[gameId].licenseContract == address(0), "Game already registered");
        
        games[gameId] = GameInfo({
            name: name,
            developer: msg.sender,
            licenseContract: licenseContract,
            chainId: chainId,
            metadataUri: metadataUri,
            active: true
        });
        
        gameIds.push(gameId);
        
        emit GameRegistered(gameId, name, licenseContract);
        
        return gameId;
    }
    
    function getActiveGames() external view returns (bytes32[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < gameIds.length; i++) {
            if (games[gameIds[i]].active) count++;
        }
        
        bytes32[] memory active = new bytes32[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < gameIds.length; i++) {
            if (games[gameIds[i]].active) {
                active[j++] = gameIds[i];
            }
        }
        
        return active;
    }
    
    function getGameInfo(bytes32 gameId) external view returns (GameInfo memory) {
        return games[gameId];
    }
}
```

---

## Appendix A: Chain Configuration Reference

| Chain | ID | RPC | Explorer | Currency |
|-------|-----|-----|----------|----------|
| Ethereum | 1 | https://eth.llamarpc.com | https://etherscan.io | ETH |
| Polygon | 137 | https://polygon-rpc.com | https://polygonscan.com | MATIC |
| Base | 8453 | https://mainnet.base.org | https://basescan.org | ETH |
| Arbitrum | 42161 | https://arb1.arbitrum.io/rpc | https://arbiscan.io | ETH |
| Optimism | 10 | https://mainnet.optimism.io | https://optimistic.etherscan.io | ETH |
| Avalanche | 43114 | https://api.avax.network/ext/bc/C/rpc | https://snowtrace.io | AVAX |

---

## Appendix B: Error Code Reference

| Code | Description | Recovery |
|------|-------------|----------|
| WALLET_NOT_FOUND | No supported wallet detected | Prompt user to install wallet |
| WALLET_CONNECTION_REJECTED | User rejected connection | Show retry option |
| WALLET_DISCONNECTED | Wallet disconnected mid-session | Auto-reconnect or prompt |
| CHAIN_MISMATCH | Wrong network selected | Prompt chain switch |
| RPC_ERROR | Blockchain query failed | Retry with fallback RPC |
| CONTRACT_ERROR | Smart contract call reverted | Check contract state |
| VERIFICATION_FAILED | License verification error | Retry or manual check |
| MINT_FAILED | Mint transaction failed | Show error details |
| MINT_REJECTED | User rejected mint transaction | Show retry option |
| INSUFFICIENT_FUNDS | Not enough balance for mint | Show required amount |
| USER_CANCELLED | User cancelled operation | Return to previous state |
| NETWORK_ERROR | General network failure | Retry with backoff |
| CONFIGURATION_ERROR | Invalid SDK configuration | Developer must fix |

---

## Appendix C: SDK Package Structure

```
@glwm/
├── sdk/                    # Core SDK
│   ├── src/
│   │   ├── index.ts
│   │   ├── glwm.ts
│   │   ├── wallet-auth-layer.ts
│   │   ├── license-verification-layer.ts
│   │   ├── minting-portal-controller.ts
│   │   ├── types.ts
│   │   └── errors.ts
│   ├── package.json
│   └── tsconfig.json
│
├── react/                  # React bindings
│   ├── src/
│   │   ├── index.ts
│   │   ├── GLWMProvider.tsx
│   │   ├── useGLWM.ts
│   │   ├── WalletConnectButton.tsx
│   │   └── LicenseStatus.tsx
│   └── package.json
│
├── contracts/              # Smart contracts
│   ├── contracts/
│   │   ├── GameLicenseNFT.sol
│   │   └── GameRegistry.sol
│   ├── scripts/
│   │   └── deploy.ts
│   └── hardhat.config.ts
│
└── portal/                 # Minting portal
    ├── src/
    │   ├── App.tsx
    │   ├── index.tsx
    │   └── styles.css
    └── package.json
```

---

*Document Version: 1.0.0*
*Last Updated: 2025-01-10*
*Author: GLWM Architecture Team*
