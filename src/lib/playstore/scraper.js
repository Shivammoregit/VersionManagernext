/**
 * Play Store Scraper Module - Core Scraper Service (SELF-CONTAINED)
 * All dependencies inline - NO external files needed
 */

let gplayInstance = null;
async function getGplay() {
    if (!gplayInstance) {
        const module = await import('google-play-scraper');
        gplayInstance = module.default || module;
    }
    return gplayInstance;
}

// =====================================================
// INLINE DEPENDENCIES - NO EXTERNAL FILES NEEDED
// =====================================================

// 1. CONFIG
function parseIntEnv(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || raw === '') return fallback;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

const config = {
    requestTimeout: parseIntEnv('PLAYSTORE_REQUEST_TIMEOUT_MS', 10000),
    maxRetries: parseIntEnv('PLAYSTORE_MAX_RETRIES', 3),
    retryBaseDelay: parseIntEnv('PLAYSTORE_RETRY_BASE_DELAY_MS', 1000),
    cacheTTL: parseIntEnv('PLAYSTORE_CACHE_TTL_MS', 5 * 60 * 1000), // 5 minutes
    rateLimit: parseIntEnv('PLAYSTORE_RATE_LIMIT', 10),
    rateLimitWindowMs: parseIntEnv('PLAYSTORE_RATE_LIMIT_WINDOW_MS', 60000),
};

// 2. MEMORY CACHE
function getDefaultCache() {
    const cache = new Map();
    return {
        async get(key) {
            const item = cache.get(key);
            if (!item || Date.now() > item.expires) {
                cache.delete(key);
                return null;
            }
            return item.data;
        },
        async set(key, data) {
            cache.set(key, {
                data,
                expires: Date.now() + config.cacheTTL
            });
        },
        async delete(key) {
            cache.delete(key);
        },
        async clear() {
            cache.clear();
        },
        async getStats() {
            return { size: cache.size, hits: 0, misses: 0 };
        }
    };
}

// 3. RATE LIMITER
function getDefaultRateLimiter() {
    const requests = [];
    return {
        async consume(key) {
            const now = Date.now();
            // Clean expired requests
            const cutoff = now - config.rateLimitWindowMs;
            while (requests.length > 0 && requests[0] < cutoff) {
                requests.shift();
            }

            if (requests.length >= config.rateLimit) {
                const waitTime = config.rateLimitWindowMs - (now - requests[0]);
                await new Promise(r => setTimeout(r, waitTime));
                requests.shift();
            }

            requests.push(now);
        },
        async getStats() {
            return { totalRequests: requests.length, rejectedRequests: 0 };
        }
    };
}

// 4. VALIDATION
function assertValidPackageId(packageId) {
    if (!packageId || typeof packageId !== 'string') {
        throw new Error('Invalid package ID: must be non-empty string');
    }
    const validPattern = /^[a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*$/;
    if (!validPattern.test(packageId)) {
        throw new Error(`Invalid package ID format: ${packageId}`);
    }
    return packageId.toLowerCase().trim();
}

// 5. LOGGER
const logger = {
    info: (...args) => console.log('[PlayStore INFO]', ...args),
    warn: (...args) => console.warn('[PlayStore WARN]', ...args),
    debug: (...args) => console.debug('[PlayStore DEBUG]', ...args),
};

const emitMonitoringEvent = () => { }; // No-op

// 6. ERROR CLASSES
class PlayStoreError extends Error {
    constructor(message, code = 'PLAYSTORE_ERROR') {
        super(message);
        this.code = code;
        this.isRetryable = false;
    }
}

class NetworkError extends PlayStoreError {
    constructor(message) {
        super(message, 'NETWORK_ERROR');
        this.isRetryable = true;
    }
}

class TimeoutError extends PlayStoreError {
    constructor(timeout) {
        super(`Request timeout after ${timeout}ms`, 'TIMEOUT_ERROR');
        this.isRetryable = true;
    }
}

function wrapError(error) {
    if (error.code?.includes('ENOTFOUND') || error.code === 'ECONNRESET') {
        return new NetworkError(error.message);
    }
    if (error.message?.includes('timeout')) {
        return new TimeoutError(10000);
    }
    return new PlayStoreError(error.message, error.code || 'UNKNOWN_ERROR');
}

// =====================================================
// CORE FUNCTIONS (UNCHANGED)
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateBackoff(attempt, baseDelay) {
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.min(exponentialDelay + jitter, 30000);
}

function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new TimeoutError(timeoutMs));
        }, timeoutMs);

        promise
            .then(result => {
                clearTimeout(timer);
                resolve(result);
            })
            .catch(error => {
                clearTimeout(timer);
                reject(error);
            });
    });
}

