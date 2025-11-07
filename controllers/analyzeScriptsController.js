import fs from 'fs';
import path from 'path';
import { launchChromium } from '../utils/puppeteerLaunch.js';
import logger from '../utils/logger.js';
import { attachPuppeteerLogging } from '../utils/attachPuppeteerLogging.js';

function getServerOrigin(req) {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${protocol}://${host}`;
}

export const analyzeViaScripts = async (req, res) => {
    const { htmlContent, cssContent = '', viewport = { width: 1200, height: 800 } } = req.body;
    if (!htmlContent) {
        return res.status(400).json({ error: 'htmlContent is required' });
    }

    // Load the client-side core scripts
    const textScriptPath = path.join(process.cwd(), 'convertHTMLTextToAppJson.js');
    const styleScriptPath = path.join(process.cwd(), 'convertHTMLStyleToAppJson.js');
    let textScript = fs.readFileSync(textScriptPath, 'utf8');
    let styleScript = fs.readFileSync(styleScriptPath, 'utf8');

    // Rewrite the capture-div absolute URL in the style script to current server origin
    const origin = getServerOrigin(req);
    styleScript = styleScript.replace(/https?:\/\/[^\s'"`]+\/capture-div/g, `${origin}/capture-div`);

    let browser;
    try {
        browser = await launchChromium();
        const page = await browser.newPage();
        attachPuppeteerLogging(page, 'analyze-scripts:root');
        await page.setViewport(viewport);

        // Minimal DOM required by your scripts
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
        // Ensure absolute capture URL is available in the page context
        await page.addScriptTag({ content: `window.CAPTURE_DIV_URL = '${origin}/capture-div';` });

        // Inject scripts
        await page.addScriptTag({ content: textScript });
        await page.addScriptTag({ content: styleScript });

        // Run the same flow as in your blade page to produce final template JSON
        const templateJson = await page.evaluate(async (html) => {
            const template_json = {
                curved_text_json: [],
                frame_image_sticker_json: [],
                frame_json: { frame_image: '', frame_color: '' },
                background_json: { background_image: '', background_color: '', is_brand_background: 1, palette_color_id: 3 },
                sample_image: 'sample.jpg',
                height: 800,
                width: 650,
                display_height: 800,
                display_width: 650,
                display_size_type: 'px',
                page_id: 1,
                is_featured: 0,
                is_portrait: 1
            };

            const renderArea = document.getElementById('renderArea');
            renderArea.innerHTML = html;
            const mainContainer = renderArea.querySelector('div');
            if (!mainContainer) throw new Error('Main container <div> not found inside renderArea');

            // --- CRITICAL FIX: WAIT FOR ALL FONTS TO LOAD ---
            // This ensures the browser has rendered the text with the final font-family
            // before measuring its position and size.
            try {
                // Wait for up to 5 seconds for all fonts to finish loading
                await document.fonts.ready.then(() => {
                    console.log('✅ All fonts have loaded successfully.');
                }).catch(err => {
                    console.error('⚠️ Font loading timeout or error:', err);
                });
            } catch (e) {
                // document.fonts.ready might not be available or may fail silently in some contexts.
                // Log and continue, as the coordinates will be the best available.
                console.warn('Could not wait for document.fonts.ready:', e);
            }


            const rect = mainContainer.getBoundingClientRect();
            template_json.height = Math.round(rect.height);
            template_json.width = Math.round(rect.width);
            template_json.display_height = template_json.height;
            template_json.display_width = template_json.width;

            // text, stickers, and SVGs
            // extractLineBasedInfo, getStyleJson, and getSvgJson are provided by injected scripts
            const text_json = await extractLineBasedInfo(mainContainer);
            const sticker_json = await getStyleJson(renderArea);
            const svg_json = await getSvgJson(renderArea);

            template_json.text_json = text_json;
            template_json.sticker_json = sticker_json;
            template_json.svg_json = svg_json;

            // const text_json = await findText(mainContainer);
            // template_json.text_json = text_json;
            return template_json;
        }, htmlContent);

        await browser.close();
        return res.json(templateJson);
    } catch (e) {
        if (browser) {
            try { await browser.close(); } catch {}
        }
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};

