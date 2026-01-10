import type { GLWMError } from '../types';
import { logger, LogLevel } from './Logger';

/**
 * Error reporter configuration
 */
export interface ErrorReporterConfig {
  enabled: boolean;
  dsn?: string; // Sentry DSN or similar
  environment?: string;
  release?: string;
  sampleRate?: number;
  beforeSend?: (error: ErrorReport) => ErrorReport | null;
  customReporter?: (error: ErrorReport) => void | Promise<void>;
}

/**
 * Error report structure
 */
export interface ErrorReport {
  error: Error | GLWMError;
  message: string;
  level: 'error' | 'warning' | 'info';
  timestamp: Date;
  context?: Record<string, unknown>;
  tags?: Record<string, string>;
  user?: {
    walletAddress?: string;
    sessionId?: string;
  };
  breadcrumbs?: Breadcrumb[];
}

/**
 * Breadcrumb for tracking user actions
 */
export interface Breadcrumb {
  type: 'navigation' | 'action' | 'error' | 'info';
  category: string;
  message: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

const DEFAULT_CONFIG: ErrorReporterConfig = {
  enabled: false,
  environment: 'development',
  sampleRate: 1.0,
};

/**
 * Error reporting service for tracking and reporting errors
 */
export class ErrorReporter {
  private config: ErrorReporterConfig;
  private static instance: ErrorReporter | null = null;
  private breadcrumbs: Breadcrumb[] = [];
  private maxBreadcrumbs = 100;
  private userContext: ErrorReport['user'] = {};

