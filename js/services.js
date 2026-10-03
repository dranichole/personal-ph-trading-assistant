/**
 * ==========================================
 * SERVICES LAYER (External APIs)
 * ==========================================
 */
import { CONFIG, GCASH_PRE_IPO } from './config.js';

const FALLBACK_BASE = {
    SM: 495.0,
    JFC: 142.0,
    BDO: 110.6,
    ALI: 15.14,
    GLO: 1554.0,
    DDMPR: 1.03,
    CREIT: 2.9,
    FILRT: 2.73,
    RCR: 6.1,
    ACEN: 2.62,
    SHNG: 3.0,
    DMC: 7.39,
    COSCO: 7.4,
    MREIT: 13.4
};

function formatBarDate(timestampSec) {
    return new Date(timestampSec * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function rangeBarCount(range) {
    if (range === '5d') return 5;
    if (range === '3mo') return 63;
    if (range === '1y') return 252;
    return 22;
}

/** Deterministic PRNG so the Pre-IPO path stays stable for a given day + range. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function daySeed(extra = 0) {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() + extra;
}

function manilaYmd(d = new Date()) {
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

function normalizeBars(bars) {
    return (bars || [])
        .map((b) => {
            const close = Number(b.close ?? b.price);
            if (!Number.isFinite(close)) return null;
            const open = Number.isFinite(Number(b.open)) ? Number(b.open) : close;
            const high = Number.isFinite(Number(b.high)) ? Number(b.high) : Math.max(open, close);
            const low = Number.isFinite(Number(b.low)) ? Number(b.low) : Math.min(open, close);
            const timestamp = Number(b.timestamp) || Math.floor(Date.now() / 1000);
            return {
                date: b.date || formatBarDate(timestamp),
                timestamp,
                open: parseFloat(open.toFixed(4)),
                high: parseFloat(high.toFixed(4)),
                low: parseFloat(low.toFixed(4)),
                close: parseFloat(close.toFixed(4)),
                price: parseFloat(close.toFixed(4)),
                volume: Number(b.volume) || 0
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.timestamp - b.timestamp);
}

async function fetchJson(url, label) {
    const response = await fetch(url);
    if (!response.ok) {
        let detail = '';
        try {
            const body = await response.json();
            detail = body.detail || body.error || '';
        } catch {
            /* ignore */
        }
        throw new Error(`${label} HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    return response.json();
}

/** Local/static fallback when `/api/quote` is not running (CORS-friendly phisix). */
async function fetchPhisixSnapshot(ticker, range) {
    const needed =
        range === '5d' ? 5 :
        range === '3mo' ? 40 :
        range === '1y' ? 60 :
        22;

    const days = tradingDaysBack(needed);
    const bars = [];
    let name = ticker;

    for (let i = 0; i < days.length; i += 5) {
        const chunk = days.slice(i, i + 5);
        const parts = await Promise.all(
            chunk.map(async (ymd) => {
                try {
                    const data = await fetchJson(
                        `https://phisix-api3.appspot.com/stocks/${encodeURIComponent(ticker)}.${ymd}.json`,
                        'phisix'
                    );
                    const stock = data?.stocks?.[0];
                    if (!stock?.price?.amount && stock?.price?.amount !== 0) return null;
                    const close = Number(stock.price.amount);
                    const asOf = data.as_of ? new Date(data.as_of) : new Date(`${ymd}T00:00:00+08:00`);
                    return {
                        name: stock.name,
                        close,
                        volume: Number(stock.volume) || 0,
                        date: asOf
                    };
                } catch {
                    return null;
                }
            })
        );
        parts.forEach((part) => {
            if (!part || !Number.isFinite(part.close)) return;
            name = part.name || name;
            const close = parseFloat(part.close.toFixed(4));
            const ts = Math.floor(part.date.getTime() / 1000);
            bars.push({
                date: formatBarDate(ts),
                timestamp: ts,
                open: close,
                high: close,
                low: close,
                close,
                price: close,
                volume: part.volume
            });
        });
    }

    try {
        const latest = await fetchJson(
            `https://phisix-api3.appspot.com/stocks/${encodeURIComponent(ticker)}.json`,
            'phisix'
        );
        const stock = latest?.stocks?.[0];
        if (stock?.price?.amount != null) {
            name = stock.name || name;
            const close = parseFloat(Number(stock.price.amount).toFixed(4));
            const asOf = latest.as_of ? new Date(latest.as_of) : new Date();
            const ts = Math.floor(asOf.getTime() / 1000);
            if (!bars.some((b) => b.timestamp === ts)) {
                bars.push({
                    date: formatBarDate(ts),
                    timestamp: ts,
                    open: close,
                    high: close,
                    low: close,
                    close,
                    price: close,
                    volume: Number(stock.volume) || 0
                });
            }
        }
    } catch {
        /* keep whatever daily bars we have */
    }

    const sorted = normalizeBars(bars);
    if (sorted.length < 2) throw new Error('Phisix insufficient history');

    // Infer open/high/low from prior close when only EOD close is available.
    const stitched = sorted.map((b, i) => {
        const open = i > 0 ? sorted[i - 1].close : b.close;
        return {
            ...b,
            open,
            high: Math.max(open, b.close),
            low: Math.min(open, b.close),
            price: b.close
        };
    });

    return {
        ticker,
        name,
        bars: stitched,
        source: 'live',
        provider: 'phisix',
        fetchedAt: Date.now(),
        range,
        note: 'Close/volume from phisix (local fallback)'
    };
}

