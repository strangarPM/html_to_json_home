import path from 'path';
import fs from 'fs';
import { launchChromium } from './puppeteerLaunch.js';
import { attachPuppeteerLogging } from './attachPuppeteerLogging.js';

const screenshotsDir = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
}

function buildPublicUrl(fileName, req) {
    const protocol = req?.headers?.['x-forwarded-proto'] || 'http';
    const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'localhost:8050';
    return `${protocol}://${host}/screenshots/${fileName}`;
}

export async function captureDivHtml({ htmlContent, cssContent = '', selector = 'div' }, reqForUrl) {
    if (!htmlContent) {
        throw new Error('htmlContent is required');
    }

    const fileName = `screenshot_${Date.now()}_${Math.random().toString(36).slice(2)}.png`;
    const outputPath = path.join(screenshotsDir, fileName);

    let browser;
    try {
        browser = await launchChromium();
        const page = await browser.newPage();
        attachPuppeteerLogging(page, 'captureDivHtml');

        await page.setContent(`
            <html>
                <head>
                    <style>${cssContent}</style>
                </head>
                <body>
                    ${htmlContent}
                </body>
            </html>
        `, { waitUntil: 'networkidle0' });

        const element = await page.$(selector);
        if (!element) {
            throw new Error(`Element with selector "${selector}" not found.`);
        }

        await element.screenshot({ path: outputPath, omitBackground: true });
        await browser.close();

        return {
            filePath: outputPath,
            url: buildPublicUrl(fileName, reqForUrl)
        };
    } catch (e) {
        if (browser) {
            try { await browser.close(); } catch {}
        }
        throw e;
    }
}

