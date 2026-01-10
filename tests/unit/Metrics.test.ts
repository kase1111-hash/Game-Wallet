import { Metrics, MetricNames } from '../../src/utils/Metrics';

describe('Metrics', () => {
  beforeEach(() => {
    Metrics.resetInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const metrics1 = Metrics.getInstance();
      const metrics2 = Metrics.getInstance();
      expect(metrics1).toBe(metrics2);
    });

    it('should configure instance with provided config', () => {
      const metrics = Metrics.getInstance({ enabled: true });
      expect(metrics.isEnabled()).toBe(true);
    });
  });

  describe('configure', () => {
    it('should update configuration', () => {
      const metrics = new Metrics({ enabled: false });
      expect(metrics.isEnabled()).toBe(false);

      metrics.configure({ enabled: true });
      expect(metrics.isEnabled()).toBe(true);
    });
  });

  describe('increment', () => {
    it('should increment counter when enabled', async () => {
      const reporter = jest.fn();
      const metrics = new Metrics({
        enabled: true,
        reporter,
        flushIntervalMs: 0,
      });

      metrics.increment('test.counter');
      metrics.increment('test.counter', 5);

      await metrics.flush();

      expect(reporter).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'test.counter',
            type: 'counter',
            value: 1,
          }),
          expect.objectContaining({
            name: 'test.counter',
            type: 'counter',
            value: 5,
          }),
        ])
      );
    });

    it('should not record when disabled', async () => {
      const reporter = jest.fn();
      const metrics = new Metrics({
        enabled: false,
        reporter,
      });

      metrics.increment('test.counter');
      await metrics.flush();

      expect(reporter).not.toHaveBeenCalled();
    });
  });

  describe('gauge', () => {
    it('should record gauge value', async () => {
      const reporter = jest.fn();
      const metrics = new Metrics({
        enabled: true,
        reporter,
        flushIntervalMs: 0,
      });

      metrics.gauge('test.gauge', 42);
      await metrics.flush();

      expect(reporter).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'test.gauge',
            type: 'gauge',
            value: 42,
          }),
        ])
      );
    });
  });

  describe('histogram', () => {
    it('should record histogram value', async () => {
      const reporter = jest.fn();
      const metrics = new Metrics({
        enabled: true,
        reporter,
        flushIntervalMs: 0,
      });

      metrics.histogram('test.histogram', 100);
      await metrics.flush();

      expect(reporter).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'test.histogram',
            type: 'histogram',
            value: 100,
          }),
        ])
      );
    });
  });

  describe('timing', () => {
    it('should record timing value', async () => {
      const reporter = jest.fn();
      const metrics = new Metrics({
        enabled: true,
        reporter,
        flushIntervalMs: 0,
      });

      metrics.timing('test.timing', 250);
      await metrics.flush();

      expect(reporter).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'test.timing',
            type: 'timing',
            value: 250,
          }),
        ])
      );
    });
  });

  describe('startTimer/stopTimer', () => {
    it('should measure elapsed time', async () => {
      const reporter = jest.fn();
      const metrics = new Metrics({
        enabled: true,
        reporter,
        flushIntervalMs: 0,
      });

      const timerId = metrics.startTimer('test.operation');

      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 50));

      const duration = metrics.stopTimer(timerId);
      await metrics.flush();

      expect(duration).toBeGreaterThanOrEqual(40);
      expect(reporter).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'test.operation',
            type: 'timing',
          }),
        ])
      );
    });

    it('should return 0 for unknown timer', () => {
      const metrics = new Metrics({ enabled: true });
      const duration = metrics.stopTimer('unknown-timer');
      expect(duration).toBe(0);
    });
  });

  describe('measure', () => {
    it('should measure async function execution', async () => {
      const reporter = jest.fn();
      const metrics = new Metrics({
        enabled: true,
        reporter,
        flushIntervalMs: 0,
      });

      const result = await metrics.measure('async.operation', async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return 'success';
      });

      expect(result).toBe('success');
      await metrics.flush();

      expect(reporter).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'async.operation',
            type: 'timing',
            tags: expect.objectContaining({ status: 'success' }),
          }),
        ])
      );
    });

    it('should record error status on failure', async () => {
      const reporter = jest.fn();
      const metrics = new Metrics({
        enabled: true,
        reporter,
        flushIntervalMs: 0,
      });

      await expect(
        metrics.measure('failing.operation', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      await metrics.flush();

      expect(reporter).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'failing.operation',
            type: 'timing',
            tags: expect.objectContaining({ status: 'error' }),
          }),
        ])
      );
    });
  });

  describe('tags', () => {
    it('should include custom tags', async () => {
      const reporter = jest.fn();
      const metrics = new Metrics({
        enabled: true,
        reporter,
        flushIntervalMs: 0,
      });

      metrics.increment('tagged.counter', 1, { service: 'test', region: 'us-east' });
      await metrics.flush();

      expect(reporter).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            tags: expect.objectContaining({
              service: 'test',
              region: 'us-east',
            }),
          }),
        ])
      );
    });

    it('should include version tag when configured', async () => {
      const reporter = jest.fn();
      const metrics = new Metrics({
        enabled: true,
        reporter,
        includeVersion: true,
        flushIntervalMs: 0,
      });

      metrics.increment('test.counter');
      await metrics.flush();

      expect(reporter).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            tags: expect.objectContaining({
              sdk_version: expect.any(String),
            }),
          }),
        ])
      );
    });

    it('should include environment tag when configured', async () => {
      const reporter = jest.fn();
      const metrics = new Metrics({
        enabled: true,
        reporter,
        environment: 'testing',
        flushIntervalMs: 0,
      });

      metrics.increment('test.counter');
      await metrics.flush();

      expect(reporter).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            tags: expect.objectContaining({
              environment: 'testing',
            }),
          }),
        ])
      );
    });
  });

  describe('buffer management', () => {
    it('should auto-flush when buffer is full', async () => {
      const reporter = jest.fn();
      const metrics = new Metrics({
        enabled: true,
        reporter,
        maxBufferSize: 5,
        flushIntervalMs: 0,
      });

      // Add 6 metrics (exceeds buffer size of 5)
      for (let i = 0; i < 6; i++) {
        metrics.increment('test.counter');
      }

      // Wait for auto-flush
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(reporter).toHaveBeenCalled();
    });

    it('should track buffer size', () => {
      const metrics = new Metrics({
        enabled: true,
        flushIntervalMs: 0,
      });

      expect(metrics.getBufferSize()).toBe(0);

      metrics.increment('test.counter');
      expect(metrics.getBufferSize()).toBe(1);

      metrics.increment('test.counter');
      expect(metrics.getBufferSize()).toBe(2);
    });
  });

  describe('flush', () => {
    it('should clear buffer after flush', async () => {
      const reporter = jest.fn();
      const metrics = new Metrics({
        enabled: true,
        reporter,
        flushIntervalMs: 0,
      });

      metrics.increment('test.counter');
      expect(metrics.getBufferSize()).toBe(1);

      await metrics.flush();
      expect(metrics.getBufferSize()).toBe(0);
    });

    it('should not call reporter if buffer is empty', async () => {
      const reporter = jest.fn();
      const metrics = new Metrics({
        enabled: true,
        reporter,
        flushIntervalMs: 0,
      });

      await metrics.flush();
      expect(reporter).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should flush remaining metrics on stop', async () => {
      const reporter = jest.fn();
      const metrics = new Metrics({
        enabled: true,
        reporter,
        flushIntervalMs: 0,
      });

      metrics.increment('test.counter');
      await metrics.stop();

      expect(reporter).toHaveBeenCalled();
      expect(metrics.getBufferSize()).toBe(0);
    });
  });

  describe('MetricNames', () => {
    it('should have predefined metric names', () => {
      expect(MetricNames.SDK_INITIALIZED).toBe('glwm.sdk.initialized');
      expect(MetricNames.WALLET_CONNECTION_SUCCESS).toBe('glwm.wallet.connection_success');
      expect(MetricNames.LICENSE_VERIFICATION_ATTEMPTS).toBe('glwm.license.verification_attempts');
      expect(MetricNames.MINTING_SUCCESS).toBe('glwm.minting.success');
      expect(MetricNames.RPC_REQUESTS).toBe('glwm.rpc.requests');
      expect(MetricNames.ERRORS_TOTAL).toBe('glwm.errors.total');
    });
  });
});
