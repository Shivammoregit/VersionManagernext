async function fetchPlayStoreVersion() {
    const appId = 'com.petyosa.petapp';
    const url = `https://play.google.com/store/apps/details?id=${appId}&hl=en&gl=us`;

    console.log(`Fetching: ${url}`);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        console.log(`HTML Length: ${html.length}`);

        // Strategy 1: Look for "version" in AF_initDataCallback
        // Versions are often in a large array. We look for the pattern that looks like a version.
        // Usually something like ["1.2.3"] or similar.

        // Let's look for common version patterns in the scripts
        const versionMatch = html.match(/\["(\d+\.\d+\.\d+)"\]/);
        if (versionMatch) {
            console.log(`Found Version Hint (Strategy 1): ${versionMatch[1]}`);
        }

        // Strategy 2: Look for the text nearby "Version"
        const versionLabelMatch = html.match(/Version.*?>(.*?)<\/div>/s);
        if (versionLabelMatch) {
            console.log(`Found Version Hint (Strategy 2): ${versionLabelMatch[1]}`);
        }

        // Strategy 3: Look for script blobs
        const scriptMatches = html.matchAll(/AF_initDataCallback\(\{.*?data:(.*?),/gs);
        for (const match of scriptMatches) {
            const dataStr = match[1];
            // Very experimental: hunt for strings that look like versions
            const subMatch = dataStr.match(/"(\d+\.\d+\.\d+)"/);
            if (subMatch) {
                console.log(`Found Version Hint (Strategy 3): ${subMatch[1]}`);
            }
        }

        // If nothing works, just dump a slice of HTML to see what we're dealing with
        if (!versionMatch && !versionLabelMatch) {
            console.log("No version found. Sample HTML around 'About this app':");
            const index = html.indexOf('About this app');
            if (index !== -1) {
                console.log(html.substring(index, index + 1000));
            } else {
                console.log("Could not even find 'About this app'");
            }
        }

    } catch (error) {
        console.error('Fetch Error:', error.message);
    }
}

fetchPlayStoreVersion();
