import fs from 'fs';
import puppeteer from 'puppeteer';

function pathExists(p) {
    try {
        return p && fs.existsSync(p);
    } catch {
        return false;
    }
}

export async function launchChromium(overrides = {}) {
    const candidates = [];

    // 1) Explicit env overrides
    const envPaths = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        process.env.CHROMIUM_PATH,
        process.env.CHROME_PATH,
        process.env.GOOGLE_CHROME_BIN
    ].filter(Boolean);
    candidates.push(...envPaths);

    // 2) Puppeteer's bundled executable (if available)
    try {
        const bundled = puppeteer.executablePath();
        if (bundled) candidates.push(bundled);
    } catch {}

    // 3) Common Linux locations
    candidates.push(
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium'
    );

    let executablePath;
    for (const c of candidates) {
        if (pathExists(c)) {
            executablePath = c;
            break;
        }
    }

    const args = overrides.args || [
        '--disable-setuid-sandbox',
        '--no-sandbox',
        '--single-process',
        '--no-zygote'
    ];

    const launchOptions = {
        headless: overrides.headless !== undefined ? overrides.headless : true,
        args,
    };

    if (executablePath) {
        launchOptions.executablePath = executablePath;
    }

    return puppeteer.launch(launchOptions);
}

