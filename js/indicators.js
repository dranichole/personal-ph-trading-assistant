import { CONFIG } from './config.js';

/**
 * ==========================================
 * LOCAL TECHNICAL INDICATORS
 * ==========================================
 */

function lastDefined(series) {
    for (let i = series.length - 1; i >= 0; i--) {
        if (series[i] !== null && series[i] !== undefined && !Number.isNaN(series[i])) {
            return series[i];
        }
    }
    return null;
}

export function sma(values, period) {
    const out = new Array(values.length).fill(null);
    if (period <= 0 || values.length < period) return out;
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += values[i];
        if (i >= period) sum -= values[i - period];
        if (i >= period - 1) out[i] = parseFloat((sum / period).toFixed(4));
    }
    return out;
}

export function rsi(values, period = 14) {
    const out = new Array(values.length).fill(null);
    if (values.length < period + 1) return out;

    let gain = 0;
    let loss = 0;
    for (let i = 1; i <= period; i++) {
        const delta = values[i] - values[i - 1];
        if (delta >= 0) gain += delta;
        else loss -= delta;
    }
    let avgGain = gain / period;
    let avgLoss = loss / period;
    out[period] = avgLoss === 0 ? 100 : parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));

    for (let i = period + 1; i < values.length; i++) {
        const delta = values[i] - values[i - 1];
        const g = delta > 0 ? delta : 0;
        const l = delta < 0 ? -delta : 0;
        avgGain = (avgGain * (period - 1) + g) / period;
        avgLoss = (avgLoss * (period - 1) + l) / period;
        out[i] = avgLoss === 0 ? 100 : parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
    }
    return out;
}

export function atr(bars, period = 14) {
    const out = new Array(bars.length).fill(null);
    if (bars.length < period + 1) return out;

    const tr = bars.map((bar, i) => {
        if (i === 0) return bar.high - bar.low;
        const prevClose = bars[i - 1].close;
        return Math.max(
            bar.high - bar.low,
            Math.abs(bar.high - prevClose),
            Math.abs(bar.low - prevClose)
        );
    });

    let sum = 0;
    for (let i = 1; i <= period; i++) sum += tr[i];
    let avg = sum / period;
    out[period] = parseFloat(avg.toFixed(4));

    for (let i = period + 1; i < bars.length; i++) {
        avg = (avg * (period - 1) + tr[i]) / period;
        out[i] = parseFloat(avg.toFixed(4));
    }
    return out;
}

export function supportResistance(bars, lookback = 20) {
    if (!bars.length) return { support: null, resistance: null };
    const slice = bars.slice(-Math.min(lookback, bars.length));
    const lows = slice.map(b => b.low);
    const highs = slice.map(b => b.high);
    return {
        support: parseFloat(Math.min(...lows).toFixed(2)),
        resistance: parseFloat(Math.max(...highs).toFixed(2))
    };
}

export function pctChange(first, last) {
    if (!first || first === 0) return 0;
    return ((last - first) / first) * 100;
}

export function summarizeBars(bars) {
    const closes = bars.map(b => b.close);
    const volumes = bars.map(b => b.volume || 0);
    const sma20Series = sma(closes, 20);
    const sma50Series = sma(closes, 50);
    const rsiSeries = rsi(closes, 14);
    const atrSeries = atr(bars, 14);
    const levels = supportResistance(bars, 20);
    const first = closes[0];
    const last = closes[closes.length - 1];
    const avgVolume = volumes.length
        ? Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length)
        : 0;

    const rsiValue = lastDefined(rsiSeries);
    let rsiLabel = '—';
    if (rsiValue !== null) {
        if (rsiValue >= 70) rsiLabel = 'Overbought';
        else if (rsiValue <= 30) rsiLabel = 'Oversold';
        else rsiLabel = 'Neutral';
    }

    const sma20 = lastDefined(sma20Series);
    const sma50 = lastDefined(sma50Series);
    let smaBias = 'Insufficient data';
    if (sma20 !== null) {
        smaBias = last >= sma20 ? 'Price above SMA20' : 'Price below SMA20';
        if (sma50 !== null) {
            smaBias += last >= sma50 ? ', above SMA50' : ', below SMA50';
        }
    }

    const atrValue = lastDefined(atrSeries);
    const purchase = suggestPurchase(
        last,
        levels.support,
        levels.resistance,
        atrValue,
        CONFIG.starterRiskPesos
    );

    return {
        latestClose: last,
        firstClose: first,
        pctChange: parseFloat(pctChange(first, last).toFixed(2)),
        trendLabel: last >= first ? 'Bullish' : 'Bearish',
        sma20,
        sma50,
        sma20Series,
        sma50Series,
        rsi: rsiValue,
        rsiLabel,
        atr: atrValue,
        support: levels.support,
        resistance: levels.resistance,
        avgVolume,
        smaBias,
        recentCloses: closes.slice(-20),
        purchase
    };
}

