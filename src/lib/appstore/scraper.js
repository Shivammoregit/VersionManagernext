/**
 * App Store Scraper Module - Core Scraper Service
 * 
 * Fetches iOS app version information from Apple's iTunes API.
 * Uses the official Apple iTunes Search/Lookup API which is 100% reliable.
 * 
 * @module appstore/scraper
 */

import { config } from '../playstore/config.js';
import { getDefaultCache } from '../playstore/cache.js';
import { getDefaultRateLimiter } from '../playstore/rateLimiter.js';
import { logger, emitMonitoringEvent } from '../playstore/logger.js';
import {
    PlayStoreError,
    NotFoundError,
    NetworkError,
    TimeoutError,
    ValidationError,
    wrapError,
} from '../playstore/errors.js';

/**
 * iTunes API base URL
 */
const ITUNES_API_URL = 'https://itunes.apple.com';

/**
 * App Store version information
 * @typedef {Object} AppStoreVersionInfo
 * @property {string} bundleId - iOS bundle identifier
 * @property {string} version - Current version string
 * @property {string} appId - iTunes app ID
 * @property {string} title - App name
 * @property {string} developer - Developer/seller name
 * @property {string|null} whatsNew - "What's New" / release notes for current version
 * @property {string|null} releaseDate - Release date (ISO string)
 * @property {string|null} currentVersionReleaseDate - Current version release date
 * @property {string} fetchedAt - When this data was fetched
 * @property {boolean} fromCache - Whether data came from cache
 */

/**
 * Validates a bundle ID format
 * @param {string} bundleId - iOS bundle ID
 * @returns {{ valid: boolean, sanitized: string, error?: string }}
 */
export function validateBundleId(bundleId) {
    if (!bundleId || typeof bundleId !== 'string') {
        return { valid: false, sanitized: '', error: 'Bundle ID is required' };
    }

    const trimmed = bundleId.trim().toLowerCase();

    if (trimmed.length < 3 || trimmed.length > 150) {
        return { valid: false, sanitized: '', error: 'Bundle ID length invalid' };
    }

    // Bundle ID format: reverse domain notation
    const pattern = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/;
    if (!pattern.test(trimmed)) {
        return { valid: false, sanitized: '', error: 'Invalid bundle ID format' };
    }

    return { valid: true, sanitized: trimmed };
}

/**
 * Validates an iTunes app ID
 * @param {string|number} appId - iTunes numeric app ID
 * @returns {{ valid: boolean, sanitized: string, error?: string }}
 */
export function validateAppId(appId) {
    const id = String(appId).trim();

    if (!id || !/^\d+$/.test(id)) {
        return { valid: false, sanitized: '', error: 'App ID must be a numeric iTunes ID' };
    }

    return { valid: true, sanitized: id };
}

/**
 * App Store Scraper class
 */
export class AppStoreScraper {
    /**
     * Creates a new AppStoreScraper instance
     * @param {Object} options - Scraper options
     */
    constructor(options = {}) {
        this.cache = options.cache || getDefaultCache();
        this.rateLimiter = options.rateLimiter || getDefaultRateLimiter();
        this.timeout = options.timeout || config.requestTimeout;
        this.country = options.country || 'in';
        this.startedAt = Date.now();
        this.requestCount = 0;
        this.errorCount = 0;

        logger.info('AppStoreScraper initialized', {
            timeout: this.timeout,
            country: this.country,
        });
    }

    /**
     * Generates cache key
     * @private
     */
    getCacheKey(identifier, type = 'bundleId') {
        return `appstore:${type}:${identifier}:${this.country}`;
    }

