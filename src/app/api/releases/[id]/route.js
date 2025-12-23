import clientPromise from '@/lib/mongodb';
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

export async function PUT(request, { params }) {
    try {
        const client = await clientPromise;
        const db = client.db();
        const body = await request.json();
        const { id } = params;

        const { version, build, notes, is_breaking } = body;
        
        const result = await db.collection('releases').updateOne(
            { _id: new ObjectId(id) },
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
        const { id } = params;

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