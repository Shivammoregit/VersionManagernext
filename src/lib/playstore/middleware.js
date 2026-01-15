/**
 * Play Store Scraper API - Middleware Utilities
 * 
 * Provides middleware functions for API route security, error handling,
 * and request processing in Next.js App Router.
 * 
 * @module playstore/middleware
 */

import { NextResponse } from 'next/server';
import { config } from './config.js';
import { logger } from './logger.js';
import { timingSafeEqual, validateHeaders } from './validation.js';
import { PlayStoreError, AuthenticationError, RateLimitError } from './errors.js';
import { getDefaultRateLimiter } from './rateLimiter.js';

/**
 * Security headers to add to all API responses.
 * Based on OWASP recommendations.
 */
const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store, max-age=0',
};

/**
 * Extracts client IP from request headers.
 * Handles various proxy headers.
 * 
 * @param {Request} request - Incoming request
 * @returns {string} Client IP address
 */
export function getClientIP(request) {
    // Check common proxy headers
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
        // Take the first IP (original client)
        return forwardedFor.split(',')[0].trim();
    }

    const realIP = request.headers.get('x-real-ip');
    if (realIP) {
        return realIP.trim();
    }

    // Fallback to a generic key
    return 'unknown';
}

/**
 * Creates a standardized error response.
 * Never exposes internal error details.
 * 
 * @param {PlayStoreError|Error} error - Error object
 * @returns {NextResponse} Error response with security headers
 */
export function createErrorResponse(error) {
    // Wrap unknown errors
    const playStoreError = error instanceof PlayStoreError
        ? error
        : new PlayStoreError(
            error.message || 'Unknown error',
            'INTERNAL_ERROR',
            'An unexpected error occurred.',
            500
        );

    // Log the full error internally
    logger.error('API error', playStoreError.toLogObject());

    // Create safe response
    const response = NextResponse.json(
        playStoreError.toSafeResponse(),
        { status: playStoreError.statusCode }
    );

    // Add security headers
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
        response.headers.set(key, value);
    });

    // Add rate limit headers if applicable
    if (error instanceof RateLimitError) {
        response.headers.set('Retry-After', String(error.retryAfterSeconds));
        response.headers.set('X-RateLimit-Limit', String(config.rateLimit));
        response.headers.set('X-RateLimit-Remaining', '0');
    }

    return response;
}

/**
 * Creates a standardized success response.
 * 
 * @param {any} data - Response data
 * @param {number} [status=200] - HTTP status code
 * @param {Object} [extraHeaders={}] - Additional headers
 * @returns {NextResponse} Success response with security headers
 */
export function createSuccessResponse(data, status = 200, extraHeaders = {}) {
    const response = NextResponse.json(
        {
            success: true,
            data,
        },
        { status }
    );

    // Add security headers
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
        response.headers.set(key, value);
    });

    // Add extra headers
    Object.entries(extraHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
    });

    return response;
}

/**
 * Validates API key from request headers.
 * Uses timing-safe comparison to prevent timing attacks.
 * 
 * @param {Request} request - Incoming request
 * @returns {{ valid: boolean, error?: AuthenticationError }}
 */
export function validateApiKey(request, options = {}) {
    const { requireConfiguredKey = false } = options;

    // If no API key is configured, allow requests unless explicitly required
    if (!config.apiKey) {
        return requireConfiguredKey
            ? { valid: false, error: new AuthenticationError() }
            : { valid: true };
    }

    // Prefer header, but allow ?key=... for cron services
    let providedKey = request.headers.get(config.apiKeyHeader);
    if (!providedKey) {
        try {
            const url = new URL(request.url);
            providedKey = url.searchParams.get('key');
        } catch {
            // ignore
        }
    }

    if (!providedKey) {
        return {
            valid: false,
            error: new AuthenticationError(),
        };
    }

    // Use timing-safe comparison
    if (!timingSafeEqual(providedKey, config.apiKey)) {
        logger.warn('Invalid API key attempt', {
            header: config.apiKeyHeader,
            ip: getClientIP(request),
        });
        return {
            valid: false,
            error: new AuthenticationError(),
        };
    }

    return { valid: true };
}

/**
 * Applies per-IP rate limiting to a request.
 * 
 * @param {Request} request - Incoming request
 * @returns {Promise<{ allowed: boolean, remaining: number, resetMs: number, error?: RateLimitError }>}
 */
export async function applyRateLimit(request) {
    const clientIP = getClientIP(request);
    const rateLimiter = getDefaultRateLimiter();

    try {
        const result = await rateLimiter.check(`ip:${clientIP}`);

        if (!result.allowed) {
            return {
                ...result,
                error: new RateLimitError(result.resetMs),
            };
        }

        return result;
    } catch (error) {
        if (error instanceof RateLimitError) {
            return {
                allowed: false,
                remaining: 0,
                resetMs: error.retryAfterMs,
                error,
            };
        }
        throw error;
    }
}

/**
 * Validates request size and headers.
 * Rejects requests that are too large or have suspicious headers.
 * 
 * @param {Request} request - Incoming request
 * @returns {{ valid: boolean, error?: PlayStoreError }}
 */
export function validateRequest(request) {
    const headerValidation = validateHeaders(request.headers);

    if (!headerValidation.valid) {
        return {
            valid: false,
            error: new PlayStoreError(
                headerValidation.issues.join(', '),
                'BAD_REQUEST',
                'Invalid request',
                400
            ),
        };
    }

    return { valid: true };
}

/**
 * Wraps an API handler with common middleware.
 * Applies security headers, error handling, auth, and rate limiting.
 * 
 * @param {Function} handler - Async handler function (request) => Promise<Response>
 * @param {Object} [options] - Middleware options
 * @param {boolean} [options.requireAuth=false] - Whether to require API key
 * @param {boolean} [options.rateLimit=true] - Whether to apply rate limiting
 * @returns {Function} Wrapped handler
 */
export function withMiddleware(handler, options = {}) {
    const { requireAuth = false, rateLimit = true } = options;

    return async (request, context) => {
        try {
            // Validate request
            const requestValidation = validateRequest(request);
            if (!requestValidation.valid) {
                return createErrorResponse(requestValidation.error);
            }

            // Check API key if required
            if (requireAuth || config.apiKey) {
                const authResult = validateApiKey(request, { requireConfiguredKey: requireAuth });
                if (!authResult.valid) {
                    return createErrorResponse(authResult.error);
                }
            }

            // Apply rate limiting
            if (rateLimit) {
                const rateLimitResult = await applyRateLimit(request);
                if (!rateLimitResult.allowed) {
                    return createErrorResponse(rateLimitResult.error);
                }
            }

            // Call the actual handler
            return await handler(request, context);

        } catch (error) {
            return createErrorResponse(error);
        }
    };
}

/**
 * CORS preflight handler for OPTIONS requests.
 * 
 * @param {Request} request - Incoming request
 * @returns {NextResponse} CORS preflight response
 */
export function handleCORS(request) {
    const origin = request.headers.get('origin') || '*';

    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': `Content-Type, ${config.apiKeyHeader}`,
            'Access-Control-Max-Age': '86400',
            ...SECURITY_HEADERS,
        },
    });
}

export default {
    getClientIP,
    createErrorResponse,
    createSuccessResponse,
    validateApiKey,
    applyRateLimit,
    validateRequest,
    withMiddleware,
    handleCORS,
};