/** Trading days used for each projection horizon. */
export const FORECAST_HORIZONS = [
    { id: '5d', label: '1W', days: 5 },
    { id: '1mo', label: '1M', days: 22 },
    { id: '3mo', label: '3M', days: 63 },
    { id: '6mo', label: '6M', days: 126 },
    { id: '1y', label: '1Y', days: 252 }
];

function horizonMeta(horizonId) {
    return FORECAST_HORIZONS.find(h => h.id === horizonId) || FORECAST_HORIZONS[1];
}

function dailyReturns(closes) {
    const out = [];
    for (let i = 1; i < closes.length; i++) {
        const a = closes[i - 1];
        const b = closes[i];
        if (a > 0 && Number.isFinite(a) && Number.isFinite(b)) out.push((b - a) / a);
    }
    return out;
}

function mean(arr) {
    if (!arr.length) return null;
    return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function stdev(arr) {
    if (arr.length < 2) return null;
    const m = mean(arr);
    const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(v);
}

/**
 * Data-driven horizon projection from actual OHLCV closes.
 * Uses trailing / rolling returns + daily volatility, scaled to the chosen horizon
 * when fewer bars than a full window are available (common on phisix-limited feeds).
 */
export function projectHorizonInvestment(bars, investPesos, horizonId = '1mo') {
    const amount = Number(investPesos);
    const horizon = horizonMeta(horizonId);
    const closes = (bars || []).map(b => Number(b.close)).filter(c => Number.isFinite(c) && c > 0);
    const price = closes.length ? closes[closes.length - 1] : null;
    const availableDays = Math.max(0, closes.length - 1);
    const minDays = 15;

    if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, note: 'Enter a positive peso amount.' };
    }
    if (availableDays < minDays) {
        return {
            ok: false,
            note: `Need at least ${minDays} trading days of live history (have ${availableDays}).`
        };
    }

    // Use the longest window we actually have, then scale drift/vol to the target horizon.
    const observeDays = Math.min(horizon.days, availableDays);
    const window = closes.slice(-(observeDays + 1));
    const start = window[0];
    const end = window[window.length - 1];
    const observeReturn = (end - start) / start;
    const scale = horizon.days / observeDays;
    const scaledTrail = observeReturn * scale;

    // Rolling windows at the observed length (not the full horizon if history is short)
    const step = Math.max(1, Math.floor(observeDays / 4));
    const rolling = [];
    for (let i = closes.length - 1; i - observeDays >= 0; i -= step) {
        const a = closes[i - observeDays];
        const b = closes[i];
        if (a > 0) rolling.push(((b - a) / a) * scale);
        if (rolling.length >= 12) break;
    }
    const rollMean = mean(rolling);
    const expectedReturn =
        rollMean == null ? scaledTrail : 0.65 * scaledTrail + 0.35 * rollMean;

    const rets = dailyReturns(closes.slice(-Math.max(observeDays * 2, 40)));
    const dailyVol = stdev(rets) ?? 0;
    const horizonVol = dailyVol * Math.sqrt(horizon.days);

    const sma20Series = sma(closes, 20);
    const sma20 = lastDefined(sma20Series);
    let trendAdj = 1;
    let trendNote = 'neutral vs SMA20';
    if (sma20 != null) {
        const above = end >= sma20;
        if (expectedReturn > 0 && above) {
            trendAdj = 1.05;
            trendNote = 'price above SMA20 supports upside bias';
        } else if (expectedReturn > 0 && !above) {
            trendAdj = 0.7;
            trendNote = 'price below SMA20 dampens upside bias';
        } else if (expectedReturn < 0 && !above) {
            trendAdj = 1.05;
            trendNote = 'price below SMA20 supports downside bias';
        } else if (expectedReturn < 0 && above) {
            trendAdj = 0.7;
            trendNote = 'price above SMA20 dampens downside bias';
        }
    }

    const adjReturn = expectedReturn * trendAdj;
    const lowReturn = adjReturn - horizonVol;
    const highReturn = adjReturn + horizonVol;

    const projected = amount * (1 + adjReturn);
    const low = amount * (1 + lowReturn);
    const high = amount * (1 + highReturn);
    const gain = projected - amount;
    const shares = price > 0 ? Math.floor(amount / price) : null;
    const scaledNote =
        observeDays < horizon.days
            ? ` Scaled from ${observeDays} available sessions to ${horizon.label}.`
            : '';

    return {
        ok: true,
        amount,
        horizonId: horizon.id,
        horizonLabel: horizon.label,
        horizonDays: horizon.days,
        observeDays,
        scaled: observeDays < horizon.days,
        price,
        shares,
        trailPct: parseFloat((scaledTrail * 100).toFixed(2)),
        expectedPct: parseFloat((adjReturn * 100).toFixed(2)),
        volPct: parseFloat((horizonVol * 100).toFixed(2)),
        projected: parseFloat(projected.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        gain: parseFloat(gain.toFixed(2)),
        sampleWindows: rolling.length,
        trendNote,
        method:
            `Trailing/rolling returns from live closes + SMA20 tilt; ±1σ from daily vol × √${horizon.days}.${scaledNote}`
    };
}

