# GLWM SDK Compliance Guide

This document outlines compliance considerations for using the GLWM SDK in your applications.

## Table of Contents

- [GDPR Compliance](#gdpr-compliance)
- [CCPA Compliance](#ccpa-compliance)
- [Data Handling](#data-handling)
- [Blockchain Considerations](#blockchain-considerations)
- [SDK Compliance Features](#sdk-compliance-features)
- [Implementation Checklist](#implementation-checklist)

---

## GDPR Compliance

The General Data Protection Regulation (GDPR) applies to applications processing personal data of EU residents.

### Personal Data Processed by GLWM

| Data Type | Classification | Retention | Purpose |
|-----------|---------------|-----------|---------|
| Wallet Address | Pseudonymous PII | Session/Cache TTL | License verification |
| Chain ID | Technical data | Session | Network identification |
| Session ID | Technical data | Session | Session tracking |
| Token ID | Pseudonymous PII | Cache TTL | License ownership |

### GDPR Considerations

#### 1. Lawful Basis for Processing

The SDK processes wallet addresses for **contract performance** (verifying game licenses). Ensure you have:

- **Terms of Service** that explain wallet data usage
- **Privacy Policy** disclosing blockchain interactions
- User consent for any additional data collection

#### 2. Data Minimization

The SDK follows data minimization principles:

- ✅ Only collects data necessary for license verification
- ✅ No personal identifiers beyond wallet addresses
- ✅ No tracking across sessions (unless caching enabled)
- ✅ No data sharing with third parties (except blockchain queries)

#### 3. Right to Erasure

To support "right to be forgotten":

```typescript
// Clear all cached user data
glwm.clearCache();

// Disconnect and clear session
await glwm.disconnectWallet();
await glwm.dispose();
```

**Note:** Blockchain transactions are immutable. Inform users that on-chain data (NFT ownership records) cannot be deleted.

#### 4. Data Portability

Wallet addresses and NFT ownership are inherently portable - users control their own wallet and can use it with any compatible application.

#### 5. Privacy by Design

The SDK implements privacy by design:

- No unnecessary data collection
- Secure configuration management
- Sensitive data masking in logs
- User-controlled wallet interactions

---

## CCPA Compliance

The California Consumer Privacy Act (CCPA) applies to businesses serving California residents.

### CCPA Categories

| Category | SDK Data | Notes |
|----------|----------|-------|
| Identifiers | Wallet address | Pseudonymous |
| Commercial info | License/NFT ownership | On-chain data |
| Internet activity | RPC requests | Technical logs |

### CCPA Rights Implementation

#### Right to Know

Disclose in your privacy policy:
- Wallet addresses are used for license verification
- Data is queried from public blockchain
- Optional caching stores verification results locally

#### Right to Delete

```typescript
// Clear local data
glwm.clearCache();
await glwm.dispose();
```

#### Right to Opt-Out

The SDK does not sell personal information. If your application does, implement opt-out mechanisms separately.

---

## Data Handling

### Data Storage Locations

| Data | Storage | Encryption | User Control |
|------|---------|------------|--------------|
| Wallet address | Memory/Cache | N/A (public) | Clear via `clearCache()` |
| Session data | Memory | N/A | Clear via `dispose()` |
| Cache | LocalStorage | N/A | Clear via `clearCache()` |
| Logs | Memory/Console | N/A | Configure log level |
| Metrics | Memory/Reporter | N/A | Disable via config |

### Data Flow

```
User Wallet → GLWM SDK → RPC Provider → Blockchain
                ↓
           Local Cache (optional)
                ↓
           Your Application
```

### Third-Party Data Sharing

| Third Party | Data Shared | Purpose |
|-------------|-------------|---------|
| RPC Provider (Alchemy/Infura) | Wallet address, contract queries | Blockchain access |
| Blockchain Network | Transaction data | On-chain operations |
| Minting Portal | Wallet address | NFT minting |
| Error Reporter (Sentry) | Error details, context | Debugging (optional) |

---

## Blockchain Considerations

### Public Nature of Blockchain Data

**Important:** Blockchain data is public and permanent.

- Wallet addresses are visible on-chain
- NFT ownership is publicly verifiable
- Transaction history is immutable

Users should be informed that:
1. Their wallet address will be queried against public blockchain
2. NFT minting creates permanent on-chain records
3. This data cannot be "deleted" from the blockchain

### Pseudonymity vs Anonymity

Wallet addresses are **pseudonymous**, not anonymous:
- They don't directly reveal identity
- But can be linked to identity through exchanges, ENS, etc.
- Consider this when designing your privacy policy

---

## SDK Compliance Features

### 1. Configurable Logging

```typescript
// Disable logging for privacy
const glwm = new GLWM({
  ...config,
  logLevel: 'silent',
});
```

### 2. Sensitive Data Masking

The SDK automatically masks sensitive values in logs:
- API keys
- Private keys (never handled, but masked if accidentally logged)
- Tokens and secrets

### 3. Optional Caching

```typescript
// Disable caching to avoid storing user data
const glwm = new GLWM({
  ...config,
  cacheConfig: {
    enabled: false,
    ttlSeconds: 0,
    storageKey: '',
  },
});
```

### 4. Optional Telemetry

```typescript
// Disable telemetry
const metrics = Metrics.getInstance({
  enabled: false,
});
```

### 5. User-Controlled Sessions

```typescript
// Users control their wallet connection
await glwm.connectWallet();    // User approves in wallet
await glwm.disconnectWallet(); // User can disconnect anytime
```

---

## Implementation Checklist

### Privacy Policy Requirements

- [ ] Disclose wallet address collection and usage
- [ ] Explain blockchain data is public and permanent
- [ ] List third-party services (RPC providers, minting portal)
- [ ] Describe caching behavior and user controls
- [ ] Explain error reporting if enabled

### Technical Implementation

- [ ] Implement data deletion endpoints using SDK methods
- [ ] Configure appropriate cache TTL for your use case
- [ ] Set log level appropriately for production
- [ ] Review error reporting configuration
- [ ] Test `clearCache()` and `dispose()` flows

### User Experience

- [ ] Provide clear wallet connection prompts
- [ ] Explain what data is accessed during verification
- [ ] Offer easy disconnect/logout functionality
- [ ] Show privacy-related settings if applicable

### Documentation

- [ ] Update Terms of Service for blockchain interactions
- [ ] Create user-facing privacy documentation
- [ ] Document data retention policies
- [ ] Prepare for data subject requests

---

## Regional Considerations

### European Union (GDPR)

- Requires lawful basis for processing
- Must support data subject rights
- Consider Data Protection Impact Assessment (DPIA)

### California (CCPA)

- Requires privacy policy disclosures
- Must honor opt-out requests
- Annual updates may be required

### Other Jurisdictions

Consider compliance with:
- LGPD (Brazil)
- POPIA (South Africa)
- PDPA (Singapore, Thailand)
- APPI (Japan)

---

## Healthcare Applications (HIPAA)

If using GLWM for healthcare-related games:

**Warning:** The GLWM SDK is NOT designed for HIPAA compliance.

- Do NOT store Protected Health Information (PHI) in SDK
- Do NOT link wallet addresses to health data
- Consider a separate, HIPAA-compliant system for health data

---

## Financial Applications

If using GLWM for financial services:

Consider additional regulations:
- AML/KYC requirements may apply
- Securities regulations for certain NFT types
- State money transmitter laws

Consult legal counsel for financial applications.

---

## Contact

For compliance questions related to the SDK itself, please open an issue on GitHub.

For compliance questions related to your specific implementation, consult with qualified legal counsel familiar with your jurisdiction and use case.
