import clientPromise from '@/lib/mongodb';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const client = await clientPromise;
        const db = client.db(); // Uses default DB from connection string
        const { passkey } = await request.json();

        // Check/Init default passkey logic from server/index.js
        const setting = await db.collection('settings').findOne({ key: 'passkey' });
        
        if (!setting) {
             // Create default if missing
             await db.collection('settings').insertOne({ 
                key: 'passkey', 
                value: 'admin123',
                created_at: new Date()
             });
             if (passkey === 'admin123') return NextResponse.json({ success: true });
        }

        if (setting && passkey === setting.value) {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ success: false, error: 'Invalid passkey' }, { status: 401 });
        }
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}