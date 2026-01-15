/**
 * Play Store Scraper Module - Logger
 * 
 * Structured logging utility with multiple levels and JSON output support.
 * Sanitizes sensitive data and provides consistent log formatting.
 * 
 * @module playstore/logger
 */

import { config } from './config.js';

/**
 * Log levels in order of priority (lower = more verbose)
 */
const LOG_LEVELS = Object.freeze({
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    silent: 4,
});

/**
 * Patterns to detect sensitive data that should be masked
 */
const SENSITIVE_PATTERNS = [
    /api[_-]?key/i,
    /password/i,
    /secret/i,
    /token/i,
    /auth/i,
    /credential/i,
];

/**
 * Sanitizes a value by masking potentially sensitive data.
 * Recursively processes objects and arrays.
 * 
 * @param {any} value - Value to sanitize
 * @param {string} [key] - Key name (used to detect sensitive fields)
 * @returns {any} Sanitized value
 */
function sanitizeValue(value, key = '') {
    // Check if key name suggests sensitive data
    if (key && SENSITIVE_PATTERNS.some(pattern => pattern.test(key))) {
        return '[REDACTED]';
    }

    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === 'string') {
        // Mask potential package IDs in logs for privacy
        // But keep first and last parts visible for debugging
        if (value.includes('.') && value.length > 20) {
            const parts = value.split('.');
            if (parts.length >= 3) {
                return `${parts[0]}...${parts[parts.length - 1]}`;
            }
        }
        return value;
    }

    if (Array.isArray(value)) {
        return value.map((item, i) => sanitizeValue(item, String(i)));
    }

    if (typeof value === 'object') {
        const sanitized = {};
        for (const [k, v] of Object.entries(value)) {
            sanitized[k] = sanitizeValue(v, k);
        }
        return sanitized;
    }

    return value;
}

/**
 * Gets the current log level from config
 * @returns {number} Current log level value
 */
function getCurrentLevel() {
    const level = config.logLevel?.toLowerCase() || 'info';
    return LOG_LEVELS[level] ?? LOG_LEVELS.info;
}

/**
 * Formats a log entry for output.
 * Returns JSON in production, human-readable in development.
 * 
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} [context] - Additional context
 * @returns {string} Formatted log entry
 */
function formatLogEntry(level, message, context = null) {
    const timestamp = new Date().toISOString();
    const entry = {
        timestamp,
        level: level.toUpperCase(),
        module: 'playstore',
        message,
    };

    if (context !== null && context !== undefined) {
        entry.context = sanitizeValue(context);
    }

    // In development, use more readable format
    if (process.env.NODE_ENV === 'development') {
        const contextStr = context ? ` ${JSON.stringify(sanitizeValue(context))}` : '';
        return `[${timestamp}] [${level.toUpperCase()}] [playstore] ${message}${contextStr}`;
    }

    // In production, use JSON for structured logging
    return JSON.stringify(entry);
}

/**
 * Creates a log function for a specific level.
 * 
 * @param {string} level - Log level name
 * @param {Function} outputFn - Console function to use
 * @returns {Function} Log function
 */
function createLogFn(level, outputFn) {
    return (message, context = null) => {
        if (LOG_LEVELS[level] >= getCurrentLevel()) {
            outputFn(formatLogEntry(level, message, context));
        }
    };
}

/**
 * Logger object with methods for each log level.
 * 
 * @typedef {Object} Logger
 * @property {Function} debug - Debug level logging (most verbose)
 * @property {Function} info - Informational messages
 * @property {Function} warn - Warning messages
 * @property {Function} error - Error messages (least verbose)
 */

/**
 * Default logger instance using console output.
 * @type {Logger}
 */
export const logger = Object.freeze({
    /**
     * Logs a debug message. Use for detailed troubleshooting.
     * @param {string} message - Message to log
     * @param {Object} [context] - Additional context data
     */
    debug: createLogFn('debug', console.debug),

    /**
     * Logs an info message. Use for normal operational messages.
     * @param {string} message - Message to log
     * @param {Object} [context] - Additional context data
     */
    info: createLogFn('info', console.info),

    /**
     * Logs a warning message. Use for potentially problematic situations.
     * @param {string} message - Message to log
     * @param {Object} [context] - Additional context data
     */
    warn: createLogFn('warn', console.warn),

    /**
     * Logs an error message. Use for error conditions.
     * @param {string} message - Message to log
     * @param {Object} [context] - Additional context data
     */
    error: createLogFn('error', console.error),
});

/**
 * Monitoring hooks for tracking operations.
 * These can be replaced with custom implementations for integration
 * with monitoring systems like DataDog, New Relic, etc.
 */
let monitoringHooks = {
    onRequest: null,
    onCacheHit: null,
    onCacheMiss: null,
    onError: null,
    onSuccess: null,
};

/**
 * Registers monitoring callbacks.
 * 
 * @param {Object} hooks - Object containing callback functions
 * @param {Function} [hooks.onRequest] - Called on each request
 * @param {Function} [hooks.onCacheHit] - Called on cache hit
 * @param {Function} [hooks.onCacheMiss] - Called on cache miss
 * @param {Function} [hooks.onError] - Called on error
 * @param {Function} [hooks.onSuccess] - Called on successful fetch
 */
export function registerMonitoringHooks(hooks) {
    if (!config.enableMonitoring) {
        logger.warn('Monitoring disabled - hooks not registered');
        return;
    }

    if (hooks && typeof hooks === 'object') {
        Object.keys(monitoringHooks).forEach(key => {
            if (typeof hooks[key] === 'function') {
                monitoringHooks[key] = hooks[key];
            }
        });
        logger.info('Monitoring hooks registered', { hooks: Object.keys(hooks) });
    }
}

/**
 * Emits a monitoring event if a hook is registered.
 * 
 * @param {string} eventName - Name of the event (corresponds to hook name)
 * @param {Object} data - Event data to pass to the hook
 */
export function emitMonitoringEvent(eventName, data) {
    if (!config.enableMonitoring) return;

    const hookName = `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`;
    const hook = monitoringHooks[hookName];

    if (typeof hook === 'function') {
        try {
            hook(data);
        } catch (error) {
            // Never let monitoring errors affect main functionality
            logger.debug('Monitoring hook error', { hookName, error: error.message });
        }
    }
}

export default logger;
