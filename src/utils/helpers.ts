import { getAddress, isAddress } from 'ethers';

/**
 * Generate a unique session ID using cryptographically secure random values
 */
export function generateSessionId(): string {
  // Prefer crypto.randomUUID if available (most modern environments)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback using crypto.getRandomValues (more secure than Math.random)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    // Set version (4) and variant bits
    // Using non-null assertion as we know indices 6 and 8 exist in a 16-byte array
    bytes[6] = (bytes[6]! & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8]! & 0x3f) | 0x80; // Variant 10

    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Last resort fallback for very old environments (not cryptographically secure)
  // This should rarely be reached in practice
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Convert an address to checksummed format
 */
export function checksumAddress(address: string): string {
  try {
    return getAddress(address);
  } catch {
    throw new Error(`Invalid address: ${address}`);
  }
}

/**
 * Check if a string is a valid Ethereum address
 */
export function isValidAddress(address: string): boolean {
  return isAddress(address);
}

/**
 * Delay execution for specified milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts - 1) {
        await delay(baseDelayMs * Math.pow(2, attempt));
      }
    }
  }

  throw lastError ?? new Error('Retry failed');
}

/**
 * A JSON-safe summary of an error, for GLWMError.details. Raw errors can hold values that
 * JSON.stringify() rejects (an ethers CALL_EXCEPTION carries BigInt call arguments), and apps
 * commonly log or send `details` from onError.
 */
export interface ErrorSummary {
  message: string;
  name?: string;
  code?: string | number;
  shortMessage?: string;
  reason?: string;
}

export function summarizeError(error: unknown): ErrorSummary {
  if (typeof error !== 'object' || error === null) {
    return { message: String(error) };
  }
  // A getter that throws (some error classes compute fields lazily) must not escape from here
  const read = (key: string): unknown => {
    try {
      return (error as Record<string, unknown>)[key];
    } catch {
      return undefined;
    }
  };
  const message = read('message');
  const summary: ErrorSummary = {
    message: typeof message === 'string' ? message : 'Unknown error',
  };
  const name = read('name');
  if (typeof name === 'string') {
    summary.name = name;
  }
  const code = read('code');
  if (typeof code === 'string' || typeof code === 'number') {
    summary.code = code;
  }
  const shortMessage = read('shortMessage');
  if (typeof shortMessage === 'string') {
    summary.shortMessage = shortMessage;
  }
  const reason = read('reason');
  if (typeof reason === 'string') {
    summary.reason = reason;
  }
  return summary;
}
