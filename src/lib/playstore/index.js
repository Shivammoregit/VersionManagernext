/**
 * Play Store Scraper Module - Main Entry Point
 * 
 * Exports all public APIs for the Play Store Scraper module.
 * This is the main file to import when using the module.
 * 
 * @module playstore
 * 
 * @example
 * // Import the scraper
 * import { PlayStoreScraper, getVersion } from '@/lib/playstore';
 * 
 * // Use the convenience function
 * const info = await getVersion('com.google.android.apps.maps');
 * 
 * // Or create a custom instance
 * const scraper = new PlayStoreScraper({ timeout: 10000 });
 * const info = await scraper.getVersion('com.google.android.apps.maps');
 */

// Import everything we need to re-export
import {
    PlayStoreScraper,
    getDefaultScraper,
    setDefaultScraper,
    getVersion,
    refreshVersion,
} from './scraper.js';

import {
    PlayStoreError,
    NotFoundError,
    RateLimitError,
    NetworkError,
    ValidationError,
    TimeoutError,
    ServiceUnavailableError,
    AuthenticationError,
    wrapError,
} from './errors.js';

import {
    validatePackageId,
    assertValidPackageId,
    sanitizeForLogging,
    validateHeaders,
    timingSafeEqual,
} from './validation.js';

import {
    createCache,
    getDefaultCache,
    setDefaultCache,
    InMemoryCache,
    RedisCache,
} from './cache.js';

import {
    SlidingWindowRateLimiter,
    getDefaultRateLimiter,
    setDefaultRateLimiter,
    consumeRateLimit,
    checkRateLimit,
} from './rateLimiter.js';

import {
    logger,
    registerMonitoringHooks,
    emitMonitoringEvent,
} from './logger.js';

import {
    config,
    getConfig,
    logEnvironmentWarnings,
} from './config.js';

/**
 * Module version.
 * Follows semver.
 */
export const VERSION = '1.0.0';

// Re-export everything
export {
    // Scraper
    PlayStoreScraper,
    getDefaultScraper,
    setDefaultScraper,
    getVersion,
    refreshVersion,

    // Errors
    PlayStoreError,
    NotFoundError,
    RateLimitError,
    NetworkError,
    ValidationError,
    TimeoutError,
    ServiceUnavailableError,
    AuthenticationError,
    wrapError,

    // Validation
    validatePackageId,
    assertValidPackageId,
    sanitizeForLogging,
    validateHeaders,
    timingSafeEqual,

    // Cache
    createCache,
    getDefaultCache,
    setDefaultCache,
    InMemoryCache,
    RedisCache,

    // Rate limiting
    SlidingWindowRateLimiter,
    getDefaultRateLimiter,
    setDefaultRateLimiter,
    consumeRateLimit,
    checkRateLimit,

    // Logger
    logger,
    registerMonitoringHooks,
    emitMonitoringEvent,

    // Config
    config,
    getConfig,
    logEnvironmentWarnings,
};

/**
 * Default export for convenience.
 * Includes the most commonly used exports.
 */
export default {
    // Scraper
    PlayStoreScraper,
    getDefaultScraper,
    getVersion,
    refreshVersion,

    // Errors
    PlayStoreError,
    NotFoundError,
    RateLimitError,
    ValidationError,

    // Validation
    validatePackageId,

    // Config
    config,

    // Version
    VERSION,
};
