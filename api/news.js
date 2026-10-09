/**
 * Lightweight catalyst / headline proxy for the Predict panel.
 * Tries Yahoo finance search news; falls back to empty list (client has calendar).
 */

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

function normalizeTicker(raw) {
    const ticker = String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/\.PS$/i, '');
    if (!/^[A-Z0-9]{1,12}$/.test(ticker)) return null;
    return ticker;
}

module.exports = async function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const ticker = normalizeTicker(req.query.ticker);
    if (!ticker) return res.status(400).json({ error: 'Invalid ticker' });

    const hit = cache.get(ticker);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        return res.status(200).json(hit.payload);
    }

    const items = [];
    try {
        const url =
            `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker + '.PS')}` +
            `&quotesCount=1&newsCount=8&listsCount=0&enableFuzzyQuery=false`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                Accept: 'application/json'
            }
        });
        if (response.ok) {
            const data = await response.json();
            const news = Array.isArray(data.news) ? data.news : [];
            news.slice(0, 6).forEach(n => {
                items.push({
                    title: String(n.title || '').slice(0, 140),
                    publisher: n.publisher || n.provider || 'News',
                    link: n.link || n.url || '',
                    publishedAt: n.providerPublishTime
                        ? n.providerPublishTime * 1000
                        : Date.now()
                });
            });
        }
    } catch {
        /* client calendar still works */
    }

    const payload = {
        ticker,
        items,
        source: items.length ? 'yahoo-search' : 'none',
        fetchedAt: Date.now()
    };
    cache.set(ticker, { at: Date.now(), payload });
    return res.status(200).json(payload);
};
