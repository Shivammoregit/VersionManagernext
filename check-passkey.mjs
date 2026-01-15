import clientPromise from './src/lib/mongodb.js';

async function checkPasskey() {
    try {
        const client = await clientPromise;
        const db = client.db();
        const setting = await db.collection('settings').findOne({ key: 'passkey' });
        console.log('--- DATABASE PASSKEY CHECK ---');
        if (setting) {
            console.log('Found passkey setting:');
            console.log('Key:', setting.key);
            console.log('Value:', setting.value);
            console.log('Created At:', setting.created_at);
        } else {
            console.log('No passkey setting found in "settings" collection.');
        }
        console.log('------------------------------');
        process.exit(0);
    } catch (e) {
        console.error('Error checking passkey:', e);
        process.exit(1);
    }
}

checkPasskey();
