/**
 * Sync Play Store versions into MongoDB.
 *
 * This endpoint fetches the latest Play Store versions for PetYosa and VetYosa
 * and updates the `releases` collection (production) when the version changes.
 *
 * Auth (optional):
 * - If PLAYSTORE_API_KEY is set, require it via header (PLAYSTORE_API_KEY_HEADER, default x-api-key)
 *   or via query param `?key=...` (useful for cron services).
 */

import clientPromise from '@/lib/mongodb';
import { getDefaultScraper } from '@/lib/playstore';
import { NextResponse } from 'next/server';

const TARGETS = [
    { packageId: 'com.petyosa.petapp', app_id: 'android-parent', buildPrefix: 102 },
    { packageId: 'com.petyosa.vetapp', app_id: 'android-partner', buildPrefix: 203 },
];

function getProvidedApiKey(request) {
    const headerName = process.env.PLAYSTORE_API_KEY_HEADER || 'x-api-key';
    const fromHeader = request.headers.get(headerName);
    if (fromHeader) return fromHeader;

    try {
        const url = new URL(request.url);
        return url.searchParams.get('key');
    } catch {
        return null;
    }
}

function ensureAuthorized(request) {
    const expected = process.env.PLAYSTORE_API_KEY;
    if (!expected) return null;

    const provided = getProvidedApiKey(request);
    if (!provided || provided !== expected) {
        return NextResponse.json(
            {
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Invalid or missing API key.' },
            },
            { status: 401 }
        );
    }

    return null;
}

function calculateBuildNumber(version, buildPrefix) {
    if (!version) return '';

    // Supports "2.8.6" and "release-0.3.8" (extracts first X.Y(.Z) sequence)
    const match = String(version).match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!match) return '';

    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    const patch = parseInt(match[3] || '0', 10);

    // Keep consistent with UI formula in src/app/page.js
    return String((buildPrefix * 1000) + (major * 1000) + (minor * 10) + patch);
}

async function runSync() {
    const scraper = getDefaultScraper();
    const client = await clientPromise;
    const db = client.db();

    const results = [];

    for (const target of TARGETS) {
        const startedAt = new Date().toISOString();

        try {
            const versionInfo = await scraper.refreshVersion(target.packageId);
            const storeVersion = versionInfo?.version;

            if (!storeVersion || storeVersion === 'Unknown') {
                results.push({
                    ...target,
                    startedAt,
                    status: 'skipped',
                    reason: 'unknown_version',
                    storeVersion: storeVersion || null,
                });
                continue;
            }

            const build = calculateBuildNumber(storeVersion, target.buildPrefix);
            if (!build) {
                results.push({
                    ...target,
                    startedAt,
                    status: 'skipped',
                    reason: 'unparseable_version',
                    storeVersion,
                });
                continue;
            }

            const environment = 'production';
            const existing = await db.collection('releases').findOne({
                app_id: target.app_id,
                environment,
            });

            if (existing?.version === storeVersion) {
                results.push({
                    ...target,
                    startedAt,
                    status: 'unchanged',
                    storeVersion,
                    build,
                    previousVersion: existing.version,
                });
                continue;
            }

            const updateDoc = {
                version: storeVersion,
                build,
                environment,
                notes: 'Auto-synced from Play Store',
                is_breaking: false,
                released_at: new Date(),
            };

            if (existing) {
                await db.collection('releases').updateOne(
                    { _id: existing._id },
                    { $set: updateDoc }
                );
                results.push({
                    ...target,
                    startedAt,
                    status: 'updated',
                    storeVersion,
                    build,
                    previousVersion: existing.version,
                });
            } else {
                const insertDoc = {
                    app_id: target.app_id,
                    ...updateDoc,
                    created_at: new Date(),
                };
                const insertRes = await db.collection('releases').insertOne(insertDoc);
                results.push({
                    ...target,
                    startedAt,
                    status: 'inserted',
                    storeVersion,
                    build,
                    _id: String(insertRes.insertedId),
                });
            }
        } catch (error) {
            results.push({
                ...target,
                startedAt,
                status: 'error',
                error: error?.message || String(error),
            });
        }
    }

    const updatedCount = results.filter(r => r.status === 'updated' || r.status === 'inserted').length;

    return {
        checkedAt: new Date().toISOString(),
        updatedCount,
        results,
    };
}

export async function GET(request) {
    const authResponse = ensureAuthorized(request);
    if (authResponse) return authResponse;

    const data = await runSync();
    return NextResponse.json({ success: true, data });
}

export async function POST(request) {
    const authResponse = ensureAuthorized(request);
    if (authResponse) return authResponse;

    const data = await runSync();
    return NextResponse.json({ success: true, data });
}

export async function OPTIONS(request) {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': `Content-Type, ${process.env.PLAYSTORE_API_KEY_HEADER || 'x-api-key'}`,
            'Access-Control-Max-Age': '86400',
        },
    });
}
