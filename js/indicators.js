import { CONFIG } from './config.js';
import { buildTradingPredictions, DEFAULT_MODEL_WEIGHTS } from './models.js';

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
    const lastVol = volumes.length ? volumes[volumes.length - 1] : 0;
    const volRatio = avgVolume > 0 ? lastVol / avgVolume : 0;

    // Net flow proxy: up-day volume − down-day volume (PSE foreign flow when feed unavailable)
    let upVol = 0;
    let downVol = 0;
    for (let i = 1; i < bars.length; i++) {
        const v = Number(bars[i].volume) || 0;
        if (Number(bars[i].close) >= Number(bars[i - 1].close)) upVol += v;
        else downVol += v;
    }
    const netFlow = upVol - downVol;
    const flowDenom = upVol + downVol || 1;
    const netFlowPct = parseFloat((((upVol - downVol) / flowDenom) * 100).toFixed(1));

    const purchase = suggestPurchase(
        last,
        levels.support,
        levels.resistance,
        atrValue,
        CONFIG.starterRiskPesos,
        null,
        { bars }
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
        lastVolume: lastVol,
        volRatio: parseFloat(volRatio.toFixed(2)),
        volumeSpike: volRatio >= 2,
        rsiExtreme: rsiValue != null && (rsiValue < 30 || rsiValue > 70),
        netFlow,
        netFlowPct,
        foreignFlowPositive: netFlowPct > 5,
        smaBias,
        recentCloses: closes.slice(-20),
        purchase
    };
}

const EMPTY_OPTIONAL = {
    optionalBuy: false,
    optionalBuyDetail: '',
    optionalSell: false,
    optionalSellDetail: '',
    quantForecast: null
};

const FORWARD_SESSIONS = 3;

/**
 * Forward forecast strictly from js/models.js:
 * Geometric Brownian Motion + OU mean reversion + ROC momentum (weighted ensemble).
 */
export function computeQuantForecast(stats, bars = null, weights = null) {
    if (!stats || !Number.isFinite(stats.latestClose)) {
        return { ok: false, note: 'Need price data for the math model.' };
    }

    const last = stats.latestClose;
    const entryRef = Number.isFinite(stats.purchase?.entry) && stats.purchase.entry > 0
        ? stats.purchase.entry
        : (Number.isFinite(stats.firstClose) && stats.firstClose > 0 ? stats.firstClose : last);
    const unrealizedPct = entryRef > 0
        ? parseFloat((((last - entryRef) / entryRef) * 100).toFixed(2))
        : 0;

    const series = Array.isArray(bars) && bars.length
        ? bars
        : (stats.recentCloses || []).map(c => ({ close: c }));

    const pred = buildTradingPredictions(series, FORWARD_SESSIONS, {
        weights: weights || CONFIG.modelWeights || DEFAULT_MODEL_WEIGHTS
    });
    if (!pred.ok) {
        return {
            ok: false,
            note: pred.note || 'Need more closes for the forward model.',
            entryRef: parseFloat(entryRef.toFixed(2)),
            unrealizedPct,
            last
        };
    }

    const gbm = pred.models.find(m => m.id === 'gbm' && m.ok);
    const mr = pred.models.find(m => m.id === 'meanReversion' && m.ok);
    const mom = pred.models.find(m => m.id === 'momentum' && m.ok);

    const driftPct = gbm ? gbm.expectedPct : pred.expectedPct;
    const reversionPct = mr ? mr.expectedPct : 0;
    const momPct = mom ? mom.expectedPct : 0;
    const zScore = mr ? mr.zScore : 0;

    let bandPos = 0.5;
    if (
        stats.support != null &&
        stats.resistance != null &&
        stats.resistance > stats.support
    ) {
        bandPos = (last - stats.support) / (stats.resistance - stats.support);
        bandPos = Math.min(1, Math.max(0, bandPos));
    }

    const cheap = bandPos <= 0.35 || zScore <= -0.75 || (stats.rsi != null && stats.rsi <= 40);
    const rich = bandPos >= 0.65 || zScore >= 0.75 || (stats.rsi != null && stats.rsi >= 60);

    return {
        ok: true,
        horizonDays: FORWARD_SESSIONS,
        expectedPct: pred.expectedPct,
        driftPct: parseFloat(Number(driftPct).toFixed(2)),
        reversionPct: parseFloat(Number(reversionPct).toFixed(2)),
        momPct: parseFloat(Number(momPct).toFixed(2)),
        volPct: gbm
            ? parseFloat((gbm.sigmaDaily * Math.sqrt(FORWARD_SESSIONS) * 100).toFixed(2))
            : 0,
        zScore: parseFloat(Number(zScore).toFixed(2)),
        bandPos: parseFloat(bandPos.toFixed(2)),
        cheap,
        rich,
        entryRef: parseFloat(entryRef.toFixed(2)),
        unrealizedPct,
        last,
        predictedPrice: pred.expected,
        predictions: pred,
        method: pred.method
    };
}

