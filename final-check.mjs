async function checkApp(appId) {
    const url = `https://play.google.com/store/apps/details?id=${appId}&hl=en&gl=us`;
    console.log(`Checking ${appId}...`);
    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await response.text();

        // Find version pattern ["x.y.z"]
        const vMatch = html.match(/\[\"(\d+\.\d+\.\d+)\"\]/);
        const version = vMatch ? vMatch[1] : 'Not Found';

        // Find update date pattern like "Jan 10, 2024"
        const dMatch = html.match(/[A-Z][a-z]{2}\s\d{1,2},\s202\d/);
        const date = dMatch ? dMatch[0] : 'Not Found';

        console.log(`  Version: ${version}`);
        console.log(`  Updated: ${date}`);
        console.log('------------------');
    } catch (e) {
        console.error(`Error checking ${appId}: ${e.message}`);
    }
}

async function run() {
    await checkApp('com.petyosa.petapp');
    await checkApp('com.petyosa.vetapp');
}

run();
