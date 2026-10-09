/**
 * Market Scanner — quantitative filter engine over PSE OHLCV snapshots.
 */

import { sma, rsi, summarizeBars } from './indicators.js';

export const FILTER_FIELDS = [
    { id: 'rsi', label: 'RSI(14)', type: 'number' },
    { id: 'volRatio', label: 'Vol / 20d avg', type: 'number' },
    { id: 'price', label: 'Last price', type: 'number' },
    { id: 'sma20', label: 'SMA20', type: 'number' },
    { id: 'sma50', label: 'SMA50', type: 'number' },
    { id: 'priceVsSma20', label: 'Price − SMA20', type: 'number' },
    { id: 'priceVsSma50', label: 'Price − SMA50', type: 'number' },
    { id: 'pctChange', label: '% change (range)', type: 'number' },
    { id: 'atrPct', label: 'ATR % of price', type: 'number' }
];

export const FILTER_OPS = [
    { id: 'lt', label: '<' },
    { id: 'lte', label: '≤' },
    { id: 'gt', label: '>' },
    { id: 'gte', label: '≥' },
    { id: 'eq', label: '=' }
];

/** Built-in discovery presets. */
export const SCANNER_PRESETS = [
    {
        id: 'oversold-vol',
        label: 'Oversold + volume spike',
        tip: 'RSI < 30 AND Vol ≥ 2× 20d avg AND Price > SMA50',
        rules: [
            { field: 'rsi', op: 'lt', value: 30 },
            { field: 'volRatio', op: 'gte', value: 2 },
            { field: 'priceVsSma50', op: 'gt', value: 0 }
        ]
    },
    {
        id: 'momentum-break',
        label: 'Momentum breakout',
        tip: 'RSI > 55 AND Vol ≥ 1.5× AND Price > SMA20',
        rules: [
            { field: 'rsi', op: 'gt', value: 55 },
            { field: 'volRatio', op: 'gte', value: 1.5 },
            { field: 'priceVsSma20', op: 'gt', value: 0 }
        ]
    },
    {
        id: 'mean-rev',
        label: 'Soft mean reversion',
        tip: 'RSI < 40 AND Price < SMA20',
        rules: [
            { field: 'rsi', op: 'lt', value: 40 },
            { field: 'priceVsSma20', op: 'lt', value: 0 }
        ]
    }
];

function cmp(op, left, right) {
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (op === 'lt') return left < right;
    if (op === 'lte') return left <= right;
    if (op === 'gt') return left > right;
    if (op === 'gte') return left >= right;
    if (op === 'eq') return Math.abs(left - right) < 1e-9;
    return false;
}

/** Metrics used by filters from a bar series. */
export function scanMetrics(bars) {
    if (!bars?.length) return null;
    const closes = bars.map((b) => Number(b.close));
    const vols = bars.map((b) => Number(b.volume) || 0);
    const last = closes[closes.length - 1];
    const rsiSeries = rsi(closes, 14);
    const sma20Series = sma(closes, 20);
    const sma50Series = sma(closes, 50);
    const rsiVal = rsiSeries[rsiSeries.length - 1];
    const sma20 = sma20Series[sma20Series.length - 1];
    const sma50 = sma50Series[sma50Series.length - 1];
    const avg20 = vols.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, vols.length || 1);
    const lastVol = vols[vols.length - 1] || 0;
    const volRatio = avg20 > 0 ? lastVol / avg20 : 0;
    const stats = summarizeBars(bars);
    const atrPct = stats.atr && last ? (stats.atr / last) * 100 : null;

    return {
        price: last,
        rsi: Number.isFinite(rsiVal) ? rsiVal : null,
        sma20: Number.isFinite(sma20) ? sma20 : null,
        sma50: Number.isFinite(sma50) ? sma50 : null,
        volRatio: parseFloat(volRatio.toFixed(2)),
        lastVolume: lastVol,
        avgVolume: Math.round(avg20),
        pctChange: stats.pctChange,
        atr: stats.atr,
        atrPct: atrPct != null ? parseFloat(atrPct.toFixed(2)) : null,
        priceVsSma20: Number.isFinite(sma20) ? last - sma20 : null,
        priceVsSma50: Number.isFinite(sma50) ? last - sma50 : null
    };
}

export function evaluateRules(metrics, rules = []) {
    if (!metrics || !rules.length) return { pass: false, detail: [] };
    const detail = [];
    let pass = true;
    for (const rule of rules) {
        const left = metrics[rule.field];
        const right = Number(rule.value);
        const ok = cmp(rule.op, left, right);
        detail.push({ ...rule, left, ok });
        if (!ok) pass = false;
    }
    return { pass, detail };
}

export function emptyRule() {
    return { field: 'rsi', op: 'lt', value: 30 };
}
