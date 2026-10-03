/**
 * Live PSE market data proxy.
 *
 * Primary: PSE Edge chart (true daily OHLC in PHP) when Cloudflare/origin allow it.
 * Fallback: phisix daily closes (public, reliable PHP last prices).
 * Yahoo *.PS equity charts currently 404 for individual names.
 */

const ALLOWED_RANGES = new Set(['5d', '1mo', '3mo', '1y', '6mo', '2y', '5y', 'ytd', 'max']);
const CACHE_TTL_MS = 90 * 1000;
const ID_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const EDGE_TIMEOUT_MS = 10000;
const PHISIX_TIMEOUT_MS = 8000;

const cache = new Map();
const idCache = new Map();

/** Known PSE Edge company/security ids for default watchlist (skips directory scrape). */
const KNOWN_IDS = {
    SM: { companyId: '599', securityId: '520', name: 'SM Investments Corporation' },
    JFC: { companyId: '86', securityId: '158', name: 'Jollibee Foods Corporation' },
    BDO: { companyId: '260', securityId: '468', name: 'BDO Unibank, Inc.' },
    ALI: { companyId: '180', securityId: '293', name: 'Ayala Land, Inc.' },
    GLO: { companyId: '69', securityId: '127', name: 'Globe Telecom, Inc.' }
};

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function normalizeTicker(raw) {
    const ticker = String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/\.PS$/i, '');
    if (!/^[A-Z0-9]{1,12}$/.test(ticker)) return null;
    return ticker;
}

function rangeStartDate(range) {
    const end = new Date();
    const start = new Date(end);
    const days =
        range === '5d' ? 10 :
        range === '3mo' ? 100 :
        range === '1y' ? 400 :
        range === '6mo' ? 200 :
        range === '2y' ? 800 :
        range === '5y' ? 1900 :
        40;
    start.setDate(end.getDate() - days);
    return start;
}

function formatEdgeDate(d) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}-${dd}-${d.getFullYear()}`;
}

function formatBarDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
}

function parseEdgeChartDate(raw) {
    const d = new Date(String(raw).replace(' 00:00:00', ' GMT+0800'));
    if (Number.isNaN(d.getTime())) return new Date(raw);
    return d;
}

function withTimeout(ms, label) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error(`${label} timed out`)), ms);
    return { signal: ctrl.signal, clear: () => clearTimeout(timer) };
}

async function resolveEdgeIds(ticker) {
    if (KNOWN_IDS[ticker]) return KNOWN_IDS[ticker];

    const hit = idCache.get(ticker);
    if (hit && Date.now() - hit.at < ID_CACHE_TTL_MS) return hit.ids;

    const body = new URLSearchParams({
        pageNo: '1',
        companyId: '',
        keyword: ticker,
        sortType: '',
        dateSortType: 'DESC',
        cmpySortType: 'ASC',
        symbolSortType: 'ASC',
        sector: 'ALL',
        subsector: 'ALL'
    });

    const t = withTimeout(EDGE_TIMEOUT_MS, 'Edge directory');
    try {
        const response = await fetch('https://edge.pse.com.ph/companyDirectory/search.ax', {
            method: 'POST',
            headers: {
                'User-Agent': UA,
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                Origin: 'https://edge.pse.com.ph',
                Referer: 'https://edge.pse.com.ph/companyDirectory/search.do'
            },
            body: body.toString(),
            signal: t.signal
        });
        if (!response.ok) throw new Error(`Edge directory HTTP ${response.status}`);

        const html = await response.text();
        const exact = new RegExp(
            `cmDetail\\('(\\d+)','(\\d+)'\\);return false;">${ticker}<\\/a>`,
            'i'
        );
        const m = html.match(exact);
        if (!m) throw new Error(`Ticker ${ticker} not found on PSE Edge`);

        let name = ticker;
        const nameRe = new RegExp(
            `cmDetail\\('${m[1]}','${m[2]}'\\);return false;">([^<]+)<\\/a>`,
            'i'
        );
        const nameMatch = html.match(nameRe);
        if (nameMatch?.[1] && nameMatch[1].toUpperCase() !== ticker) {
            name = nameMatch[1].replace(/\s+/g, ' ').trim();
        }

        const ids = { companyId: m[1], securityId: m[2], name };
        idCache.set(ticker, { at: Date.now(), ids });
        return ids;
    } finally {
        t.clear();
    }
}