async function fetchLiveSnapshot(ticker, range) {
    const errors = [];

    try {
        const data = await fetchJson(CONFIG.quoteApiUrl(ticker, range), 'quote API');
        if (Array.isArray(data.bars) && data.bars.length) {
            return {
                ticker: data.ticker || ticker,
                name: data.name || ticker,
                bars: normalizeBars(data.bars),
                source: 'live',
                provider: data.provider || 'pse-edge',
                fetchedAt: data.fetchedAt || Date.now(),
                range,
                note: data.note || null
            };
        }
        // Legacy Yahoo payload shape (if an older proxy is still deployed)
        if (data.chart?.result?.[0]) {
            const result = data.chart.result[0];
            const timestamps = result.timestamp || [];
            const quote = result.indicators?.quote?.[0] || {};
            const bars = [];
            for (let i = 0; i < timestamps.length; i++) {
                if (quote.close?.[i] == null) continue;
                const close = parseFloat(Number(quote.close[i]).toFixed(4));
                bars.push({
                    date: formatBarDate(timestamps[i]),
                    timestamp: timestamps[i],
                    open: quote.open?.[i] != null ? parseFloat(Number(quote.open[i]).toFixed(4)) : close,
                    high: quote.high?.[i] != null ? parseFloat(Number(quote.high[i]).toFixed(4)) : close,
                    low: quote.low?.[i] != null ? parseFloat(Number(quote.low[i]).toFixed(4)) : close,
                    close,
                    price: close,
                    volume: quote.volume?.[i] != null ? quote.volume[i] : 0
                });
            }
            if (bars.length) {
                return {
                    ticker,
                    name: result.meta?.shortName || ticker,
                    bars: normalizeBars(bars),
                    source: 'live',
                    provider: 'yahoo',
                    fetchedAt: Date.now(),
                    range
                };
            }
        }
        throw new Error('quote API returned no bars');
    } catch (err) {
        errors.push(err.message);
    }

    try {
        return await fetchPhisixSnapshot(ticker, range);
    } catch (err) {
        errors.push(err.message);
    }

    throw new Error(errors.join(' | '));
}

