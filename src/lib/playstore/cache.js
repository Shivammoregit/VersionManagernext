/**
 * Play Store Scraper Module - Cache
 * 
 * Pluggable caching implementation with support for both in-memory
 * and external cache backends (Redis-compatible interface).
 * 
 * @module playstore/cache
 */

import { config } from './config.js';
import { logger } from './logger.js';

/**
 * Cache entry structure.
 * 
 * @typedef {Object} CacheEntry
 * @property {any} value - Cached value
 * @property {number} expiresAt - Timestamp when entry expires
 * @property {number} createdAt - Timestamp when entry was created
 */

/**
 * Cache statistics.
 * 
 * @typedef {Object} CacheStats
 * @property {number} size - Current number of entries
 * @property {number} hits - Number of cache hits
 * @property {number} misses - Number of cache misses
 * @property {number} evictions - Number of entries evicted due to size limits
 * @property {number} expirations - Number of entries expired
 */

/**
 * Cache backend interface.
 * Implement this interface to create custom cache backends.
 * 
 * @typedef {Object} CacheBackend
 * @property {Function} get - Get value by key
 * @property {Function} set - Set value with TTL
 * @property {Function} delete - Delete a key
 * @property {Function} clear - Clear all entries
 * @property {Function} getStats - Get cache statistics
 */

/**
 * In-memory cache implementation.
 * Thread-safe within a single Node.js process.
 */
class InMemoryCache {
    /**
     * @param {Object} options - Cache options
     * @param {number} [options.ttl] - Default TTL in milliseconds
     * @param {number} [options.maxSize] - Maximum number of entries
     */
    constructor(options = {}) {
        this.ttl = options.ttl || config.cacheTTL;
        this.maxSize = options.maxSize || config.maxCacheSize;

        /** @type {Map<string, CacheEntry>} */
        this.cache = new Map();

        /** @type {CacheStats} */
        this.stats = {
            size: 0,
            hits: 0,
            misses: 0,
            evictions: 0,
            expirations: 0,
        };

        // Schedule periodic cleanup
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000);

        // Prevent cleanup from keeping process alive
        if (this.cleanupInterval.unref) {
            this.cleanupInterval.unref();
        }

