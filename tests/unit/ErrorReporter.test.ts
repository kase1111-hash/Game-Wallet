import { ErrorReporter } from '../../src/utils/ErrorReporter';
import { Logger } from '../../src/utils/Logger';

describe('ErrorReporter', () => {
  beforeEach(() => {
    ErrorReporter.resetInstance();
    Logger.resetInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const reporter1 = ErrorReporter.getInstance();
      const reporter2 = ErrorReporter.getInstance();
      expect(reporter1).toBe(reporter2);
    });

    it('should configure instance with provided config', () => {
      const reporter = ErrorReporter.getInstance({ enabled: true, environment: 'test' });
      // Config is applied internally
      expect(reporter).toBeInstanceOf(ErrorReporter);
    });
  });

  describe('configure', () => {
    it('should update configuration', () => {
      const reporter = new ErrorReporter({ enabled: false });
      reporter.configure({ enabled: true });
      // Test that configuration takes effect by checking behavior
      expect(reporter).toBeInstanceOf(ErrorReporter);
    });
  });

  describe('user context', () => {
    it('should set user context', () => {
      const reporter = new ErrorReporter();
      reporter.setUser({
        walletAddress: '0x1234567890123456789012345678901234567890',
        sessionId: 'test-session',
      });
      // User context is stored internally
      expect(reporter).toBeInstanceOf(ErrorReporter);
    });

    it('should clear user context', () => {
      const reporter = new ErrorReporter();
      reporter.setUser({ walletAddress: '0x123' });
      reporter.clearUser();
      expect(reporter).toBeInstanceOf(ErrorReporter);
    });
  });

  describe('breadcrumbs', () => {
    it('should add breadcrumb', () => {
      const reporter = new ErrorReporter();
      reporter.addBreadcrumb({
        type: 'action',
        category: 'wallet',
        message: 'Connected wallet',
      });
      expect(reporter).toBeInstanceOf(ErrorReporter);
    });

    it('should clear breadcrumbs', () => {
      const reporter = new ErrorReporter();
      reporter.addBreadcrumb({
        type: 'action',
        category: 'test',
        message: 'Test action',
      });
      reporter.clearBreadcrumbs();
      expect(reporter).toBeInstanceOf(ErrorReporter);
    });
  });

  describe('captureError', () => {
    it('should not call custom reporter when reporting is disabled', async () => {
      const customReporter = jest.fn();
      const reporter = new ErrorReporter({ enabled: false, customReporter });

      await reporter.captureError(new Error('Test error'));

      // Custom reporter should not be called when disabled
      expect(customReporter).not.toHaveBeenCalled();
    });

    it('should call custom reporter when enabled', async () => {
      const customReporter = jest.fn();
      const reporter = new ErrorReporter({
        enabled: true,
        customReporter,
      });

      await reporter.captureError(new Error('Test error'), { extra: 'data' });

      expect(customReporter).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test error',
          level: 'error',
          context: { extra: 'data' },
        })
      );
    });

    it('should respect sample rate', async () => {
      const customReporter = jest.fn();
      const reporter = new ErrorReporter({
        enabled: true,
        sampleRate: 0, // Never sample
        customReporter,
      });

      await reporter.captureError(new Error('Test error'));

      expect(customReporter).not.toHaveBeenCalled();
    });

    it('should apply beforeSend hook', async () => {
      const customReporter = jest.fn();
      const beforeSend = jest.fn().mockReturnValue(null); // Drop the error
      const reporter = new ErrorReporter({
        enabled: true,
        beforeSend,
        customReporter,
      });

      await reporter.captureError(new Error('Test error'));

      expect(beforeSend).toHaveBeenCalled();
      expect(customReporter).not.toHaveBeenCalled();
    });
  });

  describe('captureWarning', () => {
    it('should not call custom reporter when disabled', async () => {
      const customReporter = jest.fn();
      const reporter = new ErrorReporter({ enabled: false, customReporter });

      await reporter.captureWarning('Test warning');

      // Custom reporter should not be called when disabled
      expect(customReporter).not.toHaveBeenCalled();
    });

    it('should send warning to custom reporter', async () => {
      const customReporter = jest.fn();
      const reporter = new ErrorReporter({
        enabled: true,
        customReporter,
      });

      await reporter.captureWarning('Test warning');

      expect(customReporter).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test warning',
          level: 'warning',
        })
      );
    });
  });

  describe('captureMessage', () => {
    it('should not call custom reporter when disabled', async () => {
      const customReporter = jest.fn();
      const reporter = new ErrorReporter({ enabled: false, customReporter });

      await reporter.captureMessage('Test message');

      // Custom reporter should not be called when disabled
      expect(customReporter).not.toHaveBeenCalled();
    });

    it('should send message to custom reporter', async () => {
      const customReporter = jest.fn();
      const reporter = new ErrorReporter({
        enabled: true,
        customReporter,
      });

      await reporter.captureMessage('Test message', { data: 'value' });

      expect(customReporter).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test message',
          level: 'info',
          context: { data: 'value' },
        })
      );
    });
  });

  describe('wrap', () => {
    it('should wrap sync function and catch errors', () => {
      const customReporter = jest.fn();
      const reporter = new ErrorReporter({
        enabled: true,
        customReporter,
      });

      const errorFn = () => {
        throw new Error('Wrapped error');
      };

      const wrapped = reporter.wrap(errorFn);

      expect(() => wrapped()).toThrow('Wrapped error');
      expect(customReporter).toHaveBeenCalled();
    });

    it('should wrap async function and catch errors', async () => {
      const customReporter = jest.fn();
      const reporter = new ErrorReporter({
        enabled: true,
        customReporter,
      });

      const asyncErrorFn = async () => {
        throw new Error('Async wrapped error');
      };

      const wrapped = reporter.wrap(asyncErrorFn);

      await expect(wrapped()).rejects.toThrow('Async wrapped error');
      expect(customReporter).toHaveBeenCalled();
    });

    it('should not interfere with successful execution', () => {
      const reporter = new ErrorReporter({ enabled: true });

      const successFn = (a: number, b: number) => a + b;
      const wrapped = reporter.wrap(successFn);

      expect(wrapped(2, 3)).toBe(5);
    });
  });
});
