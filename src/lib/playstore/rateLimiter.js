/**
 * Play Store Scraper Module - Rate Limiter
 * 
 * Implements sliding window counter algorithm for rate limiting.
 * Provides both global and per-key (per-IP) rate limiting.
 * 
 * @module playstore/rateLimiter
 */

import { config } from './config.js';
import { RateLimitError } from './errors.js';
import { logger } from './logger.js';

/**
 * Rate limit window data.
 * 
 * @typedef {Object} WindowData
 * @property {number} count - Request count in current window
 * @property {number} windowStart - Timestamp when window started
 * @property {number} previousCount - Request count in previous window
 */

/**
 * Rate limiter statistics.
 * 
 * @typedef {Object} RateLimiterStats
 * @property {number} totalRequests - Total requests processed
 * @property {number} rejectedRequests - Requests rejected due to rate limit
 * @property {number} currentKeys - Number of active rate limit keys
 */

/**
 * Sliding Window Counter Rate Limiter.
 * 
 * Uses the sliding window counter algorithm for smooth rate limiting:
 * - Combines accuracy of sliding window log with efficiency of fixed window
 * - Calculates weighted request count based on window overlap
 * - Handles burst traffic while maintaining overall rate limits
 */
class SlidingWindowRateLimiter {
    /**
     * @param {Object} [options] - Rate limiter options
     * @param {number} [options.limit] - Maximum requests per window
     * @param {number} [options.windowMs] - Window size in milliseconds
     */
    constructor(options = {}) {
        this.limit = options.limit || config.rateLimit;
        this.windowMs = options.windowMs || config.rateLimitWindowMs;

        /** @type {Map<string, WindowData>} */
        this.windows = new Map();

        /** @type {RateLimiterStats} */
        this.stats = {
            totalRequests: 0,
            rejectedRequests: 0,
            currentKeys: 0,
        };

        // Cleanup interval for expired windows
        this.cleanupInterval = setInterval(() => this.cleanup(), this.windowMs);
        if (this.cleanupInterval.unref) {
            this.cleanupInterval.unref();
        }

        logger.debug('SlidingWindowRateLimiter initialized', {
            limit: this.limit,
            windowMs: this.windowMs,
        });
    }

    /**
     * Calculates the weighted request count using sliding window.
     * 
     * @param {WindowData} data - Window data
     * @param {number} now - Current timestamp
     * @returns {number} Weighted request count
     * @private
     */
    calculateWeightedCount(data, now) {
        const windowProgress = (now - data.windowStart) / this.windowMs;
        const previousWeight = 1 - windowProgress;

        // Weighted count = current window + (previous window * overlap percentage)
        return data.count + (data.previousCount * previousWeight);
    }

    /**
     * Checks if a request should be allowed.
     * 
     * @param {string} [key='global'] - Rate limit key (e.g., IP address)
     * @returns {Promise<{ allowed: boolean, remaining: number, resetMs: number }>}
     */
    async check(key = 'global') {
        const now = Date.now();
        this.stats.totalRequests++;

        let data = this.windows.get(key);

        // Initialize new window
        if (!data) {
            data = {
                count: 0,
                windowStart: now,
                previousCount: 0,
            };
            this.windows.set(key, data);
            this.stats.currentKeys++;
        }

        // Check if we need to roll to a new window
        const windowAge = now - data.windowStart;
        if (windowAge >= this.windowMs) {
            // How many windows have passed?
            const windowsPassed = Math.floor(windowAge / this.windowMs);

            if (windowsPassed === 1) {
                // Roll forward one window
                data.previousCount = data.count;
                data.count = 0;
                data.windowStart = data.windowStart + this.windowMs;
            } else {
                // More than one window passed, reset completely
                data.previousCount = 0;
                data.count = 0;
                data.windowStart = now;
            }
        }

        // Calculate weighted count
        const weightedCount = this.calculateWeightedCount(data, now);

        // Calculate remaining requests
        const remaining = Math.max(0, Math.floor(this.limit - weightedCount));

        // Calculate reset time
        const resetMs = this.windowMs - (now - data.windowStart);

        // Check if over limit
        if (weightedCount >= this.limit) {
            this.stats.rejectedRequests++;
            logger.debug('Rate limit exceeded', { key, weightedCount, limit: this.limit });
            return {
                allowed: false,
                remaining: 0,
                resetMs,
            };
        }

        // Increment counter for this window
        data.count++;

        return {
            allowed: true,
            remaining: remaining - 1, // Account for this request
            resetMs,
        };
    }

