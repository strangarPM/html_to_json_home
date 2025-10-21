import { launchChromium } from '../utils/puppeteerLaunch.js';
import { captureDivHtml } from '../utils/captureDivHtml.js';
import logger from '../utils/logger.js';
import { attachPuppeteerLogging } from '../utils/attachPuppeteerLogging.js';
import path from 'path';
import fs from 'fs';

const screenshotsDir = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
}

function toHexColor(colorString) {
    if (colorString.startsWith('#')) {
        if (colorString.length === 4) {
            return '#' + colorString[1] + colorString[1] + colorString[2] + colorString[2] + colorString[3] + colorString[3];
        }
        return colorString;
    }
    // rgb/rgba(r,g,b[,a]) -> hex
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

function getAlignmentNumberFromWord(alignment) {
    if (alignment === 'left') return 1;
    if (alignment === 'center') return 2;
    if (alignment === 'right') return 3;
    return 1;
}

function buildPublicUrl(fileName, req) {
    // Prefer full external hostname if behind proxy; fall back to host header
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${protocol}://${host}/screenshots/${fileName}`;
}

export const analyzeHtml = async (req, res) => {
    const { htmlContent, cssContent = '', viewport = { width: 1200, height: 800 } } = req.body;

    if (!htmlContent) {
        return res.status(400).json({ error: 'htmlContent is required' });
    }

    // sanitize viewport
    const vp = {
        width: Number.parseInt((viewport?.width ?? 1200), 10),
        height: Number.parseInt((viewport?.height ?? 800), 10),
        deviceScaleFactor: Number.isFinite(viewport?.deviceScaleFactor) ? viewport.deviceScaleFactor : 1,
        isMobile: Boolean(viewport?.isMobile) || false,
        hasTouch: Boolean(viewport?.hasTouch) || false,
        isLandscape: Boolean(viewport?.isLandscape) || false
    };
    if (!Number.isFinite(vp.width) || vp.width <= 0) vp.width = 1200;
    if (!Number.isFinite(vp.height) || vp.height <= 0) vp.height = 800;

    let browser;
    try {
        browser = await launchChromium();
        const page = await browser.newPage();
        attachPuppeteerLogging(page, 'analyze:root');
        await page.setViewport(vp);

        await page.setContent(`
            <html>
                <head>
                    <style>${cssContent}</style>
                </head>
                <body>
                    <div id="__root">${htmlContent}</div>
                </body>
            </html>
        `, { waitUntil: 'networkidle0' });

        // Ensure a single container to evaluate within
        const containerSelector = '#__root';
        const containerHandle = await page.$(containerSelector);
        if (!containerHandle) {
            await browser.close();
            return res.status(400).json({ error: 'Root container not found' });
        }

        // Extract text spans similar to extractLineBasedInfo in browser script
        const textJson = await page.evaluate((containerSelectorInner) => {
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

            function getAlignmentNumberFromWordEval(alignment) {
                if (alignment === 'left') return 1;
                if (alignment === 'center') return 2;
                if (alignment === 'right') return 3;
                return 1;
            }

            const container = document.querySelector(containerSelectorInner);
            const containerRect = container.getBoundingClientRect();
            const spans = container.querySelectorAll('span');
            const results = [];
            spans.forEach(span => {
                const text = span.textContent.trim();
                if (!text) return;
                const rect = span.getBoundingClientRect();
                const style = window.getComputedStyle(span);
                let finalText = text;
                if (style.textTransform && style.textTransform !== 'none') {
                    const transform = style.textTransform.toLowerCase();
                    if (transform === 'uppercase') finalText = finalText.toUpperCase();
                    else if (transform === 'lowercase') finalText = finalText.toLowerCase();
                    else if (transform === 'capitalize') finalText = finalText.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
                }
                results.push({
                    xPos: Math.round(rect.x - containerRect.x),
                    yPos: Math.round(rect.y - containerRect.y),
                    color: toHexColorEval(style.color),
                    text: finalText,
                    size: style.fontSize.replace('px',''),
                    fontStyle: style.fontStyle,
                    fontWeight: style.fontWeight,
                    lineHeight: 1,
                    alignment: getAlignmentNumberFromWordEval(style.textAlign),
                    angle: 0,
                    charSpacing: parseFloat(style.letterSpacing) || 0,
                    stroke: null,
                    strokeWidth: 0,
                    shadowColor: 'transparent',
                    shadowRadius: 0,
                    shadowOffsetX: 0,
                    shadowOffsetY: 0,
                    pak_index: 0,
                    is_brand_name: 0,
                    is_company_name: 0,
                    palette_color_id: 0,
                    font_family: style.fontFamily,
                    google_fonts_link: '',
                    maxWidth: Math.round(rect.width),
                    maxHeight: Math.round(rect.height),
                    opacity: Math.round(parseFloat(style.opacity || '1') * 100),
                    textShadow: style.textShadow
                });
            });
            return results;
        }, containerSelector);

        // Find visually significant divs and screenshot them like getStyleJson
        const divInfos = await page.evaluate((containerSelectorInner) => {
            function hasVisuallySignificantStyle(div) {
                const style = window.getComputedStyle(div);
                const hasClipPath = style.clipPath && style.clipPath !== 'none';
                const bgColor = style.backgroundColor;
                const hasBackgroundColor = bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent';
                const bgImage = style.backgroundImage;
                const hasBackgroundImage = bgImage && bgImage !== 'none';
                const hasBorder = (style.borderWidth && style.borderWidth !== '0px') && (style.borderStyle && style.borderStyle !== 'none');
                const hasBoxShadow = style.boxShadow && style.boxShadow !== 'none';
                return hasClipPath || hasBackgroundColor || hasBackgroundImage || hasBorder || hasBoxShadow;
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

            const container = document.querySelector(containerSelectorInner);
            const containerRect = container.getBoundingClientRect();
            const divs = Array.from(container.getElementsByTagName('div'));
            const processed = [];
            const infos = [];

            const isDescendant = (el, ancestors) => ancestors.some(a => a !== el && a.contains(el));

            for (let i = 0; i < divs.length; i++) {
                const div = divs[i];
                if (isDescendant(div, processed)) continue;
                if (!hasVisuallySignificantStyle(div)) continue;

                const rect = div.getBoundingClientRect();
                const style = window.getComputedStyle(div);
                const divWidth = Number(rect.width.toFixed(2));
                const divHeight = Number(rect.height.toFixed(2));
                const divX = Number((rect.x - containerRect.x).toFixed(2));
                const divY = Number((rect.y - containerRect.y).toFixed(2));
                const zIndex = style.zIndex === 'auto' ? getEffectiveZIndex(div) : style.zIndex;
                const hasSingleImage = div.children.length === 1 && div.children[0].tagName === 'IMG';

                infos.push({
                    index: i,
                    selector: null, // we will use bounding box, not selector-specific
                    rect: { x: divX, y: divY, width: divWidth, height: divHeight },
                    zIndex,
                    outerHTML: hasSingleImage ? div.cloneNode(true).outerHTML : div.cloneNode(false).outerHTML
                });
                processed.push(div);
            }
            return infos;
        }, containerSelector);

        // For each eligible div, call the same screenshot flow your webapp used (capture-div equivalent)
        const stickerJson = [];
        for (const info of divInfos) {
            const { url } = await captureDivHtml({ htmlContent: info.outerHTML, cssContent, selector: 'div' }, req);
            stickerJson.push({
                xPos: info.rect.x,
                yPos: info.rect.y,
                sticker_type: 1,
                width: info.rect.width,
                height: info.rect.height,
                sticker_image: url,
                angle: 0,
                is_round: 0,
                pak_index: info.zIndex,
                svg_properties: { colors: [] },
                palette_color_id: 1
            });
        }

        await browser.close();

        return res.json({
            template_json: {
                text_json: textJson,
                sticker_json: stickerJson
            }
        });
    } catch (error) {
        if (browser) {
            try { await browser.close(); } catch (_) {}
        }
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
};


