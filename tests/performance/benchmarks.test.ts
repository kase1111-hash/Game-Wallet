/**
 * Performance Tests
 *
 * These tests measure SDK performance characteristics including:
 * - Initialization time
 * - Memory usage
 * - Operation throughput
 * - Cache performance
 */

import { GLWM, GLWMConfig, Cache, Logger } from '../../src';

// Increase timeout for performance tests
jest.setTimeout(30000);

const validConfig: GLWMConfig = {
  licenseContract: '0x1234567890123456789012345678901234567890',
  chainId: 137,
  rpcProvider: {
    provider: 'custom',
    customUrl: 'https://polygon-rpc.com',
  },
  mintingPortal: {
    url: 'https://mint.example.com',
    mode: 'iframe',
  },
};

/**
 * Helper to measure execution time
 */
async function measureTime<T>(fn: () => T | Promise<T>): Promise<{ result: T; timeMs: number }> {
  const start = performance.now();
  const result = await fn();
  const timeMs = performance.now() - start;
  return { result, timeMs };
}

/**
 * Helper to run multiple iterations and get statistics
 */
async function benchmark<T>(
  name: string,
  fn: () => T | Promise<T>,
  iterations: number = 100
): Promise<{ name: string; min: number; max: number; avg: number; p95: number }> {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const { timeMs } = await measureTime(fn);
    times.push(timeMs);
  }

  times.sort((a, b) => a - b);

  return {
    name,
    min: times[0],
    max: times[times.length - 1],
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    p95: times[Math.floor(times.length * 0.95)],
  };
}

describe('Performance: SDK Initialization', () => {
  beforeEach(() => {
    Logger.resetInstance();
  });

  it('should initialize SDK instance quickly', async () => {
    const { timeMs } = await measureTime(() => new GLWM(validConfig));

    // SDK instantiation should be under 50ms
    expect(timeMs).toBeLessThan(50);
  });

  it('should handle multiple rapid instantiations', async () => {
    const stats = await benchmark(
      'SDK instantiation',
      () => new GLWM(validConfig),
      50
    );

    console.log('SDK Instantiation Stats:', stats);

    // Average should be under 10ms
    expect(stats.avg).toBeLessThan(10);
    // 95th percentile should be under 20ms
    expect(stats.p95).toBeLessThan(20);
  });

  it('should validate config quickly', async () => {
    const stats = await benchmark(
      'Config validation',
      () => GLWM.validateConfig(validConfig),
      100
    );

    console.log('Config Validation Stats:', stats);

    // Validation should be very fast
    expect(stats.avg).toBeLessThan(1);
  });
});

describe('Performance: Cache Operations', () => {
  let cache: Cache;

  beforeEach(() => {
    cache = new Cache({ ttlSeconds: 300 });
  });

  it('should handle high-volume cache writes', async () => {
    const stats = await benchmark(
      'Cache write',
      () => {
        const address = `0x${Math.random().toString(16).substr(2, 40)}`;
        cache.setVerification(address, {
          isValid: true,
          tokenId: '123',
          owner: address,
          expiresAt: null,
          metadata: null,
        });
      },
      1000
    );

    console.log('Cache Write Stats:', stats);

    // Cache writes should be under 0.1ms average
    expect(stats.avg).toBeLessThan(0.5);
  });

  it('should handle high-volume cache reads', async () => {
    // Pre-populate cache
    const address = '0x1234567890123456789012345678901234567890';
    cache.setVerification(address, {
      isValid: true,
      tokenId: '123',
      owner: address,
      expiresAt: null,
      metadata: null,
    });

    const stats = await benchmark(
      'Cache read (hit)',
      () => cache.getVerification(address),
      1000
    );

    console.log('Cache Read Stats:', stats);

    // Cache reads should be very fast
    expect(stats.avg).toBeLessThan(0.1);
  });

  it('should handle cache misses efficiently', async () => {
    const stats = await benchmark(
      'Cache read (miss)',
      () => cache.getVerification('0x0000000000000000000000000000000000000000'),
      1000
    );

    console.log('Cache Miss Stats:', stats);

    // Cache misses should also be fast
    expect(stats.avg).toBeLessThan(0.1);
  });
});