    /**
     * Consumes a rate limit token for the given key.
     * Throws RateLimitError if limit is exceeded.
     * 
     * @param {string} [key='global'] - Rate limit key
     * @throws {RateLimitError} If rate limit is exceeded
     */
    async consume(key = 'global') {
        const result = await this.check(key);

        if (!result.allowed) {
            throw new RateLimitError(result.resetMs);
        }

        return result;
    }

    /**
     * Gets the current rate limit status without consuming a token.
     * 
     * @param {string} [key='global'] - Rate limit key
     * @returns {Promise<{ remaining: number, resetMs: number }>}
     */
    async status(key = 'global') {
        const now = Date.now();
        const data = this.windows.get(key);

        if (!data) {
            return {
                remaining: this.limit,
                resetMs: this.windowMs,
            };
        }

        const weightedCount = this.calculateWeightedCount(data, now);
        const remaining = Math.max(0, Math.floor(this.limit - weightedCount));
        const resetMs = this.windowMs - (now - data.windowStart);

        return { remaining, resetMs };
    }

    /**
     * Resets rate limit for a specific key.
     * 
     * @param {string} key - Rate limit key to reset
     */
    async reset(key) {
        if (this.windows.has(key)) {
            this.windows.delete(key);
            this.stats.currentKeys--;
            logger.debug('Rate limit reset', { key });
        }
    }

    /**
     * Gets rate limiter statistics.
     * 
     * @returns {Promise<RateLimiterStats>}
     */
    async getStats() {
        return { ...this.stats };
    }

    /**
     * Cleans up expired windows.
     * 
     * @private
     */
    cleanup() {
        const now = Date.now();
        const expireThreshold = now - (this.windowMs * 2); // Keep 2 windows for sliding
        let cleaned = 0;

        for (const [key, data] of this.windows.entries()) {
            if (data.windowStart < expireThreshold) {
                this.windows.delete(key);
                this.stats.currentKeys--;
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.debug('Rate limiter cleanup', { windowsRemoved: cleaned });
        }
    }

    /**
     * Destroys the rate limiter and cleans up resources.
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.windows.clear();
        this.stats.currentKeys = 0;
        logger.debug('SlidingWindowRateLimiter destroyed');
    }
}

// Default rate limiter instance (singleton)
let defaultRateLimiter = null;

/**
 * Gets the default rate limiter instance.
 * 
 * @returns {SlidingWindowRateLimiter}
 */
export function getDefaultRateLimiter() {
    if (!defaultRateLimiter) {
        defaultRateLimiter = new SlidingWindowRateLimiter();
    }
    return defaultRateLimiter;
}

/**
 * Sets a custom rate limiter as the default.
 * 
 * @param {SlidingWindowRateLimiter} rateLimiter - Rate limiter instance
 */
export function setDefaultRateLimiter(rateLimiter) {
    if (defaultRateLimiter && typeof defaultRateLimiter.destroy === 'function') {
        defaultRateLimiter.destroy();
    }
    defaultRateLimiter = rateLimiter;
    logger.info('Default rate limiter changed');
}

/**
 * Convenience function to consume a rate limit token with the default limiter.
 * 
 * @param {string} [key='global'] - Rate limit key
 * @throws {RateLimitError} If rate limit is exceeded
 */
export async function consumeRateLimit(key = 'global') {
    return getDefaultRateLimiter().consume(key);
}

/**
 * Convenience function to check rate limit status without consuming.
 * 
 * @param {string} [key='global'] - Rate limit key
 * @returns {Promise<{ remaining: number, resetMs: number }>}
 */
export async function checkRateLimit(key = 'global') {
    const limiter = getDefaultRateLimiter();
    return limiter.status(key);
}

export { SlidingWindowRateLimiter };
export default {
    SlidingWindowRateLimiter,
    getDefaultRateLimiter,
    setDefaultRateLimiter,
    consumeRateLimit,
    checkRateLimit,
};
