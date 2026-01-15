/**
 * Play Store Scraper Health Check API Route
 * 
 * GET /api/playstore/health - Get scraper health status
 * 
 * @module api/playstore/health
 */

import { NextResponse } from 'next/server';
import { getDefaultScraper, config, VERSION } from '@/lib/playstore';

/**
 * Security headers for the response
 */
const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store, max-age=0',
};

/**
 * GET handler - Health check endpoint
 * 
 * Returns comprehensive health status including:
 * - Overall status
 * - Cache statistics
 * - Rate limiter statistics
 * - Module version
 * - Uptime
 * 
 * @param {Request} request - Incoming request
 * @returns {Promise<Response>} JSON response with health status
 * 
 * @example
 * // Success response:
 * // GET /api/playstore/health
 * {
 *   "status": "healthy",
 *   "version": "1.0.0",
 *   "uptime": 3600,
 *   "cache": {
 *     "size": 5,
 *     "hits": 42,
 *     "misses": 3,
 *     "hitRate": "93.3%"
 *   },
 *   "rateLimit": {
 *     "totalRequests": 45,
 *     "rejectedRequests": 0,
 *     "limit": 10,
 *     "windowMs": 60000
 *   },
 *   "config": {
 *     "cacheTTL": 3600000,
 *     "rateLimit": 10,
 *     "requestTimeout": 30000
 *   }
 * }
 */
export async function GET(request) {
    try {
        const scraper = getDefaultScraper();
        const health = await scraper.getHealth();

        const response = NextResponse.json({
            status: health.status,
            version: VERSION,
            uptime: health.uptime,
            timestamp: new Date().toISOString(),
            cache: health.cache,
            rateLimit: health.rateLimit,
            requests: health.requests,
            config: {
                cacheTTL: config.cacheTTL,
                rateLimit: config.rateLimit,
                requestTimeout: config.requestTimeout,
                maxRetries: config.maxRetries,
            },
        });

        // Add security headers
        Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
            response.headers.set(key, value);
        });

        return response;

    } catch (error) {
        // Even health check errors should be safe
        const response = NextResponse.json({
            status: 'unhealthy',
            version: VERSION,
            error: 'Health check failed',
            timestamp: new Date().toISOString(),
        }, { status: 503 });

        Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
            response.headers.set(key, value);
        });

        return response;
    }
}

// Handle CORS preflight
export async function OPTIONS(request) {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
            ...SECURITY_HEADERS,
        },
    });
}
