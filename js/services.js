/**
 * ==========================================
 * SERVICES LAYER (External APIs)
 * ==========================================
 */
import { CONFIG } from './config.js';

const FALLBACK_BASE = { SM: 950.00, JFC: 260.00, BDO: 155.00, ALI: 34.00, GLO: 2100.00 };

function formatBarDate(timestampSec) {
    return new Date(timestampSec * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function rangeBarCount(range) {
    if (range === '5d') return 5;
    if (range === '3mo') return 63;
    if (range === '1y') return 252;
    return 22;
}

export class DataService {
    static async fetchHistoricalData(ticker, range = CONFIG.dashboardRange) {
        try {
            const response = await fetch(CONFIG.apiProxyTemplate(ticker, range));
            if (!response.ok) throw new Error('Proxy or Network error');

            const data = await response.json();
            if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
                throw new Error('No valid payload from Yahoo');
            }

            const result = data.chart.result[0];
            const timestamps = result.timestamp || [];
            const quote = result.indicators?.quote?.[0] || {};
            const closes = quote.close || [];
            const opens = quote.open || [];
            const highs = quote.high || [];
            const lows = quote.low || [];
            const volumes = quote.volume || [];

            const bars = [];
            for (let i = 0; i < timestamps.length; i++) {
                if (closes[i] === null || closes[i] === undefined) continue;
                const close = parseFloat(closes[i].toFixed(2));
                const open = opens[i] != null ? parseFloat(opens[i].toFixed(2)) : close;
                const high = highs[i] != null ? parseFloat(highs[i].toFixed(2)) : close;
                const low = lows[i] != null ? parseFloat(lows[i].toFixed(2)) : close;
                bars.push({
                    date: formatBarDate(timestamps[i]),
                    timestamp: timestamps[i],
                    open,
                    high,
                    low,
                    close,
                    price: close,
                    volume: volumes[i] != null ? volumes[i] : 0
                });
            }

            if (!bars.length) throw new Error('Empty series after cleaning');

            return {
                ticker,
                name: result.meta?.shortName || result.meta?.symbol || ticker,
                bars,
                source: 'live',
                fetchedAt: Date.now(),
                range
            };
        } catch (error) {
            console.warn(`Fallback triggered for ${ticker} (${range}): ${error.message}`);
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
