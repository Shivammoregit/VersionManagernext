import clientPromise from '@/lib/mongodb';
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

export async function PUT(request, { params }) {
    try {
        const client = await clientPromise;
        const db = client.db();
        const body = await request.json();
        const { id } = await params;

        const { version, build, notes, is_breaking } = body;

        const existing = await db.collection('releases').findOne({ _id: new ObjectId(id) });
        if (!existing) {
            return NextResponse.json({ error: 'Release not found' }, { status: 404 });
        }

        const shouldBumpReleaseDate = existing.version !== version || existing.build !== build;
        const updateDoc = {
            version,
            build,
            notes: notes || '',
            is_breaking: is_breaking || false,
            ...(shouldBumpReleaseDate ? { released_at: new Date() } : {}),
        };

        const result = await db.collection('releases').updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    ...updateDoc,
                }
            }
        );

        if (result.matchedCount === 0) {
            return NextResponse.json({ error: 'Release not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Updated' });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const client = await clientPromise;
        const db = client.db();
        const { id } = await params;

        const result = await db.collection('releases').deleteOne({
            _id: new ObjectId(id)
        });

        if (result.deletedCount === 0) {
            return NextResponse.json({ error: 'Release not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Deleted successfully' });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
