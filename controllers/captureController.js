import dotenv from 'dotenv';

dotenv.config(); // Load environment variables from .env file
import {launchChromium} from '../utils/puppeteerLaunch.js';
import logger from '../utils/logger.js';
import {attachPuppeteerLogging} from '../utils/attachPuppeteerLogging.js';
import path from 'path';
import fs from 'fs';

const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 8050;

const screenshotsDir = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
}

function generateFileName(extension = 'png') {
    const timestamp = Date.now();
    return `screenshot_${timestamp}.${extension}`;
}

export const captureDiv = async (req, res) => {
    const {htmlContent, cssContent = '', selector = 'div'} = req.body;
    if (!htmlContent) {
        return res.status(400).json({error: 'htmlContent is required'});
    }

    const outputFileName = generateFileName();
    const outputPath = path.join(screenshotsDir, outputFileName);
    // Correctly construct the URL relative to the server root
    const imageUrl = `http://${HOST}:${PORT}/screenshots/${outputFileName}`;

    try {
        // Use shared launcher that auto-detects Chromium
        const browser = await launchChromium();
        const page = await browser.newPage();
        attachPuppeteerLogging(page, 'capture:root');

        await page.setContent(`
            <html>
                <head>
                    <style>${cssContent}</style>
                </head>
                <body>
                    ${htmlContent}
                </body>
            </html>
        `);

        const element = await page.$(selector);
        // const element = await page.waitForSelector('div');
        if (!element) {
            await browser.close();
            return res.status(404).json({error: `Element with selector \"${selector}\" not found.`});
        }
        await element.screenshot({path: outputPath, omitBackground: true});
        await browser.close();

        return res.json({
            message: 'Image captured successfully',
            url: imageUrl
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({error: error.message});
    }
};