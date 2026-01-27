/**
 * Metrics Collection Utility
 *
 * Provides SDK telemetry and performance metrics collection.
 * All data collection is opt-in and respects user privacy.
 */

import { logger } from './Logger';

/**
 * Metric types
 */
export type MetricType = 'counter' | 'gauge' | 'histogram' | 'timing';

/**
 * Metric entry
 */
export interface MetricEntry {
  name: string;
  type: MetricType;
  value: number;
  tags?: Record<string, string>;
  timestamp: number;
}

/**
 * Timing measurement
 */
export interface TimingMeasurement {
  name: string;
  duration: number;
  tags?: Record<string, string>;
}

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  /** Enable metrics collection */
  enabled: boolean;
  /** Custom metrics reporter */
  reporter?: (metrics: MetricEntry[]) => void | Promise<void>;
  /** Flush interval in milliseconds */
  flushIntervalMs?: number;
  /** Maximum buffer size before auto-flush */
  maxBufferSize?: number;
  /** Include SDK version in tags */
  includeVersion?: boolean;
  /** Include environment in tags */
  environment?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<MetricsConfig> = {
  enabled: false,
  reporter: () => {},
  flushIntervalMs: 30000, // 30 seconds
  maxBufferSize: 100,
  includeVersion: true,
  environment: 'production',
};

/**
 * Pre-defined metric names
 */
export const MetricNames = {
  // Initialization
  SDK_INITIALIZED: 'glwm.sdk.initialized',
  SDK_INIT_DURATION: 'glwm.sdk.init_duration',

  // Wallet
  WALLET_CONNECTION_ATTEMPTS: 'glwm.wallet.connection_attempts',
  WALLET_CONNECTION_SUCCESS: 'glwm.wallet.connection_success',
  WALLET_CONNECTION_FAILED: 'glwm.wallet.connection_failed',
  WALLET_CONNECTION_DURATION: 'glwm.wallet.connection_duration',
  WALLET_DISCONNECTIONS: 'glwm.wallet.disconnections',

  // License verification
  LICENSE_VERIFICATION_ATTEMPTS: 'glwm.license.verification_attempts',
  LICENSE_VERIFICATION_SUCCESS: 'glwm.license.verification_success',
  LICENSE_VERIFICATION_FAILED: 'glwm.license.verification_failed',
  LICENSE_VERIFICATION_DURATION: 'glwm.license.verification_duration',
  LICENSE_CACHE_HITS: 'glwm.license.cache_hits',
  LICENSE_CACHE_MISSES: 'glwm.license.cache_misses',

  // Minting
  MINTING_PORTAL_OPENED: 'glwm.minting.portal_opened',
  MINTING_PORTAL_CLOSED: 'glwm.minting.portal_closed',
  MINTING_SUCCESS: 'glwm.minting.success',
  MINTING_FAILED: 'glwm.minting.failed',
  MINTING_CANCELLED: 'glwm.minting.cancelled',

  // RPC
  RPC_REQUESTS: 'glwm.rpc.requests',
  RPC_ERRORS: 'glwm.rpc.errors',
  RPC_LATENCY: 'glwm.rpc.latency',

  // Errors
  ERRORS_TOTAL: 'glwm.errors.total',
} as const;

/**
 * Metrics collector class
 */