/** @deprecated use projectHorizonInvestment */
export function forecastInvestment(investPesos, pctChange, latestClose) {
    const amount = Number(investPesos);
    const pct = Number(pctChange);
    const price = Number(latestClose);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, note: 'Enter a positive peso amount.' };
    }
    if (!Number.isFinite(pct)) {
        return { ok: false, note: 'Need a chart range % change first.' };
    }
    const projected = amount * (1 + pct / 100);
    const gain = projected - amount;
    const shares = Number.isFinite(price) && price > 0 ? Math.floor(amount / price) : null;
    return {
        ok: true,
        amount,
        pct,
        projected: parseFloat(projected.toFixed(2)),
        gain: parseFloat(gain.toFixed(2)),
        shares,
        price: Number.isFinite(price) ? price : null
    };
}

/**
 * Educational starter buy idea for beginners.
 * Entry leans toward recent support; size risks a fixed peso budget with a ~1.5× ATR stop.
 */
export function suggestPurchase(latestClose, support, resistance, atrValue, riskPesos = 1000) {
    if (!latestClose || latestClose <= 0) {
        return { entry: null, shares: null, spend: null, stop: null, note: 'Need price data first.' };
    }

    let entry = latestClose;
    if (support != null && support > 0) {
        // Prefer a pullback toward support, but never invent a price above the last close as “cheaper.”
        entry = Math.min(latestClose, support + (latestClose - support) * 0.35);
        if (entry > latestClose) entry = latestClose;
        if (entry < support) entry = support;
    }
    entry = parseFloat(entry.toFixed(2));

    const stopDistance = atrValue && atrValue > 0
        ? Math.max(atrValue * 1.5, entry * 0.015)
        : entry * 0.03;
    const stop = parseFloat(Math.max(0.01, entry - stopDistance).toFixed(2));
    const riskPerShare = Math.max(entry - stop, entry * 0.01);
    const shares = Math.max(1, Math.floor(riskPesos / riskPerShare));
    const spend = parseFloat((shares * entry).toFixed(2));

    return {
        entry,
        shares,
        spend,
        stop,
        riskPesos,
        note: `Example size if you risk about ₱${riskPesos.toLocaleString('en-PH')} on the idea (educational only).`
    };
}
