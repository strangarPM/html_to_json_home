import { launchChromium } from '../utils/puppeteerLaunch.js';
import { attachPuppeteerLogging } from '../utils/attachPuppeteerLogging.js';
import path from 'path';
import fs from 'fs';

const screenshotsDir = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
}

function generateFileName(extension = 'png') {
    const timestamp = Date.now();
    return `fullpage_${timestamp}.${extension}`;
}

function buildPublicUrl(fileName, req) {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${protocol}://${host}/screenshots/${fileName}`;
}

function elementsToVisualStack(containerSelectorInner) {
    function toHexColorEval(colorString) {
        if (colorString.startsWith('#')) {
            if (colorString.length === 4) {
                return '#' + colorString[1] + colorString[1] + colorString[2] + colorString[2] + colorString[3] + colorString[3];
            }
            return colorString;
        }
        const rgbValues = colorString.match(/\d+/g);
        if (rgbValues && rgbValues.length >= 3) {
            const r = parseInt(rgbValues[0]);
            const g = parseInt(rgbValues[1]);
            const b = parseInt(rgbValues[2]);
            const toHex = (c) => ('0' + c.toString(16)).slice(-2);
            return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }
        return colorString;
    }

    function getEffectiveZIndex(element) {
        let el = element;
        while (el && el !== document.body) {
            const style = window.getComputedStyle(el);
            if (style.position !== 'static' && style.zIndex !== 'auto') {
                return style.zIndex;
            }
            el = el.parentElement;
        }
        return '0';
    }

    function getVisualLayerRank(targetEl, rect) {
        const samplePoints = [];
        const inset = 1;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        samplePoints.push([cx, cy]);
        samplePoints.push([rect.left + inset, rect.top + inset]);
        samplePoints.push([rect.right - inset, rect.top + inset]);
        samplePoints.push([rect.left + inset, rect.bottom - inset]);
        samplePoints.push([rect.right - inset, rect.bottom - inset]);

        let bestRank = 0;
        for (const [x, y] of samplePoints) {
            if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
            const stack = document.elementsFromPoint(x, y);
            const idx = stack.indexOf(targetEl);
            if (idx !== -1) {
                const rank = stack.length - idx;
                if (rank > bestRank) bestRank = rank;
            }
        }
        if (bestRank > 0) return bestRank;
        const z = window.getComputedStyle(targetEl).zIndex;
        const numericZ = isNaN(parseFloat(z)) ? 0 : parseFloat(z);
        return numericZ;
    }

    const container = document.querySelector(containerSelectorInner) || document.body;
    const containerRect = container.getBoundingClientRect();
    const all = Array.from(container.querySelectorAll('*'));
    const items = [];
    for (const el of all) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const rank = getVisualLayerRank(el, rect);
        items.push({
            tag: el.tagName.toLowerCase(),
            xPos: Math.round(rect.x - containerRect.x),
            yPos: Math.round(rect.y - containerRect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            layer_index: rank,
            css_z_index: style.zIndex === 'auto' ? getEffectiveZIndex(el) : style.zIndex,
            color: style.color ? toHexColorEval(style.color) : undefined,
            text: el.tagName.toLowerCase() === 'span' ? (el.textContent || '').trim() : undefined,
        });
    }
    // Sort descending by layer_index (topmost first)
    items.sort((a, b) => (b.layer_index || 0) - (a.layer_index || 0));
    return items;
}

export const renderAndDescribe = async (req, res) => {
    const { htmlContent, cssContent = '', viewport, fullPage = true } = req.body;
    if (!htmlContent) {
        return res.status(400).json({ error: 'htmlContent is required' });
    }

    // If viewport not provided, we'll auto-size to content after load
    const providedVp = viewport || null;
    const vp = {
        width: Number.parseInt((providedVp?.width ?? 1200), 10),
        height: Number.parseInt((providedVp?.height ?? 800), 10),
        deviceScaleFactor: Number.isFinite(providedVp?.deviceScaleFactor) ? providedVp.deviceScaleFactor : 1,
        isMobile: Boolean(providedVp?.isMobile) || false,
        hasTouch: Boolean(providedVp?.hasTouch) || false,
        isLandscape: Boolean(providedVp?.isLandscape) || false
    };
    if (!Number.isFinite(vp.width) || vp.width <= 0) vp.width = 1200;
    if (!Number.isFinite(vp.height) || vp.height <= 0) vp.height = 800;

    let browser;
    const outputFileName = generateFileName();
    const outputPath = path.join(screenshotsDir, outputFileName);
    try {
        browser = await launchChromium();
        const page = await browser.newPage();
        attachPuppeteerLogging(page, 'render:root');
        await page.setViewport(vp);

        await page.setContent(`
            <html>
                <head>
                    <style>
                        html, body { margin: 0; padding: 0; }
                        #__root { display: inline-block; }
                        ${cssContent}
                    </style>
                </head>
                <body>
                    <div id="__root">${htmlContent}</div>
                </body>
            </html>
        `, { waitUntil: 'networkidle0' });

        // Auto-size viewport to content if caller didn't provide one
        if (!providedVp) {
            // Wait until size stabilizes briefly to avoid late-loading fonts/layout shifts
            await page.waitForFunction(() => {
                const el = document.querySelector('#__root');
                if (!el) return false;
                const r1 = el.getBoundingClientRect();
                // store last size on window to compare next tick
                const prev = window.__root_last_size || { w: 0, h: 0, t: 0 };
                const w = Math.ceil(r1.width);
                const h = Math.ceil(r1.height);
                const now = Date.now();
                if (prev.w === w && prev.h === h && (now - prev.t) > 80) return true;
                window.__root_last_size = { w, h, t: now };
                return false;
            }, { polling: 'mutation', timeout: 3000 }).catch(() => {});

            const size = await page.$eval('#__root', (el) => {
                const r = el.getBoundingClientRect();
                return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
            });
            const maxDim = 4000; // prevent extreme sizes
            const autoVp = {
                width: Math.max(1, Math.min(size.width, maxDim)),
                height: Math.max(1, Math.min(size.height, maxDim))
            };
            await page.setViewport({
                width: autoVp.width,
                height: autoVp.height,
                deviceScaleFactor: vp.deviceScaleFactor,
                isMobile: vp.isMobile,
                hasTouch: vp.hasTouch,
                isLandscape: vp.isLandscape
            });
            // give layout a moment to settle after resize
            await new Promise((resolve) => setTimeout(resolve, 50));
            vp.width = autoVp.width;
            vp.height = autoVp.height;
        }

        // Capture screenshot of just the poster container so size matches content exactly
        const rootHandle = await page.$('#__root');
        if (!rootHandle) {
            await browser.close();
            return res.status(400).json({ error: 'Root container not found for screenshot' });
        }
        await rootHandle.screenshot({ path: outputPath, omitBackground: true });

        // Collect visual stack
        const visualStack = await page.evaluate(elementsToVisualStack, '#__root');

        await browser.close();

        return res.json({
            message: 'Rendered successfully',
            screenshot_url: buildPublicUrl(outputFileName, req),
            viewport: vp,
            visual_stack: visualStack
        });
    } catch (error) {
        if (browser) {
            try { await browser.close(); } catch (_) {}
        }
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
};


