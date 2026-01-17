/**
 * Play Store Version API Route
 * 
 * GET /api/playstore/[packageId] - Fetch version info for an app
 * 
 * @module api/playstore/[packageId]
 */

import { getDefaultScraper } from '@/lib/playstore';
import {
    withMiddleware,
    createSuccessResponse,
    createErrorResponse,
} from '@/lib/playstore/middleware';
import { logger } from '@/lib/playstore/logger';

/**
 * GET handler - Fetch app version from Play Store
 * 
 * @param {Request} request - Incoming request
 * @param {Object} context - Route context with params
 * @returns {Promise<Response>} JSON response with version info
 * 
 * @example
 * // Success response:
 * // GET /api/playstore/com.google.android.apps.maps
 * {
 *   "success": true,
 *   "data": {
 *     "packageId": "com.google.android.apps.maps",
 *     "version": "11.58.0",
 *     "lastUpdated": "2024-01-10T00:00:00.000Z",
 *     "fetchedAt": "2024-01-12T09:51:10.000Z",
 *     "whatsNew": "Bug fixes and performance improvements.",
 *     "fromCache": false
 *   }
 * }
 * 
 * @example
 * // Error response:
 * // GET /api/playstore/invalid-package
 * {
 *   "success": false,
 *   "error": {
 *     "code": "VALIDATION_ERROR",
 *     "message": "Invalid package ID format. Must be like \"com.example.app\""
 *   }
 * }
 */
async function handleGet(request, context) {
    // In Next.js 15+, params is a Promise that needs to be awaited
    const params = await context.params;
    const packageId = params.packageId;

    logger.info('Version request received', { packageId });

    const scraper = getDefaultScraper();
    const versionInfo = await scraper.getVersion(packageId);

    // Add cache-related headers
    const extraHeaders = {};
    if (versionInfo.fromCache && versionInfo.cacheExpiresIn) {
        extraHeaders['X-Cache'] = 'HIT';
        extraHeaders['X-Cache-Expires-In'] = String(versionInfo.cacheExpiresIn);
    } else {
        extraHeaders['X-Cache'] = 'MISS';
    }

    return createSuccessResponse(versionInfo, 200, extraHeaders);
}

// Export wrapped handler with middleware
export const GET = withMiddleware(handleGet, {
    requireAuth: false, // Set to true to require API key
    rateLimit: true,
});

// Handle CORS preflight
export async function OPTIONS(request) {
    const { handleCORS } = await import('@/lib/playstore/middleware');
    return handleCORS(request);
}