/**
 * Exactly one of OPTIONAL BUY or OPTIONAL SELL, or neither.
 * BUY: price looks low and the math model expects upside.
 * SELL: dynamic entry X already shows meaningful paper profit and price looks high / upside is fading.
 */
function detectOptionalCue(stats, forecast) {
    const base = { ...EMPTY_OPTIONAL, quantForecast: forecast };
    if (!forecast?.ok || !stats) return base;

    const exp = forecast.expectedPct;
    const profit = forecast.unrealizedPct;
    const entry = forecast.entryRef;

    let buyScore = 0;
    if (forecast.cheap) buyScore += 2;
    if (exp >= 2.5) buyScore += 2;
    else if (exp >= 1) buyScore += 1;
    if (stats.rsi != null && stats.rsi <= 35) buyScore += 1;
    if (profit <= 2) buyScore += 1;

    let sellScore = 0;
    if (profit >= 10) sellScore += 3;
    else if (profit >= 6) sellScore += 2;
    else if (profit >= 4) sellScore += 1;
    if (forecast.rich) sellScore += 2;
    if (exp <= 0.5) sellScore += 1;
    if (exp < 0) sellScore += 1;
    if (stats.rsi != null && stats.rsi >= 65) sellScore += 1;

    const buyEligible = buyScore >= 3 && exp > 0 && forecast.cheap;
    const sellEligible = sellScore >= 3 && profit >= 6 && (forecast.rich || exp <= 1);

    if (!buyEligible && !sellEligible) return base;

    // Mutual exclusion: stronger side wins; profit-lock edges out when tied.
    if (sellEligible && (!buyEligible || sellScore >= buyScore)) {
        const sign = profit >= 0 ? '+' : '';
        return {
            ...base,
            optionalSell: true,
            optionalSellDetail:
                `~${sign}${profit}% vs entry ₱${entry.toFixed(2)}. Ensemble ${exp >= 0 ? '+' : ''}${exp}% over ${FORWARD_SESSIONS}S. Consider locking gains.`
        };
    }

    return {
        ...base,
        optionalBuy: true,
        optionalBuyDetail:
            `Price looks low. Ensemble ${exp >= 0 ? '+' : ''}${exp}% over ${FORWARD_SESSIONS}S (GBM/OU/ROC). Entry ~₱${entry.toFixed(2)}.`
    };
}

function withOptionalFlags(signal, opts = EMPTY_OPTIONAL) {
    const optionalBuy = Boolean(opts.optionalBuy) && !opts.optionalSell;
    const optionalSell = Boolean(opts.optionalSell) && !optionalBuy;
    return {
        ...signal,
        optionalBuy,
        optionalBuyLabel: optionalBuy ? 'OPTIONAL BUY' : '',
        optionalBuyDetail: optionalBuy ? (opts.optionalBuyDetail || '') : '',
        optionalSell,
        optionalSellLabel: optionalSell ? 'OPTIONAL SELL' : '',
        optionalSellDetail: optionalSell ? (opts.optionalSellDetail || '') : '',
        quantForecast: opts.quantForecast || null
    };
}

