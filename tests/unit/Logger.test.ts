import { Logger, LogLevel, ContextLogger } from '../../src/utils/Logger';

describe('Logger', () => {
  beforeEach(() => {
    Logger.resetInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const logger1 = Logger.getInstance();
      const logger2 = Logger.getInstance();
      expect(logger1).toBe(logger2);
    });

    it('should configure instance with provided config', () => {
      const logger = Logger.getInstance({ level: LogLevel.ERROR });
      expect(logger.getConfig().level).toBe(LogLevel.ERROR);
    });
  });

  describe('configure', () => {
    it('should update configuration', () => {
      const logger = new Logger({ level: LogLevel.INFO });
      logger.configure({ level: LogLevel.DEBUG });
      expect(logger.getConfig().level).toBe(LogLevel.DEBUG);
    });

    it('should merge with existing configuration', () => {
      const logger = new Logger({ level: LogLevel.INFO, prefix: '[TEST]' });
      logger.configure({ level: LogLevel.DEBUG });
      expect(logger.getConfig().prefix).toBe('[TEST]');
    });
  });

  describe('logging methods', () => {
    let logger: Logger;
    let consoleSpy: { [key: string]: jest.SpyInstance };

    beforeEach(() => {
      logger = new Logger({ level: LogLevel.DEBUG, enableConsole: true });
      consoleSpy = {
        debug: jest.spyOn(console, 'debug').mockImplementation(),
        info: jest.spyOn(console, 'info').mockImplementation(),
        warn: jest.spyOn(console, 'warn').mockImplementation(),
        error: jest.spyOn(console, 'error').mockImplementation(),
      };
    });

    afterEach(() => {
      Object.values(consoleSpy).forEach(spy => spy.mockRestore());
    });

    it('should log debug messages', () => {
      logger.debug('test message');
      expect(consoleSpy['debug']).toHaveBeenCalled();
    });

    it('should log info messages', () => {
      logger.info('test message');
      expect(consoleSpy['info']).toHaveBeenCalled();
    });

    it('should log warn messages', () => {
      logger.warn('test message');
      expect(consoleSpy['warn']).toHaveBeenCalled();
    });

    it('should log error messages', () => {
      logger.error('test message');
      expect(consoleSpy['error']).toHaveBeenCalled();
    });

    it('should respect log level', () => {
      const warnLogger = new Logger({ level: LogLevel.WARN, enableConsole: true });
      warnLogger.debug('debug');
      warnLogger.info('info');
      warnLogger.warn('warn');

      expect(consoleSpy['debug']).not.toHaveBeenCalled();
      expect(consoleSpy['info']).not.toHaveBeenCalled();
      expect(consoleSpy['warn']).toHaveBeenCalled();
    });

    it('should not log when level is NONE', () => {
      const silentLogger = new Logger({ level: LogLevel.NONE, enableConsole: true });
      silentLogger.error('error');
      expect(consoleSpy['error']).not.toHaveBeenCalled();
    });
  });

  describe('log history', () => {
    it('should store log entries in history', () => {
      const logger = new Logger({ level: LogLevel.DEBUG, enableConsole: false });
      logger.info('test message');

      const history = logger.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]?.message).toBe('test message');
    });

    it('should filter history by level', () => {
      const logger = new Logger({ level: LogLevel.DEBUG, enableConsole: false });
      logger.debug('debug');
      logger.info('info');
      logger.error('error');

      const errors = logger.getHistory(LogLevel.ERROR);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toBe('error');
    });

    it('should clear history', () => {
      const logger = new Logger({ level: LogLevel.DEBUG, enableConsole: false });
      logger.info('test');
      logger.clearHistory();
      expect(logger.getHistory()).toHaveLength(0);
    });
  });

  describe('custom handler', () => {
    it('should call custom handler for each log', () => {
      const customHandler = jest.fn();
      const logger = new Logger({
        level: LogLevel.DEBUG,
        enableConsole: false,
        customHandler
      });

      logger.info('test message', { data: 'value' });

      expect(customHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.INFO,
          message: 'test message',
          data: { data: 'value' },
        })
      );
    });
  });

  describe('child logger', () => {
    it('should create context logger', () => {
      const logger = new Logger({ level: LogLevel.DEBUG, enableConsole: false });
      const child = logger.child('TestContext');

      expect(child).toBeInstanceOf(ContextLogger);
    });

    it('should include context in logs', () => {
      const logger = new Logger({ level: LogLevel.DEBUG, enableConsole: false });
      const child = logger.child('TestContext');

      child.info('test message');

      const history = logger.getHistory();
      expect(history[0]?.context).toBe('TestContext');
    });
  });
});

describe('ContextLogger', () => {
  it('should log with context', () => {
    const parent = new Logger({ level: LogLevel.DEBUG, enableConsole: false });
    const child = new ContextLogger(parent, 'MyContext');

    child.info('test');

    const history = parent.getHistory();
    expect(history[0]?.context).toBe('MyContext');
  });

  it('should create nested child contexts', () => {
    const parent = new Logger({ level: LogLevel.DEBUG, enableConsole: false });
    const child = new ContextLogger(parent, 'Parent');
    const grandchild = child.child('Child');

    grandchild.info('test');

    const history = parent.getHistory();
    expect(history[0]?.context).toBe('Parent:Child');
  });
});
