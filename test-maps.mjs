async function testMaps() {
    const appId = 'com.google.android.apps.maps';
    const url = `https://play.google.com/store/apps/details?id=${appId}&hl=en&gl=us`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await response.text();
    const matches = html.matchAll(/\[\"(\d+\.\d+\.\d+)\"\]/g);
    console.log(`Results for ${appId}:`);
    for (const m of matches) {
        console.log(`- Potential Version: ${m[1]}`);
    }
}

testMaps();
