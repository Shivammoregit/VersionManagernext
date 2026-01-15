import gplay from 'google-play-scraper';

async function testSearch() {
    const term = 'PetYosa';
    console.log(`Searching for: ${term}`);
    try {
        const results = await gplay.search({
            term: term,
            num: 5,
            country: 'us'
        });
        console.log('Search Results:', JSON.stringify(results, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testSearch();