export class DataService {
    /**
     * Pre-listing forecast around the official ₱6.60 IPO price.
     * After listing, live GCASH can replace this when PSE Edge has a series.
     */
    static generateGCashPreIpoForecast(range = CONFIG.dashboardRange) {
        const listing = GCASH_PRE_IPO.finalOfferPrice;
        const floor = GCASH_PRE_IPO.offerLow;
        const ceiling = GCASH_PRE_IPO.offerHigh;
        const rand = mulberry32(daySeed(rangeBarCount(range) * 31 + 660));
        let price = listing * (0.97 + rand() * 0.05);
        const bars = [];
        const today = new Date();
        const needed = rangeBarCount(range);
        let i = 0;

        const dailyDrift = 0.0006;
        const vol = 0.016;

        while (bars.length < needed) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            i += 1;
            if (date.getDay() === 0 || date.getDay() === 6) continue;

            const shock = (rand() - 0.5) * vol;
            const pullToList = (listing - price) * 0.08;
            const open = price;
            let close = open * (1 + dailyDrift + shock) + pullToList;
            if (close < floor) close += (floor - close) * 0.4;
            if (close > ceiling) close -= (close - ceiling) * 0.35;
            close = Math.min(ceiling, Math.max(floor, close));

            const high = Math.max(open, close) * (1 + rand() * 0.01);
            const low = Math.min(open, close) * (1 - rand() * 0.01);
            price = close;

            bars.unshift({
                date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                timestamp: Math.floor(date.getTime() / 1000),
                open: parseFloat(open.toFixed(2)),
                high: parseFloat(high.toFixed(2)),
                low: parseFloat(low.toFixed(2)),
                close: parseFloat(close.toFixed(2)),
                price: parseFloat(close.toFixed(2)),
                volume: Math.round(3_000_000 + rand() * 6_000_000)
            });
        }

        return {
            ticker: GCASH_PRE_IPO.ticker,
            name: GCASH_PRE_IPO.name,
            bars,
            source: 'preipo',
            preIpo: true,
            filing: { ...GCASH_PRE_IPO },
            fetchedAt: Date.now(),
            range
        };
    }

    static async fetchHistoricalData(ticker, range = CONFIG.dashboardRange) {
        if (ticker === GCASH_PRE_IPO.ticker) {
            try {
                const live = await fetchLiveSnapshot(ticker, range);
                if (live.bars.length >= 3) {
                    return {
                        ...live,
                        preIpo: false,
                        filing: { ...GCASH_PRE_IPO },
                        name: live.name || GCASH_PRE_IPO.name
                    };
                }
            } catch {
                /* not listed yet */
            }
            return this.generateGCashPreIpoForecast(range);
        }

        try {
            return await fetchLiveSnapshot(ticker, range);
        } catch (error) {
            console.warn(`Live data unavailable for ${ticker} (${range}): ${error.message}`);
            return this.generateFallbackData(ticker, range);
        }
    }

    static generateFallbackData(ticker, range = CONFIG.dashboardRange) {
        let currentPrice = FALLBACK_BASE[ticker] || 100;
        const bars = [];
        const today = new Date();
        const needed = rangeBarCount(range);
        let i = 0;
        while (bars.length < needed) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            i += 1;
            if (date.getDay() === 0 || date.getDay() === 6) continue;

            const change = 1 + (Math.random() * 0.04 - 0.02);
            const open = currentPrice;
            const close = currentPrice * change;
            const high = Math.max(open, close) * (1 + Math.random() * 0.01);
            const low = Math.min(open, close) * (1 - Math.random() * 0.01);
            currentPrice = close;
            bars.unshift({
                date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                timestamp: Math.floor(date.getTime() / 1000),
                open: parseFloat(open.toFixed(2)),
                high: parseFloat(high.toFixed(2)),
                low: parseFloat(low.toFixed(2)),
                close: parseFloat(close.toFixed(2)),
                price: parseFloat(close.toFixed(2)),
                volume: Math.round(500000 + Math.random() * 1500000)
            });
        }

        return {
            ticker,
            name: ticker,
            bars,
            source: 'simulated',
            fetchedAt: Date.now(),
            range
        };
    }
}

export class AIService {
    static async analyze(payload) {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        return await response.json();
    }
}