export class Metrics {
  private static instance: Metrics | null = null;
  private config: Required<MetricsConfig>;
  private buffer: MetricEntry[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private timings: Map<string, number> = new Map();

  constructor(config?: Partial<MetricsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.enabled && this.config.flushIntervalMs > 0) {
      this.startAutoFlush();
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<MetricsConfig>): Metrics {
    if (!Metrics.instance) {
      Metrics.instance = new Metrics(config);
    } else if (config) {
      Metrics.instance.configure(config);
    }
    return Metrics.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    if (Metrics.instance) {
      Metrics.instance.stop();
      Metrics.instance = null;
    }
  }

  /**
   * Update configuration
   */
  configure(config: Partial<MetricsConfig>): void {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    // Handle enable/disable transitions
    if (!wasEnabled && this.config.enabled) {
      this.startAutoFlush();
    } else if (wasEnabled && !this.config.enabled) {
      this.stopAutoFlush();
    }
  }

  /**
   * Increment a counter metric
   */
  increment(name: string, value: number = 1, tags?: Record<string, string>): void {
    this.record({
      name,
      type: 'counter',
      value,
      tags: this.enrichTags(tags),
      timestamp: Date.now(),
    });
  }

  /**
   * Set a gauge metric
   */
  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.record({
      name,
      type: 'gauge',
      value,
      tags: this.enrichTags(tags),
      timestamp: Date.now(),
    });
  }

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number, tags?: Record<string, string>): void {
    this.record({
      name,
      type: 'histogram',
      value,
      tags: this.enrichTags(tags),
      timestamp: Date.now(),
    });
  }

  /**
   * Record a timing measurement
   */
  timing(name: string, durationMs: number, tags?: Record<string, string>): void {
    this.record({
      name,
      type: 'timing',
      value: durationMs,
      tags: this.enrichTags(tags),
      timestamp: Date.now(),
    });
  }

  /**
   * Start a timer
   */
  startTimer(name: string): string {
    const timerId = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.timings.set(timerId, performance.now());
    return timerId;
  }

  /**
   * Stop a timer and record the duration
   */
  stopTimer(timerId: string, tags?: Record<string, string>): number {
    const startTime = this.timings.get(timerId);
    if (startTime === undefined) {
      logger.warn('Timer not found', { timerId });
      return 0;
    }

    const duration = performance.now() - startTime;
    this.timings.delete(timerId);

    // Extract metric name from timer ID
    const name = timerId.split('_')[0] ?? timerId;
    this.timing(name, duration, tags);

    return duration;
  }

  /**
   * Measure async function execution time
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> {
    const timerId = this.startTimer(name);
    try {
      const result = await fn();
      this.stopTimer(timerId, { ...tags, status: 'success' });
      return result;
    } catch (error) {
      this.stopTimer(timerId, { ...tags, status: 'error' });
      throw error;
    }
  }

  /**
   * Record a metric entry
   */
  private record(entry: MetricEntry): void {
    if (!this.config.enabled) {
      return;
    }

    this.buffer.push(entry);

    // Auto-flush if buffer is full
    if (this.buffer.length >= this.config.maxBufferSize) {
      this.flush().catch((err) => {
        logger.error('Failed to flush metrics', { error: err });
      });
    }
  }

  /**
   * Enrich tags with default values
   */
  private enrichTags(tags?: Record<string, string>): Record<string, string> {
    const enriched: Record<string, string> = { ...tags };

    if (this.config.includeVersion) {
      enriched.sdk_version = '0.1.0'; // Should be dynamic
    }

    if (this.config.environment) {
      enriched.environment = this.config.environment;
    }

    return enriched;
  }

  /**
   * Flush buffered metrics to reporter
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const metrics = [...this.buffer];
    this.buffer = [];

    try {
      await this.config.reporter(metrics);
      logger.debug('Metrics flushed', { count: metrics.length });
    } catch (error) {
      logger.error('Failed to report metrics', { error });
      // Re-add to buffer on failure (with limit)
      if (this.buffer.length + metrics.length <= this.config.maxBufferSize * 2) {
        this.buffer.unshift(...metrics);
      }
    }
  }

  /**
   * Start auto-flush interval
   */
  private startAutoFlush(): void {
    if (this.flushInterval) {
      return;
    }

    this.flushInterval = setInterval(() => {
      this.flush().catch((err) => {
        logger.error('Auto-flush failed', { error: err });
      });
    }, this.config.flushIntervalMs);
  }

  /**
   * Stop auto-flush interval
   */
  private stopAutoFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Stop metrics collection and flush remaining
   */
  async stop(): Promise<void> {
    this.stopAutoFlush();
    await this.flush();
  }

  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Check if metrics are enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

/**
 * Global metrics instance
 */
export const metrics = Metrics.getInstance();
