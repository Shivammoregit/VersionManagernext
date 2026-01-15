async function deepScan() {
    const appId = 'com.petyosa.vetapp';
    const url = `https://play.google.com/store/apps/details?id=${appId}&hl=en&gl=us`;

    console.log(`Scanning VetYosa Android: ${url}`);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const html = await response.text();

        // Let's find ALL strings that look like a version number (x.y.z)
        const versionPatterns = html.match(/"\d+\.\d+\.\d+"/g) || [];
        console.log('--- Found Potential Version Strings ---');
        const unique = [...new Set(versionPatterns)];
        unique.forEach(v => console.log(v));

        // Let's also look for date strings nearby
        const index = html.indexOf('Updated on');
        if (index !== -1) {
            console.log('\n--- Context around "Updated on" ---');
            console.log(html.substring(index - 100, index + 500));
        }

        // Look for common version labels in the page
        const labels = ['Version', 'Current Version', 'Installs', 'Requires Android'];
        labels.forEach(label => {
            const idx = html.indexOf(label);
            if (idx !== -1) {
                console.log(`\n--- Context around "${label}" ---`);
                console.log(html.substring(idx, idx + 200));
            }
        });

    } catch (e) {
        console.error(e);
    }
}

deepScan();
