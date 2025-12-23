import clientPromise from '@/lib/mongodb';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const client = await clientPromise;
        const db = client.db();
        const releases = await db.collection('releases')
            .find({})
            .sort({ released_at: -1 })
            .toArray();
        return NextResponse.json(releases);
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const client = await clientPromise;
        const db = client.db();
        const body = await request.json();
        
        const { app_id, version, build, environment, notes, is_breaking } = body;
        
        if (!app_id || !version || !build || !environment) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Logic from server/index.js: Update existing or Create new
        const existing = await db.collection('releases').findOne({ app_id, environment });
        
        if (existing) {
            await db.collection('releases').updateOne(
                { _id: existing._id },
                { 
                    $set: { 
                        version, 
                        build, 
                        notes: notes || '', 
                        is_breaking: is_breaking || false,
                        released_at: new Date()
                    } 
                }
            );
            return NextResponse.json({ message: 'Updated successfully' });
        } else {
            const newRelease = {
                app_id,
                version,
                build,
                environment,
                notes: notes || '',
                is_breaking: is_breaking || false,
                released_at: new Date(),
                created_at: new Date()
            };
            const result = await db.collection('releases').insertOne(newRelease);
            return NextResponse.json({ ...newRelease, _id: result.insertedId }, { status: 201 });
        }
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}