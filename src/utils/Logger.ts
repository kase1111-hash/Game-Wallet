/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * Log entry structure
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: string;
  data?: unknown;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
  enableConsole?: boolean;
  enableTimestamp?: boolean;
  customHandler?: (entry: LogEntry) => void;
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  prefix: '[GLWM]',
  enableConsole: true,
  enableTimestamp: true,
};

/**
 * Logger class for SDK-wide logging
 */
export class Logger {
  private config: LoggerConfig;
  private static instance: Logger | null = null;
  private logHistory: LogEntry[] = [];
  private maxHistorySize = 1000;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get or create singleton instance
   */
  static getInstance(config?: Partial<LoggerConfig>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    } else if (config) {
      Logger.instance.configure(config);
    }
    return Logger.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static resetInstance(): void {
    Logger.instance = null;
  }

  /**
   * Update logger configuration
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  /**
   * Log a debug message
   */
  debug(message: string, data?: unknown, context?: string): void {
    this.log(LogLevel.DEBUG, message, data, context);
  }

  /**
   * Log an info message
   */
  info(message: string, data?: unknown, context?: string): void {
    this.log(LogLevel.INFO, message, data, context);
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: unknown, context?: string): void {
    this.log(LogLevel.WARN, message, data, context);
  }

  /**
   * Log an error message
   */
  error(message: string, data?: unknown, context?: string): void {
    this.log(LogLevel.ERROR, message, data, context);
  }

  /**
   * Create a child logger with a specific context
   */
  child(context: string): ContextLogger {
    return new ContextLogger(this, context);
  }

  /**
   * Get log history
   */
  getHistory(level?: LogLevel): LogEntry[] {
    if (level === undefined) {
      return [...this.logHistory];
    }
    return this.logHistory.filter((entry) => entry.level >= level);
  }

  /**
   * Clear log history
   */
  clearHistory(): void {
    this.logHistory = [];
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, data?: unknown, context?: string): void {
    if (level < this.config.level) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context,
      data,
    };

    // Store in history
    this.logHistory.push(entry);
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }

    // Call custom handler if provided
    if (this.config.customHandler) {
      this.config.customHandler(entry);
    }

    // Console output
    if (this.config.enableConsole) {
      this.writeToConsole(entry);
    }
  }

  /**
   * Write log entry to console
   */
  private writeToConsole(entry: LogEntry): void {
    const parts: string[] = [];

    if (this.config.prefix) {
      parts.push(this.config.prefix);
    }

    if (this.config.enableTimestamp) {
      parts.push(`[${entry.timestamp.toISOString()}]`);
    }

    parts.push(`[${LogLevel[entry.level]}]`);

    if (entry.context) {
      parts.push(`[${entry.context}]`);
    }

    parts.push(entry.message);

    const formattedMessage = parts.join(' ');

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage, entry.data ?? '');
        break;
      case LogLevel.INFO:
        console.info(formattedMessage, entry.data ?? '');
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage, entry.data ?? '');
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage, entry.data ?? '');
        break;
    }
  }
}

/**
 * Context-specific logger that inherits from parent
 */
export class ContextLogger {
  private parent: Logger;
  private context: string;

  constructor(parent: Logger, context: string) {
    this.parent = parent;
    this.context = context;
  }

  debug(message: string, data?: unknown): void {
    this.parent.debug(message, data, this.context);
  }

  info(message: string, data?: unknown): void {
    this.parent.info(message, data, this.context);
  }

  warn(message: string, data?: unknown): void {
    this.parent.warn(message, data, this.context);
  }

  error(message: string, data?: unknown): void {
    this.parent.error(message, data, this.context);
  }

  /**
   * Create a child context logger
   */
  child(subContext: string): ContextLogger {
    return new ContextLogger(this.parent, `${this.context}:${subContext}`);
  }
}

/**
 * Global logger instance for convenience
 */
export const logger = Logger.getInstance();
