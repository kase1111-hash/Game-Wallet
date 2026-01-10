/**
 * Game License Wallet Module (GLWM) SDK
 *
 * NFT-based license verification SDK for game developers.
 * Enables wallet authentication, on-chain license verification,
 * and seamless minting flow.
 *
 * @packageDocumentation
 */

// Export all types
export * from './types';

// Export main SDK class
export { GLWM } from './GLWM';

// Export individual components for advanced usage
export { RPCProvider } from './rpc';
export { WalletConnector } from './wallet';
export { LicenseVerifier } from './license';
export { MintingPortal } from './minting';

// Export utilities
export {
  Cache,
  Logger,
  LogLevel,
  logger,
  ErrorReporter,
  errorReporter,
  ConfigManager,
  configManager,
  createConfigFromEnv,
  ENV_KEYS,
} from './utils';

export type {
  LoggerConfig,
  LogEntry,
  ErrorReporterConfig,
  ErrorReport,
  Breadcrumb,
  ExtendedGLWMConfig,
} from './utils';