// =====================================================
// MAIN CLASS (UNCHANGED)
export class PlayStoreScraper {
    constructor(options = {}) {
        this.cache = options.cache || getDefaultCache();
        this.rateLimiter = options.rateLimiter || getDefaultRateLimiter();
        this.timeout = options.timeout || config.requestTimeout;
        this.maxRetries = options.maxRetries ?? config.maxRetries;
        this.retryBaseDelay = options.retryBaseDelay || config.retryBaseDelay;
        this.country = options.country || 'us';
        this.language = options.language || 'en';

        this.startedAt = Date.now();
        this.requestCount = 0;
        this.errorCount = 0;

        logger.info('PlayStoreScraper initialized', {
            timeout: this.timeout,
            maxRetries: this.maxRetries,
            country: this.country,
        });
    }

    getCacheKey(packageId) {
        return `version:${packageId}:${this.country}`;
    }

    async fetchFromPlayStore(packageId) {
        let lastError = null;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = calculateBackoff(attempt - 1, this.retryBaseDelay);
                    logger.debug('Retry attempt', { packageId, attempt, delayMs: delay });
                    await sleep(delay);
                }

                await this.rateLimiter.consume('playstore');
                logger.debug('Fetching from Play Store', { packageId, attempt });

                const gplay = await getGplay();
                const appData = await withTimeout(
                    gplay.app({
                        appId: packageId,
                        country: this.country,
                        lang: this.language,
                    }),
                    this.timeout
                );

                const versionInfo = {
                    packageId,
                    version: appData.version || 'Unknown',
                    lastUpdated: appData.updated ? new Date(appData.updated).toISOString() : null,
                    fetchedAt: new Date().toISOString(),
                    fromCache: false,
                    title: appData.title || null,
                    developer: appData.developer || null,
                    installs: appData.installs || null,
                };

                // If the library couldn't extract the version (or returns a non-useful value), try our fallback.
                if (!appData.version || versionInfo.version === 'Unknown' || versionInfo.version === 'Varies with device') {
                    logger.warn('Primary scraper returned no usable version, attempting fallback...', {
                        packageId,
                        primaryVersion: appData.version || null,
                    });
                    try {
                        const fallback = await this.fetchFallback(packageId);
                        if (fallback?.version && fallback.version !== 'Unknown') {
                            return {
                                ...versionInfo,
                                ...fallback,
                                // Preserve fields fallback doesn't know about
                                installs: versionInfo.installs,
                                title: fallback.title ?? versionInfo.title,
                                developer: fallback.developer ?? versionInfo.developer,
                            };
                        }
                    } catch (fallbackError) {
                        logger.warn('Fallback after missing version failed', {
                            packageId,
                            error: fallbackError.message,
                        });
                    }
                }

