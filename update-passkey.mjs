import clientPromise from './src/lib/mongodb.js';

async function updatePasskey() {
    try {
        const client = await clientPromise;
        const db = client.db();
        await db.collection('settings').updateOne(
            { key: 'passkey' },
            { $set: { value: 'admin123' } }
        );
        console.log('Passkey successfully updated to "admin123"');
        process.exit(0);
    } catch (e) {
        console.error('Error updating passkey:', e);
        process.exit(1);
    }
}

updatePasskey();
