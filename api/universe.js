/**
 * PSE universe proxy — tries phisix all-stocks, falls back to empty (client has static list).
 */

const PHISIX = 'https://phisix-api3.appspot.com';
let cache = { at: 0, payload: null };
const TTL = 30 * 60 * 1000;

module.exports = async function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (cache.payload && Date.now() - cache.at < TTL) {
        return res.status(200).json(cache.payload);
    }

    let stocks = [];
    let source = 'none';
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(`${PHISIX}/stocks.json`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (r.ok) {
            const data = await r.json();
            stocks = (data?.stocks || [])
                .map((s) => ({
                    ticker: String(s.symbol || '')
                        .toUpperCase()
                        .replace(/\.PS$/i, ''),
                    name: s.name || s.symbol,
                    price: s.price?.amount != null ? Number(s.price.amount) : null,
                    volume: Number(s.volume) || 0,
                    percentChange: Number(s.percent_change) || 0
                }))
                .filter((s) => s.ticker && /^[A-Z0-9]{1,12}$/.test(s.ticker));
            source = 'phisix';
        }
    } catch {
        /* client merges static universe */
    }

    const payload = {
        stocks,
        source,
        count: stocks.length,
        fetchedAt: Date.now(),
        note:
            source === 'phisix'
                ? 'Live PSE last prices via phisix. Scanner still needs OHLC history per name for RSI/SMA filters.'
                : 'Universe feed unavailable. Client uses curated PSE liquid list.'
    };
    cache = { at: Date.now(), payload };
    return res.status(200).json(payload);
};