function optionalHint(action, opts) {
    if (opts.optionalBuy) {
        const exp = opts.quantForecast?.expectedPct;
        return Number.isFinite(exp) ? `Up ~${exp >= 0 ? '+' : ''}${exp}% · optional buy` : 'Optional buy';
    }
    if (opts.optionalSell) {
        const p = opts.quantForecast?.unrealizedPct;
        return Number.isFinite(p) ? `~${p >= 0 ? '+' : ''}${p}% profit · optional sell` : 'Optional sell';
    }
    return null;
}

/**
 * BUY / SELL / HOLD from ensemble vote (GBM + OU + ROC) + Wilder RSI 30/70 + SMAs.
 * OPTIONAL BUY / OPTIONAL SELL (exclusive) from the same mathematical forward model.
 * References: Wilder RSI thresholds; Kelly/ATR sizing elsewhere; ensemble majority vote.
 */
export function buildTradeSignal(stats, { preIpo = false, bars = null, weights = null } = {}) {
    const forecast = computeQuantForecast(stats, bars, weights);
    const opt = detectOptionalCue(stats, forecast);

    if (!stats || !Number.isFinite(stats.latestClose)) {
        return withOptionalFlags({
            action: 'HOLD',
            tone: 'hold',
            cardHint: 'Waiting on price data',
            meaning: 'Holding means stay on the sidelines for now. There is not enough price history yet to lean buy or sell.',
            reason: 'The app needs a full series of closes before it can score momentum and trend.'
        }, EMPTY_OPTIONAL);
    }

    if (preIpo) {
        return withOptionalFlags({
            action: 'HOLD',
            tone: 'hold',
            cardHint: 'Not listed on the PSE yet',
            meaning: 'Holding means watch and learn, not trade on the open market. This name is still in the IPO offer or pre-listing phase.',
            reason: 'There is no live PSE quote yet. Use the offer price for study, and treat the chart as practice only until listing.'
        }, EMPTY_OPTIONAL);
    }

    let score = 0;
    const bits = [];
    const last = stats.latestClose;
    let bullVotes = 0;
    let bearVotes = 0;

    // Model votes (published ensemble approach: require majority agreement)
    if (forecast.ok && forecast.predictions?.models) {
        forecast.predictions.models.forEach((m) => {
            if (!m.ok) return;
            if (m.expectedPct >= 0.5) {
                bullVotes += 1;
                score += 1;
            } else if (m.expectedPct <= -0.5) {
                bearVotes += 1;
                score -= 1;
            }
        });
        if (bullVotes || bearVotes) {
            bits.push(`models ${bullVotes}↑/${bearVotes}↓ (GBM/OU/ROC)`);
        }
        if (forecast.expectedPct >= 2) {
            score += 1;
            bits.push(`ensemble ~+${forecast.expectedPct}% / ${FORWARD_SESSIONS}S`);
        } else if (forecast.expectedPct <= -2) {
            score -= 1;
            bits.push(`ensemble ~${forecast.expectedPct}% / ${FORWARD_SESSIONS}S`);
        }
    }

    // Wilder RSI(14): oversold <30, overbought >70
    if (stats.rsi != null) {
        if (stats.rsi <= 30) {
            score += 2;
            bullVotes += 1;
            bits.push(`RSI ${stats.rsi} oversold (Wilder <30)`);
        } else if (stats.rsi >= 70) {
            score -= 2;
            bearVotes += 1;
            bits.push(`RSI ${stats.rsi} overbought (Wilder >70)`);
        } else if (stats.rsi <= 40) {
            score += 1;
            bits.push(`RSI ${stats.rsi}, soft`);
        } else if (stats.rsi >= 60) {
            score -= 1;
            bits.push(`RSI ${stats.rsi}, hot`);
        }
    }

    if (stats.sma20 != null) {
        if (last >= stats.sma20) {
            score += 1;
            bits.push('above SMA20');
        } else {
            score -= 1;
            bits.push('below SMA20');
        }
    }

    if (stats.sma50 != null) {
        if (last >= stats.sma50) {
            score += 1;
            bits.push('above SMA50');
        } else {
            score -= 1;
            bits.push('below SMA50');
        }
    }

    if (Number.isFinite(stats.pctChange)) {
        if (stats.pctChange >= 3) {
            score += 1;
            bits.push(`range +${stats.pctChange.toFixed(1)}%`);
        } else if (stats.pctChange <= -3) {
            score -= 1;
            bits.push(`range ${stats.pctChange.toFixed(1)}%`);
        }
    }

    if (
        stats.support != null &&
        stats.resistance != null &&
        stats.resistance > stats.support
    ) {
        const span = stats.resistance - stats.support;
        const pos = (last - stats.support) / span;
        if (pos <= 0.25) {
            score += 1;
            bits.push(`near support ₱${stats.support.toFixed(2)}`);
        } else if (pos >= 0.75) {
            score -= 1;
            bits.push(`near resistance ₱${stats.resistance.toFixed(2)}`);
        }
    }

    // Majority gate: need score magnitude AND at least 2 bull/bear votes for BUY/SELL
    let action = 'HOLD';
    if (score >= 2 && bullVotes >= 2) action = 'BUY';
    else if (score <= -2 && bearVotes >= 2) action = 'SELL';
    else if (score >= 3) action = 'BUY';
    else if (score <= -3) action = 'SELL';

    const why = bits.length
        ? bits.slice(0, 4).join('; ') + '.'
        : 'Mixed signals. Wait.';
    const hint = optionalHint(action, opt);
    const modelLine = forecast.ok
        ? ` Ensemble ${forecast.expectedPct >= 0 ? '+' : ''}${forecast.expectedPct}% / ${FORWARD_SESSIONS}S.`
        : '';

    if (action === 'BUY') {
        return withOptionalFlags({
            action: 'BUY',
            tone: 'buy',
            cardHint: hint || 'Ensemble leans long',
            meaning: 'Study an entry with Kelly/ATR size and an ATR trail. Practice only.',
            reason: `BUY: ${why}${modelLine}`,
            score,
            bullVotes,
            bearVotes
        }, opt);
    }

    if (action === 'SELL') {
        return withOptionalFlags({
            action: 'SELL',
            tone: 'sell',
            cardHint: hint || 'Ensemble leans short',
            meaning: 'Study tightening risk or stepping aside. Not a broker order.',
            reason: `SELL: ${why}${modelLine}`,
            score,
            bullVotes,
            bearVotes
        }, opt);
    }

    return withOptionalFlags({
        action: 'HOLD',
        tone: 'hold',
        cardHint: hint || 'No clear edge',
        meaning: 'Wait for a cleaner signal.',
        reason: `HOLD: ${why}${modelLine}`,
        score,
        bullVotes,
        bearVotes
    }, opt);
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
 * Fractional Kelly: f* = p − q/b, then × ¼ (Thorp / practical trading guidance).
 * Never use full Kelly on noisy estimates.
 */
export function fractionalKelly(winRate, avgWin, avgLoss, fraction = 0.25) {
    const p = Number(winRate);
    const aw = Number(avgWin);
    const al = Number(avgLoss);
    if (!(p > 0 && p < 1) || !(aw > 0) || !(al > 0)) return 0;
    const b = aw / al;
    const q = 1 - p;
    const full = (p * b - q) / b;
    return Math.max(0, Math.min(0.25, full * fraction));
}

/**
 * Starter size from ensemble math + ATR stop + ¼-Kelly capital fraction.
 * Position Target = shares × entry (always shown as positive capital allocation).
 * Refs: ATR risk = equity×risk% / (k×ATR); Kelly f*=p−q/b at ¼ fraction.
 */
export function suggestPurchase(
    latestClose,
    support,
    resistance,
    atrValue,
    riskPesos = 1000,
    forecastBand = null,
    opts = {}
) {
    if (!latestClose || latestClose <= 0) {
        return { entry: null, shares: null, spend: null, stop: null, note: 'Need price data first.' };
    }

    let entry = latestClose;
    if (support != null && support > 0) {
        entry = Math.min(latestClose, support + (latestClose - support) * 0.35);
        if (entry > latestClose) entry = latestClose;
        if (entry < support) entry = support;
    }
    entry = parseFloat(entry.toFixed(2));

    const atr = atrValue && atrValue > 0 ? atrValue : entry * 0.02;
    const trailMult = 1.5;
    const trailStop = parseFloat(Math.max(0.01, Math.min(entry, latestClose) - atr * trailMult).toFixed(2));
    const riskPerShare = Math.max(entry - trailStop, entry * 0.01);

    // Ensemble edge → Kelly inputs
    const bars = opts.bars || null;
    const weights = opts.weights || CONFIG.modelWeights || DEFAULT_MODEL_WEIGHTS;
    const pred = bars?.length
        ? buildTradingPredictions(bars, FORWARD_SESSIONS, { weights })
        : (forecastBand && Number.isFinite(forecastBand.expectedPct)
            ? { ok: true, expectedPct: forecastBand.expectedPct, hitRates: null, high: forecastBand.high, low: forecastBand.low }
            : null);

    let winRate = 0.52;
    let avgWin = atr * 1.2;
    let avgLoss = riskPerShare;
    if (pred?.ok) {
        const hit = pred.hitRates?.overall;
        if (Number.isFinite(hit)) winRate = Math.min(0.72, Math.max(0.35, hit / 100));
        const upside = Number.isFinite(pred.high)
            ? Math.max(atr * 0.5, pred.high - entry)
            : Math.max(atr, entry * Math.abs(pred.expectedPct || 1) / 100);
        avgWin = upside;
        avgLoss = riskPerShare;
    }

    const kellyF = fractionalKelly(winRate, avgWin, avgLoss, 0.25);
    const capital = Math.max(riskPesos * 20, riskPesos); // implied practice book (~5% risk unit)
    const kellyRiskBudget = Math.max(riskPesos * 0.5, capital * kellyF);
    const atrShares = Math.max(1, Math.floor(Math.max(riskPesos, kellyRiskBudget) / riskPerShare));
    const kellyShares = kellyF > 0
        ? Math.max(1, Math.floor((capital * kellyF) / entry))
        : atrShares;
    // Blend ATR risk shares with Kelly notional; cap so spend stays sensible
    let shares = Math.max(1, Math.round((atrShares * 0.6 + kellyShares * 0.4)));
    const maxSpend = capital * 0.25;
    if (shares * entry > maxSpend) shares = Math.max(1, Math.floor(maxSpend / entry));
    const spend = parseFloat((shares * entry).toFixed(2));

    let takeProfits = null;
    const band = forecastBand || (pred?.ok ? { low: pred.low, high: pred.high } : null);
    if (band && Number.isFinite(band.low) && Number.isFinite(band.high)) {
        const lo = Math.min(band.low, band.high);
        const hi = Math.max(band.low, band.high);
        const span = Math.max(hi - lo, entry * 0.005);
        takeProfits = [
            parseFloat((entry + span * 0.35).toFixed(2)),
            parseFloat((entry + span * 0.65).toFixed(2)),
            parseFloat(hi.toFixed(2))
        ];
    }

    return {
        entry,
        shares,
        spend,
        stop: trailStop,
        trailStop,
        trailMult,
        atr: parseFloat(atr.toFixed(4)),
        takeProfits,
        riskPesos,
        kellyFraction: parseFloat((kellyF * 100).toFixed(2)),
        winRate: parseFloat((winRate * 100).toFixed(1)),
        method: '¼-Kelly × ATR stop',
        note: `¼-Kelly ${ (kellyF * 100).toFixed(1) }% · ATR trail ${trailMult}× · win~${(winRate * 100).toFixed(0)}%`
    };
}
