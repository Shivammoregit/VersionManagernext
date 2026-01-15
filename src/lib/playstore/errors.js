/**
 * Play Store Scraper Module - Custom Error Classes
 * 
 * Provides a hierarchy of error types for different failure scenarios.
 * All errors include error codes for programmatic handling and safe
 * user-facing messages that don't expose internal details.
 * 
 * @module playstore/errors
 */

/**
 * Base error class for all Play Store Scraper errors.
 * Provides consistent structure for error handling and logging.
 */
export class PlayStoreError extends Error {
    /**
     * @param {string} message - Internal error message (for logging)
     * @param {string} code - Machine-readable error code
     * @param {string} userMessage - Safe message to show to end users
     * @param {number} statusCode - HTTP status code to return
     * @param {Object} [details] - Additional error details (for logging only)
     */
    constructor(message, code, userMessage, statusCode = 500, details = null) {
        super(message);
        this.name = 'PlayStoreError';
        this.code = code;
        this.userMessage = userMessage;
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date().toISOString();

        // Maintain proper stack trace for V8 engines
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    /**
     * Returns a safe response object that can be sent to clients.
     * Never exposes internal error details or stack traces.
     * @returns {Object} Safe error response
     */
    toSafeResponse() {
        return {
            success: false,
            error: {
                code: this.code,
                message: this.userMessage,
            },
        };
    }

    /**
     * Returns full error details for logging purposes.
     * Includes internal message and details, but not stack trace.
     * @returns {Object} Full error details for logging
     */
    toLogObject() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            userMessage: this.userMessage,
            statusCode: this.statusCode,
            details: this.details,
            timestamp: this.timestamp,
        };
    }
}

/**
 * Error thrown when an app package is not found on the Play Store.
 */
export class NotFoundError extends PlayStoreError {
    /**
     * @param {string} packageId - The package ID that was not found
     */
    constructor(packageId) {
        // Sanitize packageId for logging (prevent log injection)
        const sanitizedId = packageId ? packageId.substring(0, 100).replace(/[^\w.]/g, '') : 'unknown';

        super(
            `App not found: ${sanitizedId}`,
            'NOT_FOUND',
            'The requested app was not found on the Play Store.',
            404,
            { packageId: sanitizedId }
        );
        this.name = 'NotFoundError';
    }
}

/**
 * Error thrown when rate limit is exceeded.
 * Includes retry-after information for clients.
 */
export class RateLimitError extends PlayStoreError {
    /**
     * @param {number} retryAfterMs - Milliseconds until rate limit resets
     */
    constructor(retryAfterMs = 60000) {
        super(
            `Rate limit exceeded. Retry after ${retryAfterMs}ms`,
            'RATE_LIMIT_EXCEEDED',
            'Too many requests. Please try again later.',
            429,
            { retryAfterMs }
        );
        this.name = 'RateLimitError';
        this.retryAfterMs = retryAfterMs;
        this.retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
    }

    toSafeResponse() {
        return {
            ...super.toSafeResponse(),
            retryAfter: this.retryAfterSeconds,
        };
    }
}

/**
 * Error thrown when there are network or connectivity issues.
 */
export class NetworkError extends PlayStoreError {
    /**
     * @param {string} [internalMessage] - Internal error message
     * @param {Object} [originalError] - Original error object
     */
    constructor(internalMessage = 'Network request failed', originalError = null) {
        super(
            internalMessage,
            'NETWORK_ERROR',
            'Unable to connect to Play Store. Please try again later.',
            503,
            { originalError: originalError?.message || null }
        );
        this.name = 'NetworkError';
        this.originalError = originalError;
        this.isRetryable = true;
    }
}

/**
 * Error thrown when input validation fails.
 */
export class ValidationError extends PlayStoreError {
    /**
     * @param {string} field - The field that failed validation
     * @param {string} reason - Reason for validation failure
     */
    constructor(field, reason) {
        // Sanitize inputs for safety
        const sanitizedField = field ? String(field).substring(0, 50) : 'unknown';
        const sanitizedReason = reason ? String(reason).substring(0, 200) : 'Invalid input';

        super(
            `Validation failed for ${sanitizedField}: ${sanitizedReason}`,
            'VALIDATION_ERROR',
            sanitizedReason, // Validation messages are safe to show users
            400,
            { field: sanitizedField }
        );
        this.name = 'ValidationError';
        this.field = sanitizedField;
    }
}

/**
 * Error thrown when request times out.
 */
export class TimeoutError extends PlayStoreError {
    /**
     * @param {number} timeoutMs - Timeout value in milliseconds
     */
    constructor(timeoutMs = 30000) {
        super(
            `Request timed out after ${timeoutMs}ms`,
            'TIMEOUT',
            'The request took too long. Please try again.',
            504,
            { timeoutMs }
        );
        this.name = 'TimeoutError';
        this.isRetryable = true;
    }
}

/**
 * Error thrown when Play Store service is temporarily unavailable.
 */
export class ServiceUnavailableError extends PlayStoreError {
    /**
     * @param {string} [reason] - Internal reason for unavailability
     */
    constructor(reason = 'Play Store temporarily unavailable') {
        super(
            reason,
            'SERVICE_UNAVAILABLE',
            'Play Store service is temporarily unavailable. Please try again later.',
            503,
            null
        );
        this.name = 'ServiceUnavailableError';
        this.isRetryable = true;
    }
}

/**
 * Error thrown when API authentication fails.
 */
export class AuthenticationError extends PlayStoreError {
    constructor() {
        super(
            'API key authentication failed',
            'UNAUTHORIZED',
            'Invalid or missing API key.',
            401,
            null
        );
        this.name = 'AuthenticationError';
    }
}

/**
 * Wraps an unknown error into a PlayStoreError.
 * Used for consistent error handling when catching third-party errors.
 * 
 * @param {Error|unknown} error - The error to wrap
 * @returns {PlayStoreError} A PlayStoreError instance
 */
export function wrapError(error) {
    if (error instanceof PlayStoreError) {
        return error;
    }

    // Check for common error patterns
    if (error && typeof error === 'object') {
        const message = error.message || String(error);

        // Detect network-related errors
        if (
            message.includes('ECONNREFUSED') ||
            message.includes('ENOTFOUND') ||
            message.includes('ETIMEDOUT') ||
            message.includes('fetch failed') ||
            message.includes('network')
        ) {
            return new NetworkError(message, error);
        }

        // Detect not found errors from google-play-scraper
        if (message.includes('not found') || message.includes('404')) {
            return new NotFoundError('unknown');
        }

        // Detect rate limiting from Play Store
        if (message.includes('429') || message.includes('rate limit')) {
            return new RateLimitError();
        }

        // Detect timeout
        if (message.includes('timeout') || message.includes('ETIMEOUT')) {
            return new TimeoutError();
        }
    }

    // Default to generic PlayStoreError
    return new PlayStoreError(
        error?.message || 'Unknown error occurred',
        'INTERNAL_ERROR',
        'An unexpected error occurred. Please try again.',
        500,
        null
    );
}

export default {
    PlayStoreError,
    NotFoundError,
    RateLimitError,
    NetworkError,
    ValidationError,
    TimeoutError,
    ServiceUnavailableError,
    AuthenticationError,
    wrapError,
};
