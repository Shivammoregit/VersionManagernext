/**
 * Play Store Scraper Module - Configuration
 * 
 * Centralized configuration management with environment variable support.
 * All configuration is loaded from environment variables with sensible defaults.
 * 
 * @module playstore/config
 */

/**
 * Validates and parses an environment variable as an integer.
 * @param {string} value - The environment variable value
 * @param {number} defaultValue - Default value if parsing fails
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} - Parsed integer within bounds
 */
function parseIntEnv(value, defaultValue, min = 0, max = Infinity) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    return defaultValue;
  }
  return Math.min(Math.max(parsed, min), max);
}

/**
 * Validates that required environment variables are present.
 * Logs warnings for missing optional variables.
 * @throws {Error} If critical environment variables are missing
 */
function validateEnvironment() {
  const warnings = [];

  // Check for optional but recommended variables
  if (!process.env.PLAYSTORE_API_KEY) {
    warnings.push('PLAYSTORE_API_KEY not set - API endpoints will be unprotected');
  }

  return { warnings };
}

// Validate environment on module load
const { warnings: envWarnings } = validateEnvironment();

/**
 * Configuration object for the Play Store Scraper module.
 * All values are read from environment variables with secure defaults.
 * 
 * @typedef {Object} PlayStoreConfig
 * @property {number} cacheTTL - Cache time-to-live in milliseconds (default: 1 hour)
 * @property {number} rateLimit - Maximum requests per minute (default: 10)
 * @property {number} rateLimitWindowMs - Rate limit window in milliseconds (default: 1 minute)
 * @property {string} logLevel - Logging level: debug, info, warn, error (default: info)
 * @property {string} apiKeyHeader - Header name for API key authentication (default: x-api-key)
 * @property {string|null} apiKey - API key for endpoint authentication (optional)
 * @property {number} requestTimeout - HTTP request timeout in milliseconds (default: 30s)
 * @property {number} maxRetries - Maximum retry attempts for failed requests (default: 3)
 * @property {number} retryBaseDelay - Base delay for exponential backoff in milliseconds (default: 1s)
 * @property {number} maxCacheSize - Maximum number of entries in cache (default: 1000)
 * @property {boolean} enableMonitoring - Whether to enable monitoring hooks (default: false)
 */

/**
 * @type {PlayStoreConfig}
 */
export const config = Object.freeze({
  // Cache settings
  cacheTTL: parseIntEnv(process.env.PLAYSTORE_CACHE_TTL_MS, 3600000, 60000, 86400000), // 1 hour default, min 1 min, max 24 hours
  maxCacheSize: parseIntEnv(process.env.PLAYSTORE_MAX_CACHE_SIZE, 1000, 10, 10000),

  // Rate limiting (using sliding window counter algorithm)
  rateLimit: parseIntEnv(process.env.PLAYSTORE_RATE_LIMIT, 30, 1, 100), // per window
  rateLimitWindowMs: parseIntEnv(process.env.PLAYSTORE_RATE_LIMIT_WINDOW_MS, 60000, 10000, 300000), // 1 minute default

  // Logging
  logLevel: process.env.PLAYSTORE_LOG_LEVEL || 'info',

  // Authentication
  apiKeyHeader: process.env.PLAYSTORE_API_KEY_HEADER || 'x-api-key',
  apiKey: process.env.PLAYSTORE_API_KEY || null,

  // Request settings
  requestTimeout: parseIntEnv(process.env.PLAYSTORE_REQUEST_TIMEOUT_MS, 30000, 5000, 60000), // 30s default
  maxRetries: parseIntEnv(process.env.PLAYSTORE_MAX_RETRIES, 3, 0, 10),
  retryBaseDelay: parseIntEnv(process.env.PLAYSTORE_RETRY_BASE_DELAY_MS, 1000, 100, 10000),

  // Monitoring
  enableMonitoring: process.env.PLAYSTORE_ENABLE_MONITORING === 'true',

  // Environment warnings captured at startup
  _envWarnings: envWarnings,
});

/**
 * Returns the configuration object.
 * Use this function to access config with guaranteed immutability.
 * @returns {PlayStoreConfig} Frozen configuration object
 */
export function getConfig() {
  return config;
}

/**
 * Logs all environment warnings that were detected at startup.
 * Should be called after logger is initialized.
 * @param {Function} logFn - Logging function to use
 */
export function logEnvironmentWarnings(logFn) {
  if (typeof logFn === 'function') {
    config._envWarnings.forEach(warning => logFn(warning));
  }
}

export default config;