    /**
     * Fetches app info from iTunes API
     * @private
     */
    async fetchFromiTunes(params) {
        const url = new URL('/lookup', ITUNES_API_URL);
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });
        url.searchParams.set('country', this.country);

        logger.debug('Fetching from iTunes API', { url: url.toString() });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            await this.rateLimiter.consume('appstore');

            const response = await fetch(url.toString(), {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'VersionManager/1.0',
                },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new NetworkError(`iTunes API returned ${response.status}`);
            }

            const data = await response.json();

            if (!data.results || data.results.length === 0) {
                throw new NotFoundError(params.bundleId || params.id);
            }

            const app = data.results[0];

            return {
                bundleId: app.bundleId,
                version: app.version,
                appId: String(app.trackId),
                title: app.trackName,
                developer: app.sellerName || app.artistName,
                whatsNew: app.releaseNotes || null,
                releaseDate: app.releaseDate || null,
                currentVersionReleaseDate: app.currentVersionReleaseDate || null,
                minimumOsVersion: app.minimumOsVersion,
                fetchedAt: new Date().toISOString(),
                fromCache: false,
            };

        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                throw new TimeoutError(this.timeout);
            }

            throw wrapError(error);
        }
    }

    /**
     * Gets version info by bundle ID
     * @param {string} bundleId - iOS bundle identifier
     * @returns {Promise<AppStoreVersionInfo>}
     */
    async getVersionByBundleId(bundleId) {
        const result = validateBundleId(bundleId);
        if (!result.valid) {
            throw new ValidationError('bundleId', result.error);
        }

        const sanitizedId = result.sanitized;
        const cacheKey = this.getCacheKey(sanitizedId, 'bundleId');

        logger.debug('Getting iOS version by bundleId', { bundleId: sanitizedId });
        emitMonitoringEvent('request', { bundleId: sanitizedId, platform: 'ios' });

        // Try cache
        try {
            const cached = await this.cache.get(cacheKey);
            if (cached) {
                logger.debug('Cache hit', { bundleId: sanitizedId });
                return { ...cached, fromCache: true };
            }
        } catch (e) {
            logger.warn('Cache read error', { error: e.message });
        }

        // Fetch from API
        const versionInfo = await this.fetchFromiTunes({ bundleId: sanitizedId });
        this.requestCount++;

        // Cache result
        try {
            await this.cache.set(cacheKey, {
                ...versionInfo,
                cacheExpiresAt: Date.now() + config.cacheTTL,
            });
        } catch (e) {
            logger.warn('Cache write error', { error: e.message });
        }

        return versionInfo;
    }

    /**
     * Gets version info by iTunes app ID
     * @param {string|number} appId - iTunes numeric app ID
     * @returns {Promise<AppStoreVersionInfo>}
     */
    async getVersionByAppId(appId) {
        const result = validateAppId(appId);
        if (!result.valid) {
            throw new ValidationError('appId', result.error);
        }

        const sanitizedId = result.sanitized;
        const cacheKey = this.getCacheKey(sanitizedId, 'appId');

        logger.debug('Getting iOS version by appId', { appId: sanitizedId });
        emitMonitoringEvent('request', { appId: sanitizedId, platform: 'ios' });

        // Try cache
        try {
            const cached = await this.cache.get(cacheKey);
            if (cached) {
                return { ...cached, fromCache: true };
            }
        } catch (e) {
            logger.warn('Cache read error', { error: e.message });
        }

        // Fetch from API
        const versionInfo = await this.fetchFromiTunes({ id: sanitizedId });
        this.requestCount++;

        // Cache result
        try {
            await this.cache.set(cacheKey, {
                ...versionInfo,
                cacheExpiresAt: Date.now() + config.cacheTTL,
            });
        } catch (e) {
            logger.warn('Cache write error', { error: e.message });
        }

        return versionInfo;
    }

    /**
     * Searches for apps by term
     * @param {string} term - Search term
     * @param {number} limit - Max results (1-50)
     * @returns {Promise<AppStoreVersionInfo[]>}
     */
    async search(term, limit = 10) {
        if (!term || typeof term !== 'string' || term.length < 2) {
            throw new ValidationError('term', 'Search term must be at least 2 characters');
        }

        const url = new URL('/search', ITUNES_API_URL);
        url.searchParams.set('term', term.slice(0, 100));
        url.searchParams.set('entity', 'software');
        url.searchParams.set('country', this.country);
        url.searchParams.set('limit', String(Math.min(Math.max(1, limit), 50)));

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            await this.rateLimiter.consume('appstore-search');

            const response = await fetch(url.toString(), {
                headers: { 'Accept': 'application/json' },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new NetworkError(`iTunes API returned ${response.status}`);
            }

            const data = await response.json();

            return (data.results || []).map(app => ({
                bundleId: app.bundleId,
                version: app.version,
                appId: String(app.trackId),
                title: app.trackName,
                developer: app.sellerName || app.artistName,
                fetchedAt: new Date().toISOString(),
                fromCache: false,
            }));

        } catch (error) {
            clearTimeout(timeoutId);
            throw wrapError(error);
        }
    }

    /**
     * Gets health status
     */
    async getHealth() {
        const cacheStats = await this.cache.getStats();
        const rateLimitStats = await this.rateLimiter.getStats();

        return {
            status: 'healthy',
            platform: 'ios',
            uptime: Math.floor((Date.now() - this.startedAt) / 1000),
            cache: {
                size: cacheStats.size,
                hits: cacheStats.hits,
                misses: cacheStats.misses,
            },
            rateLimit: rateLimitStats,
            requests: {
                total: this.requestCount,
                errors: this.errorCount,
            },
        };
    }
}

// Default instance
let defaultScraper = null;

export function getDefaultAppStoreScraper(options = {}) {
    if (!defaultScraper) {
        defaultScraper = new AppStoreScraper(options);
    }
    return defaultScraper;
}

export async function getAppStoreVersion(bundleId) {
    return getDefaultAppStoreScraper().getVersionByBundleId(bundleId);
}

export async function getAppStoreVersionByAppId(appId) {
    return getDefaultAppStoreScraper().getVersionByAppId(appId);
}

export default {
    AppStoreScraper,
    getDefaultAppStoreScraper,
    getAppStoreVersion,
    getAppStoreVersionByAppId,
    validateBundleId,
    validateAppId,
};
