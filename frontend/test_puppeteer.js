const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    page.on('console', msg => {
        for (let i = 0; i < msg.args().length; ++i)
            console.log(`${i}: ${msg.args()[i]}`);
        console.log('CONSOLE:', msg.text());
    });
    page.on('requestfailed', request => {
        console.log('REQUEST_FAILED:', request.url(), request.failure().errorText);
    });
    page.on('response', response => {
        if (!response.ok()) {
            console.log('RESPONSE_NOT_OK:', response.url(), response.status());
        }
    });

    try {
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
        console.log('Page loaded');
        // Wait another 5 seconds to ensure everything loads
        await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
        console.error('Error:', e);
    }

    await browser.close();
})();