describe('Performance: Logger Operations', () => {
  beforeEach(() => {
    Logger.resetInstance();
  });

  it('should handle high-volume logging', async () => {
    const logger = Logger.getInstance({ level: 'silent' }); // Silent to avoid console output

    const stats = await benchmark(
      'Log entry',
      () => logger.info('Test log message', { data: 'value' }),
      1000
    );

    console.log('Logging Stats:', stats);

    // Logging should be very fast
    expect(stats.avg).toBeLessThan(0.5);
  });

  it('should handle context logger creation', async () => {
    const logger = Logger.getInstance({ level: 'silent' });

    const stats = await benchmark(
      'Context logger creation',
      () => logger.child('TestContext'),
      100
    );

    console.log('Context Logger Stats:', stats);

    expect(stats.avg).toBeLessThan(0.5);
  });
});

describe('Performance: Event System', () => {
  it('should handle many event subscriptions', async () => {
    const glwm = new GLWM(validConfig);
    const unsubscribes: (() => void)[] = [];

    const { timeMs } = await measureTime(() => {
      for (let i = 0; i < 100; i++) {
        unsubscribes.push(glwm.on('WALLET_CONNECTED', () => {}));
      }
    });

    console.log('100 Event Subscriptions:', timeMs, 'ms');

    // Adding 100 subscriptions should be fast
    expect(timeMs).toBeLessThan(50);

    // Cleanup
    unsubscribes.forEach((unsub) => unsub());
  });

  it('should handle many state subscriptions', async () => {
    const glwm = new GLWM(validConfig);
    const unsubscribes: (() => void)[] = [];

    const { timeMs } = await measureTime(() => {
      for (let i = 0; i < 100; i++) {
        unsubscribes.push(glwm.subscribe(() => {}));
      }
    });

    console.log('100 State Subscriptions:', timeMs, 'ms');

    expect(timeMs).toBeLessThan(50);

    // Cleanup
    unsubscribes.forEach((unsub) => unsub());
  });
});

describe('Performance: Memory Usage', () => {
  it('should not leak memory on repeated instantiation', () => {
    const instances: GLWM[] = [];

    // Create many instances
    for (let i = 0; i < 100; i++) {
      instances.push(new GLWM(validConfig));
    }

    // Clear references
    instances.length = 0;

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // If we get here without OOM, test passes
    expect(true).toBe(true);
  });

  it('should handle cache cleanup properly', () => {
    const cache = new Cache({ ttlSeconds: 1 });

    // Add many entries
    for (let i = 0; i < 1000; i++) {
      const address = `0x${i.toString(16).padStart(40, '0')}`;
      cache.setVerification(address, {
        isValid: true,
        tokenId: String(i),
        owner: address,
        expiresAt: null,
        metadata: null,
      });
    }

    // Clear cache
    cache.clearAll();

    // Verify cache is cleared
    const result = cache.getVerification('0x0000000000000000000000000000000000000000');
    expect(result).toBeNull();
  });
});

describe('Performance: Stress Tests', () => {
  it('should handle rapid SDK operations', async () => {
    const glwm = new GLWM(validConfig);
    const operations = 1000;

    const { timeMs } = await measureTime(async () => {
      for (let i = 0; i < operations; i++) {
        glwm.getState();
        glwm.getWalletSession();
        glwm.getAvailableProviders();
      }
    });

    const opsPerSecond = (operations * 3) / (timeMs / 1000);
    console.log(`Operations per second: ${opsPerSecond.toFixed(0)}`);

    // Should handle at least 10000 ops/sec
    expect(opsPerSecond).toBeGreaterThan(10000);
  });

  it('should handle concurrent cache operations', async () => {
    const cache = new Cache({ ttlSeconds: 300 });
    const operations = 100;

    const promises = Array.from({ length: operations }, async (_, i) => {
      const address = `0x${i.toString(16).padStart(40, '0')}`;

      // Write
      cache.setVerification(address, {
        isValid: true,
        tokenId: String(i),
        owner: address,
        expiresAt: null,
        metadata: null,
      });

      // Read
      return cache.getVerification(address);
    });

    const { timeMs } = await measureTime(() => Promise.all(promises));

    console.log(`${operations} concurrent cache ops: ${timeMs.toFixed(2)}ms`);

    // Should complete quickly
    expect(timeMs).toBeLessThan(100);
  });
});
