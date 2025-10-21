import fs from 'fs';
import path from 'path';
import { launchChromium } from '../utils/puppeteerLaunch.js';
import logger from '../utils/logger.js';
import { attachPuppeteerLogging } from '../utils/attachPuppeteerLogging.js';
import { generateHtml } from '../utils/gemini.js';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

function getServerOrigin(req) {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${protocol}://${host}`;
}

// Generate a unique filename for the screenshot
function generateUniqueFilename() {
    return `flyer-${crypto.randomBytes(8).toString('hex')}.png`;
}

// Ensure screenshots directory exists
function ensureScreenshotsDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

export const generateFlyer = async (req, res) => {
    const { userInput } = req.body;
    if (!userInput) {
        return res.status(400).json({ error: 'userInput is required' });
    }

    try {
        const htmlContent = await generateHtml(userInput);

        // Now process the generated HTML
        const cssContent = '';
        const viewport = { width: 1200, height: 800 };

        const textScriptPath = path.join(process.cwd(), 'convertHTMLTextToAppJson.js');
        const styleScriptPath = path.join(process.cwd(), 'convertHTMLStyleToAppJson.js');
        let textScript = fs.readFileSync(textScriptPath, 'utf8');
        let styleScript = fs.readFileSync(styleScriptPath, 'utf8');

        const origin = getServerOrigin(req);
        styleScript = styleScript.replace(/https?:\/\/[^\s'"`]+\/capture-div/g, `${origin}/capture-div`);

        let browser;
        try {
            browser = await launchChromium();
            const page = await browser.newPage();
            attachPuppeteerLogging(page, 'generate-flyer:root');
            await page.setViewport(viewport);

            await page.setContent(`
                <!doctype html>
                <html>
                  <head>
                    <meta charset="utf-8" />
                    <base href="${origin}/" />
                    <style>${cssContent}</style>
                  </head>
                  <body>
                    <div id="renderArea"></div>
                    <div id="image-container"></div>
                  </body>
                </html>
            `, { waitUntil: 'networkidle0' });

            await page.addScriptTag({ content: `window.CAPTURE_DIV_URL = '${origin}/capture-div';` });
            await page.addScriptTag({ content: textScript });
            await page.addScriptTag({ content: styleScript });

            const result = await page.evaluate(async (html) => {
                const renderArea = document.getElementById('renderArea');
                renderArea.innerHTML = html;
                const mainContainer = renderArea.querySelector('div');
                if (!mainContainer) throw new Error('Main container <div> not found inside renderArea');

                const rect = mainContainer.getBoundingClientRect();
                const template_json = {
                    curved_text_json: [],
                    frame_image_sticker_json: [],
                    frame_json: { frame_image: '', frame_color: '' },
                    background_json: { background_image: '', background_color: '', is_brand_background: 1, palette_color_id: 3 },
                    sample_image: 'sample.jpg',
                    height: Math.round(rect.height),
                    width: Math.round(rect.width),
                    display_height: Math.round(rect.height),
                    display_width: Math.round(rect.width),
                    display_size_type: 'px',
                    page_id: 1,
                    is_featured: 0,
                    is_portrait: 1
                };

                const text_json = await extractLineBasedInfo(mainContainer);
                const sticker_json = await getStyleJson(renderArea);

                template_json.text_json = text_json;
                template_json.sticker_json = sticker_json;
                
                return { template_json, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
            }, htmlContent);

            const { template_json, rect } = result;

            // Get the screenshots directory path
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const screenshotsDir = path.join(__dirname, '..', 'screenshots');
            
            // Ensure screenshots directory exists
            ensureScreenshotsDir(screenshotsDir);
            
            // Generate unique filename
            const filename = generateUniqueFilename();
            const filepath = path.join(screenshotsDir, filename);

            // Take and save the screenshot
            await page.screenshot({
                clip: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                },
                path: filepath
            });

            await browser.close();
            
            // Return the JSON with image URL instead of base64
            return res.json({
                json: template_json,
                image: `${getServerOrigin(req)}/screenshots/${filename}`
            });

        } catch (e) {
            if (browser) {
                try { await browser.close(); } catch {}
            }
            throw e; // re-throw to be caught by outer catch
        }

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};
