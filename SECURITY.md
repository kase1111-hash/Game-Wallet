# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security Measures

### Input Validation

The GLWM SDK implements comprehensive input validation:

| Input | Validation |
|-------|------------|
| `licenseContract` | Valid Ethereum address (checksummed, 40 hex chars) |
| `chainId` | Positive integer, valid EIP-155 chain ID |
| `rpcProvider.apiKey` | Non-empty string when required |
| `rpcProvider.customUrl` | Valid HTTPS URL |
| `mintingPortal.url` | Valid URL |
| `mintingPortal.mode` | Enum: 'iframe', 'redirect' |

All inputs are validated before SDK initialization using `GLWM.validateConfig()`.

### Wallet Security

- **No Private Key Access**: The SDK never has access to private keys. All signing operations are delegated to external wallet providers (MetaMask, WalletConnect, etc.)
- **Chain Verification**: The SDK verifies the connected chain matches the configured `chainId` before any operations
- **User Consent**: All blockchain interactions require explicit user approval through their wallet

### Configuration Security

- **Environment Variables**: Sensitive values (API keys) should be stored in environment variables
- **Sensitive Value Masking**: The `Config` utility masks sensitive values in logs
- **No Hardcoded Secrets**: No API keys or secrets are hardcoded in the codebase

```typescript
// Sensitive keys that are automatically masked in logs
const sensitiveKeys = [
  'apiKey',
  'privateKey',
  'secret',
  'password',
  'token',
  'authorization',
];
```

### Error Handling

- **Sanitized Error Messages**: Error messages do not expose sensitive data
- **Structured Error Codes**: All errors use predefined codes for safe handling
- **Graceful Degradation**: The SDK handles failures gracefully without exposing internals

### Dependencies

- **Minimal Dependencies**: The SDK uses minimal external dependencies
- **Regular Audits**: Dependencies are regularly audited using `npm audit`
- **Lockfile**: `package-lock.json` ensures reproducible builds

Current audit status: **0 vulnerabilities**

### Code Quality

- **TypeScript**: Full TypeScript with strict mode for type safety
- **ESLint**: Static analysis for code quality issues
- **Prettier**: Consistent code formatting
- **Unit Tests**: 135+ tests with comprehensive coverage

## Security Checklist

### For SDK Users

- [ ] Store API keys in environment variables, not in code
- [ ] Use HTTPS URLs for RPC providers and minting portal
- [ ] Validate user inputs before passing to SDK
- [ ] Keep SDK updated to latest version
- [ ] Use server-side verification for critical license checks
- [ ] Implement rate limiting for verification requests
- [ ] Monitor for suspicious activity

### For Contributors

- [ ] Never commit secrets or API keys
- [ ] Run `npm audit` before submitting PRs
- [ ] Add input validation for new user inputs
- [ ] Sanitize error messages
- [ ] Add tests for security-critical code paths
- [ ] Document security implications of changes

## Known Limitations

1. **Client-Side SDK**: The SDK runs client-side and is visible to users. Do not rely solely on client-side verification for security-critical decisions.

2. **Cache Tampering**: Local cache can be manipulated. Use server-side verification for critical checks.

3. **RPC Trust**: The SDK trusts RPC provider responses. Use reputable providers (Alchemy, Infura) and consider running your own node for critical applications.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email security concerns to the maintainers
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a detailed response within 7 days.

## Security Updates

Security updates are released as patch versions (e.g., 0.1.1, 0.1.2).

To stay updated:
```bash
# Check for updates
npm outdated @glwm/sdk

# Update to latest patch version
npm update @glwm/sdk
```

## Audit History

| Date | Auditor | Scope | Result |
|------|---------|-------|--------|
| 2024-01-10 | npm audit | Dependencies | 0 vulnerabilities |
| 2024-01-10 | ESLint | Code quality | Pass |
| 2024-01-10 | TypeScript | Type safety | Pass (strict mode) |
