/**
 * Tests for rateLimiter.js
 * 
 * @module playstore/__tests__/rateLimiter.test
 */

// Use direct instantiation instead of mocking to avoid ESM issues
import { SlidingWindowRateLimiter } from '../rateLimiter.js';
import { RateLimitError } from '../errors.js';

describe('SlidingWindowRateLimiter', () => {
    let limiter;

    beforeEach(() => {
        // Create limiter with explicit options to avoid config dependency
        limiter = new SlidingWindowRateLimiter({ limit: 5, windowMs: 1000 });
    });

    afterEach(() => {
        if (limiter) {
            limiter.destroy();
        }
    });

    describe('check', () => {
        test('allows requests under limit', async () => {
            const result = await limiter.check('user1');
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(4); // 5 - 1 = 4
        });

        test('tracks remaining correctly', async () => {
            await limiter.check('user1'); // remaining: 4
            await limiter.check('user1'); // remaining: 3
            const result = await limiter.check('user1'); // remaining: 2

            expect(result.remaining).toBe(2);
        });

        test('blocks when limit exceeded', async () => {
            // Consume all tokens
            for (let i = 0; i < 5; i++) {
                await limiter.check('user1');
            }

            // Next request should be blocked
            const result = await limiter.check('user1');
            expect(result.allowed).toBe(false);
            expect(result.remaining).toBe(0);
        });

        test('tracks different keys separately', async () => {
            // Exhaust limit for user1
            for (let i = 0; i < 5; i++) {
                await limiter.check('user1');
            }

            // user2 should still have full limit
            const result = await limiter.check('user2');
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(4);
        });

        test('resets after window expires', async () => {
            // Exhaust limit
            for (let i = 0; i < 5; i++) {
                await limiter.check('user1');
            }

            // Wait for window to expire
            await new Promise(resolve => setTimeout(resolve, 1100));

            // Should be allowed again
            const result = await limiter.check('user1');
            expect(result.allowed).toBe(true);
        });

        test('returns reset time', async () => {
            const result = await limiter.check('user1');
            expect(result.resetMs).toBeGreaterThan(0);
            expect(result.resetMs).toBeLessThanOrEqual(1000);
        });
    });

    describe('consume', () => {
        test('does not throw when under limit', async () => {
            await expect(limiter.consume('user1')).resolves.not.toThrow();
        });

        test('throws RateLimitError when limit exceeded', async () => {
            // Exhaust limit
            for (let i = 0; i < 5; i++) {
                await limiter.consume('user1');
            }

            // Next should throw
            await expect(limiter.consume('user1')).rejects.toThrow(RateLimitError);
        });

        test('RateLimitError has retry info', async () => {
            // Exhaust limit
            for (let i = 0; i < 5; i++) {
                await limiter.consume('user1');
            }

            try {
                await limiter.consume('user1');
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(RateLimitError);
                expect(error.retryAfterMs).toBeGreaterThan(0);
                expect(error.statusCode).toBe(429);
            }
        });
    });

    describe('status', () => {
        test('returns status without consuming', async () => {
            // Get status
            const status1 = await limiter.status('user1');
            expect(status1.remaining).toBe(5);

            // Status should still be full (not consumed)
            const status2 = await limiter.status('user1');
            expect(status2.remaining).toBe(5);
        });

        test('reflects consumed tokens', async () => {
            await limiter.check('user1'); // Consume 1
            await limiter.check('user1'); // Consume 2

            const status = await limiter.status('user1');
            expect(status.remaining).toBe(3);
        });
    });

    describe('reset', () => {
        test('resets limit for specific key', async () => {
            // Exhaust limit
            for (let i = 0; i < 5; i++) {
                await limiter.check('user1');
            }

            // Reset
            await limiter.reset('user1');

            // Should be allowed again
            const result = await limiter.check('user1');
            expect(result.allowed).toBe(true);
        });
    });

    describe('statistics', () => {
        test('tracks total and rejected requests', async () => {
            // Make some requests
            for (let i = 0; i < 7; i++) {
                try {
                    await limiter.consume('user1');
                } catch (e) {
                    // Ignore rate limit errors
                }
            }

            const stats = await limiter.getStats();
            expect(stats.totalRequests).toBe(7);
            expect(stats.rejectedRequests).toBe(2); // 5 allowed, 2 rejected
        });
    });

    describe('concurrent requests', () => {
        test('handles concurrent requests correctly', async () => {
            // Make concurrent requests
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(limiter.check('user1'));
            }

            const results = await Promise.all(promises);

            // Exactly 5 should be allowed
            const allowed = results.filter(r => r.allowed).length;
            expect(allowed).toBe(5);
        });
    });
});