async function fetchEdgeBars(ticker, range) {
    const { companyId, securityId, name } = await resolveEdgeIds(ticker);
    const end = new Date();
    const start = rangeStartDate(range);
    const payload = {
        cmpy_id: Number(companyId),
        security_id: Number(securityId),
        startDate: formatEdgeDate(start),
        endDate: formatEdgeDate(end)
    };

    const t = withTimeout(EDGE_TIMEOUT_MS, 'Edge chart');
    try {
        const response = await fetch('https://edge.pse.com.ph/common/DisclosureCht.ax', {
            method: 'POST',
            headers: {
                'User-Agent': UA,
                'Content-Type': 'application/json',
                Accept: 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'en-US,en;q=0.9',
                Origin: 'https://edge.pse.com.ph',
                Referer: `https://edge.pse.com.ph/companyPage/stockData.do?cmpy_id=${companyId}&security_id=${securityId}`,
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(payload),
            signal: t.signal
        });
        if (!response.ok) throw new Error(`Edge chart HTTP ${response.status}`);

        const data = await response.json();
        const rows = Array.isArray(data?.chartData) ? data.chartData : [];
        if (!rows.length) throw new Error('Edge returned empty chartData');

        const bars = rows
            .map((row) => {
                const date = parseEdgeChartDate(row.CHART_DATE);
                const close = Number(row.CLOSE);
                const open = Number(row.OPEN);
                const high = Number(row.HIGH);
                const low = Number(row.LOW);
                const value = Number(row.VALUE);
                if (![close, open, high, low].every((n) => Number.isFinite(n))) return null;
                const volume =
                    Number.isFinite(value) && close > 0 ? Math.round(value / close) : 0;
                return {
                    date: formatBarDate(date),
                    timestamp: Math.floor(date.getTime() / 1000),
                    open: parseFloat(open.toFixed(4)),
                    high: parseFloat(high.toFixed(4)),
                    low: parseFloat(low.toFixed(4)),
                    close: parseFloat(close.toFixed(4)),
                    price: parseFloat(close.toFixed(4)),
                    volume
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.timestamp - b.timestamp);

        if (!bars.length) throw new Error('Edge bars failed to parse');

        return {
            ticker,
            name: name || ticker,
            bars,
            source: 'live',
            provider: 'pse-edge',
            fetchedAt: Date.now(),
            range
        };
    } finally {
        t.clear();
    }
}

function manilaYmd(d) {
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function tradingDaysBack(count) {
    const days = [];
    const cursor = new Date();
    let guard = 0;
    while (days.length < count && guard < count * 3) {
        guard += 1;
        const ymd = manilaYmd(cursor);
        const weekday = new Date(`${ymd}T12:00:00+08:00`).getDay();
        if (weekday !== 0 && weekday !== 6) days.push(ymd);
        cursor.setDate(cursor.getDate() - 1);
    }
    return days.reverse();
}

function stitchCloseBars(points) {
    const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
    return sorted.map((p, i) => {
        const prev = i > 0 ? sorted[i - 1].close : p.close;
        const open = prev;
        const close = p.close;
        return {
            date: p.date,
            timestamp: p.timestamp,
            open: parseFloat(open.toFixed(4)),
            high: parseFloat(Math.max(open, close).toFixed(4)),
            low: parseFloat(Math.min(open, close).toFixed(4)),
            close: parseFloat(close.toFixed(4)),
            price: parseFloat(close.toFixed(4)),
            volume: p.volume || 0
        };
    });
}

async function fetchPhisixDay(ticker, ymd) {
    const url = ymd
        ? `https://phisix-api3.appspot.com/stocks/${encodeURIComponent(ticker)}.${ymd}.json`
        : `https://phisix-api3.appspot.com/stocks/${encodeURIComponent(ticker)}.json`;
    const t = withTimeout(PHISIX_TIMEOUT_MS, 'phisix');
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': UA, Accept: 'application/json' },
            signal: t.signal
        });
        if (!response.ok) return null;
        const data = await response.json();
        const stock = data?.stocks?.[0];
        if (stock?.price?.amount == null) return null;
        const close = Number(stock.price.amount);
        if (!Number.isFinite(close)) return null;
        const asOf = data.as_of
            ? new Date(data.as_of)
            : new Date(`${ymd || manilaYmd(new Date())}T00:00:00+08:00`);
        return {
            name: stock.name || ticker,
            close: parseFloat(close.toFixed(4)),
            volume: Number(stock.volume) || 0,
            date: asOf
        };
    } catch {
        return null;
    } finally {
        t.clear();
    }
}

async function fetchPhisixBars(ticker, range) {
    const needed =
        range === '5d' ? 5 :
        range === '3mo' ? 63 :
        range === '1y' ? 120 :
        22;

    const days = tradingDaysBack(needed);
    const points = [];
    let name = ticker;

    for (let i = 0; i < days.length; i += 6) {
        const chunk = days.slice(i, i + 6);
        const parts = await Promise.all(chunk.map((ymd) => fetchPhisixDay(ticker, ymd)));
        parts.forEach((part) => {
            if (!part) return;
            name = part.name || name;
            points.push({
                date: formatBarDate(part.date),
                timestamp: Math.floor(part.date.getTime() / 1000),
                close: part.close,
                volume: part.volume
            });
        });
    }

    const latest = await fetchPhisixDay(ticker, null);
    if (latest) {
        name = latest.name || name;
        const ts = Math.floor(latest.date.getTime() / 1000);
        if (!points.some((p) => p.timestamp === ts)) {
            points.push({
                date: formatBarDate(latest.date),
                timestamp: ts,
                close: latest.close,
                volume: latest.volume
            });
        }
    }

    const bars = stitchCloseBars(points);
    if (bars.length < 2) throw new Error('Phisix returned insufficient history');

    return {
        ticker,
        name,
        bars,
        source: 'live',
        provider: 'phisix',
        fetchedAt: Date.now(),
        range,
        note: 'Daily closes/volume from phisix; open/high/low inferred from prior close when Edge OHLC unavailable'
    };
}

module.exports = async function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const ticker = normalizeTicker(req.query?.ticker);
    const range = String(req.query?.range || '1mo');
    if (!ticker) return res.status(400).json({ error: 'Invalid ticker' });
    if (!ALLOWED_RANGES.has(range)) return res.status(400).json({ error: 'Invalid range' });

    const cacheKey = `${ticker}:${range}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(hit.data);
    }

    const errors = [];

    try {
        const data = await fetchEdgeBars(ticker, range);
        cache.set(cacheKey, { at: Date.now(), data });
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Provider', 'pse-edge');
        return res.status(200).json(data);
    } catch (err) {
        errors.push(`edge: ${err.message}`);
    }

    try {
        const data = await fetchPhisixBars(ticker, range);
        cache.set(cacheKey, { at: Date.now(), data });
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Provider', 'phisix');
        return res.status(200).json(data);
    } catch (err) {
        errors.push(`phisix: ${err.message}`);
    }

    return res.status(502).json({
        error: 'Failed to fetch live PSE data',
        detail: errors.join(' | ')
    });
};
