/**
 * App Store Version API Route
 * 
 * GET /api/appstore/[appId] - Get iOS app version by iTunes App ID
 * 
 * @module api/appstore/[appId]
 */

import { NextResponse } from 'next/server';
import { getDefaultAppStoreScraper } from '@/lib/appstore';
import { logger } from '@/lib/playstore';

const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
};

/**
 * GET handler - fetch iOS app version by iTunes App ID
 */
export async function GET(request, { params }) {
    const startTime = Date.now();

    try {
        const { appId } = await params;

        if (!appId) {
            return createErrorResponse('App ID is required', 400);
        }

        logger.info('iOS version request received', { appId });

        const scraper = getDefaultAppStoreScraper();
        const versionInfo = await scraper.getVersionByAppId(appId);

        const response = NextResponse.json({
            success: true,
            data: versionInfo,
        });

        addSecurityHeaders(response);
        addCacheHeaders(response, versionInfo.fromCache);

        logger.info('iOS version request completed', {
            appId,
            version: versionInfo.version,
            fromCache: versionInfo.fromCache,
            durationMs: Date.now() - startTime,
        });

        return response;

    } catch (error) {
        logger.error('iOS version request failed', {
            error: error.message,
            durationMs: Date.now() - startTime,
        });

        const statusCode = error.statusCode || 500;
        const safeResponse = error.toSafeResponse
            ? error.toSafeResponse()
            : { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } };

        const response = NextResponse.json(safeResponse, { status: statusCode });
        addSecurityHeaders(response);
        return response;
    }
}

function createErrorResponse(message, status) {
    const response = NextResponse.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message },
    }, { status });
    addSecurityHeaders(response);
    return response;
}

function addSecurityHeaders(response) {
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
        response.headers.set(key, value);
    });
}

function addCacheHeaders(response, fromCache) {
    response.headers.set('X-Cache', fromCache ? 'HIT' : 'MISS');
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            ...SECURITY_HEADERS,
        },
    });
}
