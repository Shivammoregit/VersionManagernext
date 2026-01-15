/**
 * App Store Health Check API Route
 * 
 * GET /api/appstore/health - Get App Store scraper health status
 */

import { NextResponse } from 'next/server';
import { getDefaultAppStoreScraper, VERSION } from '@/lib/appstore';

const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store, max-age=0',
};

export async function GET() {
    try {
        const scraper = getDefaultAppStoreScraper();
        const health = await scraper.getHealth();

        const response = NextResponse.json({
            ...health,
            version: VERSION,
            timestamp: new Date().toISOString(),
        });

        Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
            response.headers.set(key, value);
        });

        return response;

    } catch (error) {
        const response = NextResponse.json({
            status: 'unhealthy',
            platform: 'ios',
            error: 'Health check failed',
            timestamp: new Date().toISOString(),
        }, { status: 503 });

        Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
            response.headers.set(key, value);
        });

        return response;
    }
}