  constructor(config: Partial<ErrorReporterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get or create singleton instance
   */
  static getInstance(config?: Partial<ErrorReporterConfig>): ErrorReporter {
    if (!ErrorReporter.instance) {
      ErrorReporter.instance = new ErrorReporter(config);
    } else if (config) {
      ErrorReporter.instance.configure(config);
    }
    return ErrorReporter.instance;
  }

  /**
   * Reset the singleton instance
   */
  static resetInstance(): void {
    ErrorReporter.instance = null;
  }

  /**
   * Update configuration
   */
  configure(config: Partial<ErrorReporterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set user context for error reports
   */
  setUser(user: ErrorReport['user']): void {
    this.userContext = { ...this.userContext, ...user };
  }

  /**
   * Clear user context
   */
  clearUser(): void {
    this.userContext = {};
  }

  /**
   * Add a breadcrumb
   */
  addBreadcrumb(breadcrumb: Omit<Breadcrumb, 'timestamp'>): void {
    this.breadcrumbs.push({
      ...breadcrumb,
      timestamp: new Date(),
    });

    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  /**
   * Clear all breadcrumbs
   */
  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
  }

  /**
   * Report an error
   */
  async captureError(
    error: Error | GLWMError,
    context?: Record<string, unknown>,
    tags?: Record<string, string>
  ): Promise<void> {
    if (!this.config.enabled) {
      // Still log locally when disabled
      logger.error('Error captured (reporting disabled)', { error, context });
      return;
    }

    // Sample rate check
    if (this.config.sampleRate !== undefined && Math.random() > this.config.sampleRate) {
      return;
    }

    const report: ErrorReport = {
      error,
      message: error.message,
      level: 'error',
      timestamp: new Date(),
      context,
      tags: {
        ...tags,
        environment: this.config.environment ?? 'unknown',
        release: this.config.release ?? 'unknown',
      },
      user: this.userContext,
      breadcrumbs: [...this.breadcrumbs],
    };

    // Apply beforeSend hook
    if (this.config.beforeSend) {
      const processedReport = this.config.beforeSend(report);
      if (!processedReport) {
        return; // Drop the error
      }
    }

    // Log to logger
    logger.error('Reporting error to external service', {
      message: report.message,
      tags: report.tags,
    });

    // Send to custom reporter
    if (this.config.customReporter) {
      try {
        await this.config.customReporter(report);
      } catch (reportError) {
        logger.error('Failed to send error report', { reportError });
      }
    }

    // Send to Sentry if DSN is configured
    if (this.config.dsn) {
      await this.sendToSentry(report);
    }
  }

  /**
   * Capture a warning
   */
  async captureWarning(
    message: string,
    context?: Record<string, unknown>,
    tags?: Record<string, string>
  ): Promise<void> {
    if (!this.config.enabled) {
      logger.warn(message, context);
      return;
    }

    const report: ErrorReport = {
      error: new Error(message),
      message,
      level: 'warning',
      timestamp: new Date(),
      context,
      tags,
      user: this.userContext,
      breadcrumbs: [...this.breadcrumbs],
    };

    if (this.config.customReporter) {
      try {
        await this.config.customReporter(report);
      } catch (reportError) {
        logger.error('Failed to send warning report', { reportError });
      }
    }
  }

  /**
   * Capture a message/info
   */
  async captureMessage(
    message: string,
    context?: Record<string, unknown>,
    tags?: Record<string, string>
  ): Promise<void> {
    if (!this.config.enabled) {
      logger.info(message, context);
      return;
    }

    const report: ErrorReport = {
      error: new Error(message),
      message,
      level: 'info',
      timestamp: new Date(),
      context,
      tags,
      user: this.userContext,
    };

    if (this.config.customReporter) {
      try {
        await this.config.customReporter(report);
      } catch (reportError) {
        logger.error('Failed to send message report', { reportError });
      }
    }
  }

  /**
   * Wrap a function to automatically capture errors
   */
  wrap<T extends (...args: unknown[]) => unknown>(
    fn: T,
    context?: Record<string, unknown>
  ): T {
    const reporter = this;
    return function (this: unknown, ...args: unknown[]) {
      try {
        const result = fn.apply(this, args);
        if (result instanceof Promise) {
          return result.catch((error: Error) => {
            reporter.captureError(error, context);
            throw error;
          });
        }
        return result;
      } catch (error) {
        reporter.captureError(error as Error, context);
        throw error;
      }
    } as T;
  }

  /**
   * Send error to Sentry
   * This is a simplified implementation - in production, use @sentry/browser
   */
  private async sendToSentry(report: ErrorReport): Promise<void> {
    if (!this.config.dsn) {
      return;
    }

    try {
      // Parse Sentry DSN
      const dsnMatch = this.config.dsn.match(
        /^https?:\/\/([^@]+)@([^/]+)\/(.+)$/
      );
      if (!dsnMatch) {
        logger.warn('Invalid Sentry DSN format');
        return;
      }

      const [, publicKey, host, projectId] = dsnMatch;
      const endpoint = `https://${host}/api/${projectId}/store/`;

      // Build Sentry event
      const event = {
        event_id: this.generateEventId(),
        timestamp: report.timestamp.toISOString(),
        level: report.level,
        platform: 'javascript',
        sdk: {
          name: 'glwm-sdk',
          version: '0.1.0',
        },
        exception: {
          values: [
            {
              type: report.error.name ?? 'Error',
              value: report.message,
              stacktrace: report.error instanceof Error ? this.parseStacktrace(report.error) : undefined,
            },
          ],
        },
        tags: report.tags,
        extra: report.context,
        user: report.user
          ? {
              id: report.user.walletAddress,
              data: report.user,
            }
          : undefined,
        breadcrumbs: report.breadcrumbs?.map((b) => ({
          type: b.type,
          category: b.category,
          message: b.message,
          timestamp: b.timestamp.getTime() / 1000,
          data: b.data,
        })),
        environment: this.config.environment,
        release: this.config.release,
      };

      // Send to Sentry
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}`,
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        logger.warn('Failed to send error to Sentry', { status: response.status });
      }
    } catch (error) {
      logger.error('Error sending to Sentry', { error });
    }
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Parse error stacktrace for Sentry format
   */
  private parseStacktrace(error: Error): { frames: Array<{ filename?: string; lineno?: number; function?: string }> } | undefined {
    if (!error.stack) {
      return undefined;
    }

    const frames = error.stack
      .split('\n')
      .slice(1)
      .map((line) => {
        const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):\d+\)/);
        if (match) {
          return {
            function: match[1],
            filename: match[2],
            lineno: parseInt(match[3] ?? '0', 10),
          };
        }
        return null;
      })
      .filter((frame): frame is NonNullable<typeof frame> => frame !== null)
      .reverse();

    return { frames };
  }
}

/**
 * Global error reporter instance
 */
export const errorReporter = ErrorReporter.getInstance();
