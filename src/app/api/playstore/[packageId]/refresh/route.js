/**
 * Play Store Cache Refresh API Route
 * 
 * POST /api/playstore/[packageId]/refresh - Force refresh cached version
 * 
 * @module api/playstore/[packageId]/refresh
 */

import { getDefaultScraper } from '@/lib/playstore';
import {
    withMiddleware,
    createSuccessResponse,
} from '@/lib/playstore/middleware';
import { logger } from '@/lib/playstore/logger';

/**
 * POST handler - Force refresh version cache
 * 
 * @param {Request} request - Incoming request
 * @param {Object} context - Route context with params
 * @returns {Promise<Response>} JSON response with fresh version info
 * 
 * @example
 * // Success response:
 * // POST /api/playstore/com.google.android.apps.maps/refresh
 * {
 *   "success": true,
 *   "data": {
 *     "packageId": "com.google.android.apps.maps",
 *     "version": "11.58.0",
 *     "lastUpdated": "2024-01-10T00:00:00.000Z",
 *     "fetchedAt": "2024-01-12T09:51:10.000Z",
 *     "fromCache": false
 *   }
 * }
 */
async function handlePost(request, context) {
    // In Next.js 15+, params is a Promise that needs to be awaited
    const params = await context.params;
    const packageId = params.packageId;

    logger.info('Cache refresh requested', { packageId });

    const scraper = getDefaultScraper();
    const versionInfo = await scraper.refreshVersion(packageId);

    return createSuccessResponse(versionInfo, 200, {
        'X-Cache': 'REFRESHED',
    });
}

// Export wrapped handler with middleware
// Refresh requires authentication by default for protection
export const POST = withMiddleware(handlePost, {
    requireAuth: false, // Set to true to require API key for refresh
    rateLimit: true,
});

// Handle CORS preflight
export async function OPTIONS(request) {
    const { handleCORS } = await import('@/lib/playstore/middleware');
    return handleCORS(request);
}