                this.requestCount++;
                emitMonitoringEvent('success', { packageId, attempt });
                return versionInfo;
            } catch (error) {
                lastError = error;
                this.errorCount++;

                // If error is a parsing error (TypeError), try the fallback immediately
                if (error instanceof TypeError || error.message.includes('undefined')) {
                    logger.warn('Parsing error detected, attempting robust fallback...', { packageId });
                    try {
                        return await this.fetchFallback(packageId);
                    } catch (fallbackError) {
                        logger.error('Fallback also failed', { packageId, error: fallbackError.message });
                        // Continue with retry logic or throw
                    }
                }

                // Determine if error is retryable
                const wrappedError = wrapError(error);
                const isRetryable = wrappedError.isRetryable === true;

                logger.warn('Fetch attempt failed', {
                    packageId,
                    attempt,
                    error: wrappedError.message,
                    retryable: isRetryable,
                });

                emitMonitoringEvent('error', {
                    packageId,
                    attempt,
                    errorCode: wrappedError.code,
                });

                // Don't retry non-retryable errors
                if (!isRetryable) {
                    throw wrappedError;
                }

                // If this was the last attempt, throw
                if (attempt >= this.maxRetries) {
                    throw wrappedError;
                }
            }
        }

        throw wrapError(lastError || new Error('Unknown error'));
    }

    /**
     * Fallback scraping method using custom regex patterns on raw HTML.
     * Use this when the main library fails due to parsing changes.
     * @private
     */
    async fetchFallback(packageId) {
        const country = String(this.country || 'us').toLowerCase();
        const language = String(this.language || 'en').toLowerCase();
        const url = `https://play.google.com/store/apps/details?id=${packageId}&hl=${encodeURIComponent(language)}&gl=${encodeURIComponent(country)}`;

        logger.info('Running robust fallback fetch', { packageId, url });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Fallback HTTP error! status: ${response.status}`);
            }

            const html = await response.text();

            // If we got an anti-bot / interstitial page, parsing will return nonsense.
            if (/unusual\s+traffic|automated\s+queries|\/sorry\//i.test(html)) {
                throw new Error('Play Store returned an anti-bot/interstitial page');
            }

            // 1. Extract Title
            const titleMatch = html.match(/<title.*?>(.*?) - Apps on Google Play<\/title>/i) ||
                html.match(/itemprop="name".*?>(.*?)<\/h1>/i);
            const title = titleMatch ? titleMatch[1].trim() : null;

            // 2. Extract Version (tried multiple patterns)
            let version = 'Unknown';

            // Prefer versions from AF_initDataCallback ds:5 metadata (most reliable)
            if (version === 'Unknown') {
                const blobMatches = html.matchAll(/AF_initDataCallback\(\{key:\s*'([^']+)'[\s\S]*?data:([\s\S]*?),\s*sideChannel:/g);
                for (const blob of blobMatches) {
                    const key = blob[1];
                    if (key !== 'ds:5') continue;
                    const dataStr = blob[2];

                    const releaseCandidates = dataStr.match(/"release-\d+\.\d+\.\d+(?:\.\d+)?"/gi);
                    if (releaseCandidates && releaseCandidates.length > 0) {
                        version = releaseCandidates[releaseCandidates.length - 1].replace(/"/g, '');
                        break;
                    }

                    const semverCandidates = dataStr.match(/"\d+\.\d+\.\d+(?:\.\d+)?"/g);
                    if (semverCandidates && semverCandidates.length > 0) {
                        version = semverCandidates[semverCandidates.length - 1].replace(/"/g, '');
                        break;
                    }
                }
            }

            // Fallback patterns outside ds:5
            if (version === 'Unknown') {
                // Some apps include a release-* version format (e.g., release-0.3.8)
                const releaseMatch = html.match(/release-\d+\.\d+\.\d+(?:\.\d+)?/i);

                // Pattern 1: JSON blob pattern ["x.y.z(.w)"]
                const vMatch1 = html.match(/\["(\d+\.\d+\.\d+(?:\.\d+)?)"\]/);
                // Pattern 2: Deep JSON structure [[["x.y.z(.w)"],
                const vMatch2 = html.match(/\[\[\["(\d+\.\d+\.\d+(?:\.\d+)?)"\],/);
                // Pattern 3: Simple string pattern with word "version"
                const vMatch3 = html.match(/"version":\s*"(\d+\.\d+\.\d+(?:\.\d+)?)"/i);
                // Pattern 4: Quoted "vX.Y.Z" format
                const vMatch5 = html.match(/"v(\d+\.\d+\.\d+(?:\.\d+)?)"/);

                if (vMatch1) version = vMatch1[1];
                else if (vMatch2) version = vMatch2[1];
                else if (vMatch3) version = vMatch3[1];
                else if (vMatch5) version = vMatch5[1];
                else if (releaseMatch) version = releaseMatch[0];
            }

            // 3. Extract Developer
            const devMatch = html.match(/itemprop="author".*?>(.*?)<\/a>/i) ||
                html.match(/publisher.*?>(.*?)<\/span>/i);
            const developer = devMatch ? devMatch[1].trim() : null;

            // 4. Extract Update Date
            const dateMatch = html.match(/[A-Z][a-z]{2}\s\d{1,2},\s202\d/);
            const lastUpdated = dateMatch ? new Date(dateMatch[0]).toISOString() : null;

            logger.info('Fallback fetch successful', { packageId, version, title });

            return {
                packageId,
                version,
                lastUpdated,
                fetchedAt: new Date().toISOString(),
                fromCache: false,
                title,
                developer,
                isFallback: true,
            };

        } catch (error) {
            clearTimeout(timeoutId);
            throw wrapError(error);
        }
    }

    async getVersion(packageId) {
        const sanitizedId = assertValidPackageId(packageId);
        logger.debug('Getting version', { packageId: sanitizedId });
        emitMonitoringEvent('request', { packageId: sanitizedId });

        const cacheKey = this.getCacheKey(sanitizedId);
        try {
            const cached = await this.cache.get(cacheKey);

            if (cached) {
                logger.debug('Cache hit', { packageId: sanitizedId });
                emitMonitoringEvent('cacheHit', { packageId: sanitizedId });

                const cacheExpiresIn = cached.cacheExpiresAt
                    ? Math.max(0, Math.floor((cached.cacheExpiresAt - Date.now()) / 1000))
                    : undefined;

                return {
                    ...cached,
                    fromCache: true,
                    cacheExpiresIn,
                };
            }

            emitMonitoringEvent('cacheMiss', { packageId: sanitizedId });
        } catch (cacheError) {
            logger.warn('Cache read error', { error: cacheError.message });
        }

        const versionInfo = await this.fetchFromPlayStore(sanitizedId);

        try {
            // Avoid caching "Unknown" results; those usually come from temporary blocks/HTML changes.
            if (versionInfo?.version && versionInfo.version !== 'Unknown') {
                await this.cache.set(cacheKey, {
                    ...versionInfo,
                    cacheExpiresAt: Date.now() + config.cacheTTL,
                });
                logger.debug('Cached version info', { packageId: sanitizedId });
            } else {
                logger.warn('Skipping cache for unknown version result', { packageId: sanitizedId });
            }
        } catch (cacheError) {
            logger.warn('Cache write error', { error: cacheError.message });
        }

        return versionInfo;
    }

    async refreshVersion(packageId) {
        const sanitizedId = assertValidPackageId(packageId);
        const cacheKey = this.getCacheKey(sanitizedId);

        logger.info('Force refreshing version', { packageId: sanitizedId });

        await this.cache.delete(cacheKey);
        const versionInfo = await this.fetchFromPlayStore(sanitizedId);

        try {
            if (versionInfo?.version && versionInfo.version !== 'Unknown') {
                await this.cache.set(cacheKey, {
                    ...versionInfo,
                    cacheExpiresAt: Date.now() + config.cacheTTL,
                });
            } else {
                logger.warn('Skipping cache for unknown version result', { packageId: sanitizedId });
            }
        } catch (cacheError) {
            logger.warn('Cache write error', { error: cacheError.message });
        }

        return versionInfo;
    }

    async clearCache() {
        await this.cache.clear();
        logger.info('Cache cleared');
    }

    async getHealth() {
        const cacheStats = await this.cache.getStats();
        const rateLimitStats = await this.rateLimiter.getStats();

        const uptime = Math.floor((Date.now() - this.startedAt) / 1000);

        return {
            status: 'healthy',
            uptime,
            cache: {
                size: cacheStats.size,
                hits: cacheStats.hits,
                misses: cacheStats.misses,
                hitRate: cacheStats.hits + cacheStats.misses > 0
                    ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100).toFixed(1) + '%'
                    : 'N/A',
            },
            rateLimit: {
                totalRequests: rateLimitStats.totalRequests,
                rejectedRequests: rateLimitStats.rejectedRequests,
                limit: config.rateLimit,
                windowMs: config.rateLimitWindowMs,
            },
            requests: {
                total: this.requestCount,
                errors: this.errorCount,
                successRate: this.requestCount > 0
                    ? ((this.requestCount - this.errorCount) / this.requestCount * 100).toFixed(1) + '%'
                    : 'N/A',
            },
        };
    }

    async getStats() {
        return this.getHealth();
    }

    destroy() {
        if (typeof this.cache.destroy === 'function') {
            this.cache.destroy();
        }
        if (typeof this.rateLimiter.destroy === 'function') {
            this.rateLimiter.destroy();
        }
        logger.info('PlayStoreScraper destroyed');
    }
}

// =====================================================
// EXPORTS (UNCHANGED)
let defaultScraper = null;

export function getDefaultScraper(options = {}) {
    if (!defaultScraper) {
        defaultScraper = new PlayStoreScraper(options);
    }
    return defaultScraper;
}

export function setDefaultScraper(scraper) {
    if (defaultScraper && typeof defaultScraper.destroy === 'function') {
        defaultScraper.destroy();
    }
    defaultScraper = scraper;
}

export async function getVersion(packageId) {
    return getDefaultScraper().getVersion(packageId);
}

export async function refreshVersion(packageId) {
    return getDefaultScraper().refreshVersion(packageId);
}

export default {
    PlayStoreScraper,
    getDefaultScraper,
    setDefaultScraper,
    getVersion,
    refreshVersion,
};
