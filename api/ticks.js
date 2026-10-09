/**
 * SSE tick relay for Scalp view.
 * Polls live phisix last price and streams ticks to the browser.
 * On Vercel, connections are short-lived; client falls back to direct poll if SSE dies.
 */

const PHISIX = 'https://phisix-api3.appspot.com';

function normalizeTicker(raw) {
    const ticker = String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/\.PS$/i, '');
    if (!/^[A-Z0-9]{1,12}$/.test(ticker)) return null;
    return ticker;
}

async function lastTrade(ticker) {
    const res = await fetch(`${PHISIX}/stocks/${encodeURIComponent(ticker)}.json`);
    if (!res.ok) throw new Error(`phisix ${res.status}`);
    const data = await res.json();
    const stock = data?.stocks?.[0];
    if (stock?.price?.amount == null) throw new Error('no price');
    return {
        price: Number(stock.price.amount),
        size: Number(stock.volume) || 0,
        name: stock.name || ticker
    };
}

module.exports = async function (req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(204).end();
    }

    const ticker = normalizeTicker(req.query.ticker);
    if (!ticker) return res.status(400).json({ error: 'Invalid ticker' });

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    let alive = true;
    let lastVol = null;
    let lastPrice = null;
    req.on('close', () => {
        alive = false;
    });

    const push = (obj) => {
        if (!alive) return;
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    push({ hello: true, ticker, t: Date.now() });

    const beat = async () => {
        if (!alive) return;
        try {
            const trade = await lastTrade(ticker);
            let size = 1;
            let side = 'unknown';
            if (lastVol != null) size = Math.max(0, trade.size - lastVol);
            if (lastPrice != null) {
                if (trade.price > lastPrice) side = 'buy';
                else if (trade.price < lastPrice) side = 'sell';
            }
            lastVol = trade.size;
            lastPrice = trade.price;
            push({
                ticker,
                t: Date.now(),
                price: trade.price,
                size: size || 1,
                side,
                source: 'sse'
            });
        } catch (err) {
            push({ error: err.message, t: Date.now() });
        }
    };

    await beat();
    const timer = setInterval(beat, 2500);

    // Cap serverless runtime (~20s bursts); client reconnects or polls.
    await new Promise((resolve) => {
        const end = setTimeout(resolve, 18000);
        req.on('close', () => {
            clearTimeout(end);
            resolve();
        });
    });
    clearInterval(timer);
    alive = false;
    try {
        res.end();
    } catch {
        /* ignore */
    }
};
