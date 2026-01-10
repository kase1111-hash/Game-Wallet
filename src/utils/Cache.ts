import type { CacheConfig, LicenseVerificationResult } from '../types';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Local cache for verification results and other data
 */
export class Cache {
  private config: CacheConfig;
  private memoryCache: Map<string, CacheEntry<unknown>> = new Map();

  constructor(config: CacheConfig) {
    this.config = config;
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get cached verification result for an address
   */
  getVerification(address: string): LicenseVerificationResult | null {
    if (!this.config.enabled) {
      return null;
    }

    const key = this.buildKey('verification', address.toLowerCase());
    return this.get<LicenseVerificationResult>(key);
  }

  /**
   * Cache a verification result
   */
  setVerification(address: string, result: LicenseVerificationResult): void {
    if (!this.config.enabled) {
      return;
    }

    const key = this.buildKey('verification', address.toLowerCase());
    this.set(key, result);
  }

  /**
   * Clear verification cache for an address
   */
  clearVerification(address: string): void {
    const key = this.buildKey('verification', address.toLowerCase());
    this.delete(key);
  }

  /**
   * Clear all cached data
   */
  clearAll(): void {
    this.memoryCache.clear();

    if (typeof localStorage !== 'undefined') {
      const prefix = this.config.storageKey;
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
    }
  }

  /**
   * Get a value from cache
   */
  private get<T>(key: string): T | null {
    // Try memory cache first
    const memoryEntry = this.memoryCache.get(key) as CacheEntry<T> | undefined;
    if (memoryEntry) {
      if (Date.now() < memoryEntry.expiresAt) {
        return memoryEntry.data;
      }
      this.memoryCache.delete(key);
    }

    // Try localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const entry = JSON.parse(stored) as CacheEntry<T>;
          if (Date.now() < entry.expiresAt) {
            // Restore to memory cache
            this.memoryCache.set(key, entry);
            return entry.data;
          }
          localStorage.removeItem(key);
        }
      } catch {
        // Ignore localStorage errors
      }
    }

    return null;
  }

  /**
   * Set a value in cache
   */
  private set<T>(key: string, data: T): void {
    const entry: CacheEntry<T> = {
      data,
      expiresAt: Date.now() + this.config.ttlSeconds * 1000,
    };

    // Store in memory
    this.memoryCache.set(key, entry);

    // Store in localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, JSON.stringify(entry));
      } catch {
        // Ignore localStorage errors (e.g., quota exceeded)
      }
    }
  }

  /**
   * Delete a value from cache
   */
  private delete(key: string): void {
    this.memoryCache.delete(key);

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore localStorage errors
      }
    }
  }

  /**
   * Build a cache key with the configured prefix
   */
  private buildKey(...parts: string[]): string {
    return [this.config.storageKey, ...parts].join(':');
  }
}
