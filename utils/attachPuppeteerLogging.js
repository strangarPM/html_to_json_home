import logger from './logger.js';

export function attachPuppeteerLogging(page, context = 'page') {
    if (!page || typeof page.on !== 'function') return;

    page.on('console', async msg => {
        try {
            const handles = msg.args?.() || [];
            const serialized = [];
            for (const h of handles) {
                try {
                    const v = await h.jsonValue();
                    if (typeof v === 'object') {
                        serialized.push(JSON.stringify(v, null, 0));
                    } else {
                        serialized.push(String(v));
                    }
                } catch {
                    serialized.push('[unserializable]');
                }
            }
            logger.info({ ctx: context, type: 'console', level: msg.type(), text: msg.text(), args: serialized }, 'browser console');
        } catch (e) {
            logger.info({ ctx: context, type: 'console', level: msg.type(), text: msg.text() }, 'browser console');
        }
    });

    page.on('pageerror', err => {
        logger.error({ ctx: context, type: 'pageerror', err: err?.message, stack: err?.stack }, 'browser pageerror');
    });

    page.on('requestfailed', req => {
        logger.warn({ ctx: context, type: 'requestfailed', url: req.url(), method: req.method(), failure: req.failure() }, 'browser request failed');
    });

    page.on('response', res => {
        const status = res.status();
        if (status >= 400) {
            logger.warn({ ctx: context, type: 'response', url: res.url(), status }, 'browser response error');
        }
    });
}

