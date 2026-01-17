import { __test__ } from '@/lib/playstore/scraper.js';

test('extractWhatsNewFromHtml prefers release notes over address/contact strings', () => {
    const html = `
        <html><body>
          <script>
            AF_initDataCallback({key: 'ds:5', data: [
              "Developer contact",
              "Address",
              "123 Street, Some City, 411001",
              "What\\u2019s New",
              "What\\u2019s New:\\nBetter caching: App feels faster now!\\nImproved app performance\\nUI refinements and design fixes\\nFixed issues with login\\nPet addition bugfix"
            ], sideChannel: {}});
          </script>
        </body></html>
    `;

    const extracted = __test__.extractWhatsNewFromHtml(html);

    expect(extracted).toContain('Better caching');
    expect(extracted).toContain('Improved app performance');
    expect(extracted).not.toMatch(/street|address|developer contact/i);
});

test('extractWhatsNewFromHtml does not return opaque base64-like tokens', () => {
    const html = `
        <html><body>
          <script>
            AF_initDataCallback({key: 'ds:5', data: [
              "What\\u2019s New",
              "qgJHGkUIABIaChgKEmNvbS5wZXR5b3NhLnBldGFwcBABGANKEwjE19jSu5KSAxUat6wCHeoyAj36AQ8KDQgAEgkKBWVuLVVTEAA=",
              "What\\u2019s New:\\nBug fixes and performance improvements."
            ], sideChannel: {}});
          </script>
        </body></html>
    `;

    const extracted = __test__.extractWhatsNewFromHtml(html);
    expect(extracted).toMatch(/Bug fixes|performance/i);
    expect(extracted).not.toMatch(/^[A-Za-z0-9+/_=-]{60,}$/);
});

test('extractWhatsNewFromHtml extracts Play Store ds:5 field 145 notes', () => {
    const html = `
        <html><body>
          <script>
            AF_initDataCallback({key: 'ds:5', data: [{"145":[null,[null,"What\\u2019s New:\\u003cbr\\u003eBetter caching\\u003cbr\\u003ePet addition bugfix"]]}], sideChannel: {}});
          </script>
        </body></html>
    `;

    const extracted = __test__.extractWhatsNewFromHtml(html);
    expect(extracted).toContain('Better caching');
    expect(extracted).toContain('Pet addition bugfix');
    expect(extracted).not.toMatch(/What[’']s New/i);
});
