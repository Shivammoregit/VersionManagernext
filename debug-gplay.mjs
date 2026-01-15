import gplay from 'google-play-scraper';

async function debugScraper() {
    const appId = 'com.petyosa.petapp';
    console.log(`Debugging scraper for: ${appId}`);
    try {
        const result = await gplay.app({
            appId: appId,
            lang: 'en',
            country: 'us'
        });
        console.log('Success:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error Stack:', error.stack);
        console.error('Error Message:', error.message);
    }
}

debugScraper();