        logger.debug('InMemoryCache initialized', { ttl: this.ttl, maxSize: this.maxSize });
    }

    /**
     * Gets a value from the cache.
     * 
     * @param {string} key - Cache key
     * @returns {Promise<any|null>} Cached value or null if not found/expired
     */
    async get(key) {
        const entry = this.cache.get(key);

        if (!entry) {
            this.stats.misses++;
            return null;
        }

        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            this.stats.size--;
            this.stats.expirations++;
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        return entry.value;
    }

    /**
     * Sets a value in the cache.
     * 
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} [ttlMs] - Optional TTL override in milliseconds
     * @returns {Promise<boolean>} True if set successfully
     */
    async set(key, value, ttlMs = null) {
        // Enforce max size with LRU-like eviction
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictOldest();
        }

        const now = Date.now();
        const entry = {
            value,
            expiresAt: now + (ttlMs || this.ttl),
            createdAt: now,
        };

        const isNew = !this.cache.has(key);
        this.cache.set(key, entry);

        if (isNew) {
            this.stats.size++;
        }

        logger.debug('Cache set', { key, ttl: ttlMs || this.ttl });
        return true;
    }

    /**
     * Deletes a key from the cache.
     * 
     * @param {string} key - Cache key
     * @returns {Promise<boolean>} True if key existed and was deleted
     */
    async delete(key) {
        const existed = this.cache.has(key);
        if (existed) {
            this.cache.delete(key);
            this.stats.size--;
        }
        return existed;
    }

    /**
     * Clears all entries from the cache.
     * 
     * @returns {Promise<void>}
     */
    async clear() {
        const previousSize = this.cache.size;
        this.cache.clear();
        this.stats.size = 0;
        logger.info('Cache cleared', { entriesRemoved: previousSize });
    }

    /**
     * Gets cache statistics.
     * 
     * @returns {Promise<CacheStats>} Current cache statistics
     */
    async getStats() {
        return { ...this.stats };
    }

    /**
     * Evicts the oldest entry from the cache.
     * Used when cache reaches max size.
     * 
     * @private
     */
    evictOldest() {
        let oldestKey = null;
        let oldestTime = Infinity;

        for (const [key, entry] of this.cache.entries()) {
            if (entry.createdAt < oldestTime) {
                oldestTime = entry.createdAt;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.stats.size--;
            this.stats.evictions++;
            logger.debug('Cache eviction', { key: oldestKey });
        }
    }

    /**
     * Removes expired entries from the cache.
     * Called periodically and on-demand.
     * 
     * @private
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                this.stats.size--;
                this.stats.expirations++;
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.debug('Cache cleanup', { entriesRemoved: cleaned });
        }
    }

    /**
     * Stops the cleanup interval.
     * Call this when shutting down to prevent memory leaks.
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.cache.clear();
        logger.debug('InMemoryCache destroyed');
    }
}

/**
 * Redis-compatible cache adapter.
 * Wraps a Redis client with the CacheBackend interface.
 * 
 * @example
 * import Redis from 'ioredis';
 * const redis = new Redis();
 * const cache = new RedisCache(redis);
 */
export class RedisCache {
    /**
     * @param {Object} redisClient - Redis client instance (ioredis or similar)
     * @param {Object} [options] - Cache options
     * @param {number} [options.ttl] - Default TTL in milliseconds
     * @param {string} [options.prefix] - Key prefix for namespacing
     */
    constructor(redisClient, options = {}) {
        this.client = redisClient;
        this.ttl = options.ttl || config.cacheTTL;
        this.prefix = options.prefix || 'playstore:';

        this.stats = {
            size: 0, // Approximate, not tracked in Redis
            hits: 0,
            misses: 0,
            evictions: 0,
            expirations: 0,
        };

        logger.debug('RedisCache initialized', { prefix: this.prefix });
    }

    /**
     * Gets the full key with prefix.
     * @param {string} key - Original key
     * @returns {string} Prefixed key
     * @private
     */
    getKey(key) {
        return `${this.prefix}${key}`;
    }

    async get(key) {
        try {
            const data = await this.client.get(this.getKey(key));
            if (data === null) {
                this.stats.misses++;
                return null;
            }
            this.stats.hits++;
            return JSON.parse(data);
        } catch (error) {
            logger.warn('Redis get error', { error: error.message });
            this.stats.misses++;
            return null;
        }
    }

    async set(key, value, ttlMs = null) {
        try {
            const ttlSeconds = Math.ceil((ttlMs || this.ttl) / 1000);
            await this.client.setex(
                this.getKey(key),
                ttlSeconds,
                JSON.stringify(value)
            );
            return true;
        } catch (error) {
            logger.warn('Redis set error', { error: error.message });
            return false;
        }
    }

    async delete(key) {
        try {
            const result = await this.client.del(this.getKey(key));
            return result > 0;
        } catch (error) {
            logger.warn('Redis delete error', { error: error.message });
            return false;
        }
    }

    async clear() {
        try {
            const keys = await this.client.keys(`${this.prefix}*`);
            if (keys.length > 0) {
                await this.client.del(...keys);
            }
            logger.info('Redis cache cleared', { keysRemoved: keys.length });
        } catch (error) {
            logger.warn('Redis clear error', { error: error.message });
        }
    }

    async getStats() {
        return { ...this.stats };
    }

    destroy() {
        // Don't close the Redis connection as it may be shared
        logger.debug('RedisCache reference released');
    }
}

/**
 * Cache factory for creating cache instances.
 * 
 * @param {Object} [options] - Cache options
 * @param {Object} [options.redisClient] - Optional Redis client for Redis backend
 * @returns {InMemoryCache|RedisCache} Cache instance
 */
export function createCache(options = {}) {
    if (options.redisClient) {
        return new RedisCache(options.redisClient, options);
    }
    return new InMemoryCache(options);
}

// Default cache instance (singleton)
let defaultCache = null;

/**
 * Gets the default cache instance.
 * Creates one if it doesn't exist.
 * 
 * @returns {InMemoryCache|RedisCache} Default cache instance
 */
export function getDefaultCache() {
    if (!defaultCache) {
        defaultCache = createCache();
    }
    return defaultCache;
}

/**
 * Sets a custom cache backend as the default.
 * Use this to switch to Redis or other backends.
 * 
 * @param {CacheBackend} cache - Cache backend implementing the interface
 */
export function setDefaultCache(cache) {
    if (defaultCache && typeof defaultCache.destroy === 'function') {
        defaultCache.destroy();
    }
    defaultCache = cache;
    logger.info('Default cache backend changed');
}

export { InMemoryCache };
export default { createCache, getDefaultCache, setDefaultCache, InMemoryCache, RedisCache };
