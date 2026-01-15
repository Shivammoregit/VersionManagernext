async function findVersionInPlayStore() {
    const appId = 'com.petyosa.petapp';
    const url = `https://play.google.com/store/apps/details?id=${appId}&hl=en&gl=us`;

    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } });
        const html = await response.text();

        console.log('--- ANALYSIS START ---');

        // Strategy: Find all AF_initDataCallback calls
        const blobs = html.matchAll(/AF_initDataCallback\(\{.*?key: '(.*?)',.*?data:(.*?),/gs);
        let foundVersion = null;

        for (const blob of blobs) {
            const key = blob[1];
            const dataStr = blob[2];

            // The version is usually in ds:5 (metadata)
            if (key === 'ds:5') {
                console.log('Inspecting blob ds:5...');
                // Version is often deep in nested arrays. 
                // Let's look for anything that looks like a version string "x.y.z"
                const matches = dataStr.matchAll(/"(\d+\.\d+\.\d+)"/g);
                for (const m of matches) {
                    console.log(`  Candidate in ds:5: ${m[1]}`);
                    foundVersion = m[1];
                }
            } else {
                // Check other blobs just in case
                const matches = dataStr.matchAll(/"(\d+\.\d+\.\d+)"/g);
                for (const m of matches) {
                    // Filter out some common non-version strings if necessary
                    if (m[1].length > 2 && m[1].length < 15) {
                        console.log(`  Candidate in ${key}: ${m[1]}`);
                    }
                }
            }
        }

        console.log('--- ANALYSIS END ---');

    } catch (e) {
        console.error(e);
    }
}

findVersionInPlayStore();
