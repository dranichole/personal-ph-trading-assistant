/**
 * Strict trading math models for short-horizon study forecasts.
 * GBM, OU mean reversion, ROC momentum, VWAP / volume confirm, ATR risk.
 * Educational only.
 */

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

function smaLast(values, period) {
    if (values.length < period) return null;
    return mean(values.slice(-period));
}

function logReturns(closes) {
    const out = [];
    for (let i = 1; i < closes.length; i++) {
        if (closes[i - 1] > 0 && closes[i] > 0) out.push(Math.log(closes[i] / closes[i - 1]));
    }
    return out;
}

function simpleReturns(closes) {
    const out = [];
    for (let i = 1; i < closes.length; i++) {
        if (closes[i - 1] > 0 && Number.isFinite(closes[i])) {
            out.push((closes[i] - closes[i - 1]) / closes[i - 1]);
        }
    }
    return out;
}

/**
 * Build denser session series from daily OHLC when true intraday is unavailable.
 * Order: open → high → low → close (volume split evenly).
 */
export function expandToSessionBars(bars) {
    const out = [];
    for (const b of bars || []) {
        const o = Number(b.open);
        const h = Number(b.high);
        const l = Number(b.low);
        const c = Number(b.close);
        const vol = Number(b.volume) || 0;
        if (![o, h, l, c].every(x => Number.isFinite(x) && x > 0)) {
            if (Number.isFinite(c) && c > 0) {
                out.push({
                    open: c, high: c, low: c, close: c, volume: vol,
                    date: b.date, timestamp: b.timestamp, session: true
                });
            }
            continue;
        }
        const slice = vol / 4;
        const stamp = Number(b.timestamp) || 0;
        const pts = [
            { px: o, tag: 'o' },
            { px: h, tag: 'h' },
            { px: l, tag: 'l' },
            { px: c, tag: 'c' }
        ];
        pts.forEach((p, i) => {
            out.push({
                open: p.px,
                high: p.px,
                low: p.px,
                close: p.px,
                volume: slice,
                date: `${b.date || ''}${p.tag}`,
                timestamp: stamp ? stamp + i * 900 : undefined,
                session: true,
                parentDate: b.date
            });
        });
    }
    return out;
}

export function geometricBrownianMotionForecast(closes, sessions, z = 1) {
    const S0 = closes[closes.length - 1];
    const logs = logReturns(closes);
    const simple = simpleReturns(closes);
    if (!Number.isFinite(S0) || S0 <= 0 || logs.length < 8) {
        return { ok: false, id: 'gbm', name: 'GBM', note: 'Need more closes.' };
    }

    const muLog = mean(logs) ?? 0;
    const sigmaLog = stdev(logs) ?? 0;
    const muSimple = mean(simple) ?? 0;
    const T = Math.max(1, sessions);
    const expected = S0 * Math.exp(muSimple * T);
    const logMean = Math.log(S0) + muLog * T;
    const half = z * sigmaLog * Math.sqrt(T);

    const path = [];
    for (let t = 1; t <= T; t++) {
        const mid = S0 * Math.exp(muSimple * t);
        const lm = Math.log(S0) + muLog * t;
        const h = z * sigmaLog * Math.sqrt(t);
        path.push({
            t,
            expected: parseFloat(mid.toFixed(4)),
            low: parseFloat(Math.exp(lm - h).toFixed(4)),
            high: parseFloat(Math.exp(lm + h).toFixed(4))
        });
    }

    return {
        ok: true,
        id: 'gbm',
        name: 'GBM',
        formula: 'ΔS/S = μΔt + σϵ√Δt',
        tip: 'Geometric Brownian Motion path and ±1σ log band.',
        S0: parseFloat(S0.toFixed(4)),
        muDaily: parseFloat(muSimple.toFixed(6)),
        sigmaDaily: parseFloat(sigmaLog.toFixed(6)),
        sessions: T,
        expected: parseFloat(expected.toFixed(4)),
        low: parseFloat(Math.exp(logMean - half).toFixed(4)),
        high: parseFloat(Math.exp(logMean + half).toFixed(4)),
        expectedPct: parseFloat((((expected - S0) / S0) * 100).toFixed(2)),
        path
    };
}

/**
 * OU / SMA mean reversion with adaptive SMA length so short series still compute.
 */
export function meanReversionForecast(closes, sessions, preferredPeriod = 20) {
    const S0 = closes[closes.length - 1];
    if (!Number.isFinite(S0) || S0 <= 0 || closes.length < 10) {
        return { ok: false, id: 'meanReversion', name: 'Mean rev', note: 'Need ≥10 closes.' };
    }

    const smaPeriod = Math.max(5, Math.min(preferredPeriod, Math.floor((closes.length - 4) / 2)));
    const m = smaLast(closes, smaPeriod);
    if (m == null || closes.length < smaPeriod + 4) {
        return { ok: false, id: 'meanReversion', name: 'Mean rev', note: 'Need more closes for SMA + AR(1).' };
    }

    const gaps = [];
    for (let i = smaPeriod - 1; i < closes.length; i++) {
        gaps.push(closes[i] - mean(closes.slice(i - smaPeriod + 1, i + 1)));
    }

    let num = 0;
    let den = 0;
    for (let i = 1; i < gaps.length; i++) {
        num += gaps[i] * gaps[i - 1];
        den += gaps[i - 1] * gaps[i - 1];
    }
    let phi = den > 0 ? num / den : 0.85;
    phi = Math.min(0.99, Math.max(0.05, phi));
    const kappa = -Math.log(phi);
    const T = Math.max(1, sessions);
    const X0 = S0 - m;
    const expected = m + X0 * Math.exp(-kappa * T);
    const gapSigma = stdev(gaps) ?? (Math.abs(X0) * 0.5 || S0 * 0.01);
    const bandFactor = (t) =>
        gapSigma * Math.sqrt(Math.max(0.05, 1 - Math.exp(-2 * kappa * t)) / (2 * Math.max(kappa, 1e-6)));

    const path = [];
    for (let t = 1; t <= T; t++) {
        const mid = m + X0 * Math.exp(-kappa * t);
        const h = bandFactor(t);
        path.push({
            t,
            expected: parseFloat(mid.toFixed(4)),
            low: parseFloat((mid - h).toFixed(4)),
            high: parseFloat((mid + h).toFixed(4))
        });
    }

    const half = bandFactor(T);
    const zScore = gapSigma > 0 ? X0 / gapSigma : 0;

    return {
        ok: true,
        id: 'meanReversion',
        name: 'Mean rev',
        formula: `E[S]=SMA+(S−SMA)e^(−κT) · SMA${smaPeriod}`,
        tip: `OU gap to SMA${smaPeriod}. φ=${phi.toFixed(2)}, κ=${kappa.toFixed(2)}.`,
        S0: parseFloat(S0.toFixed(4)),
        meanLevel: parseFloat(m.toFixed(4)),
        smaPeriod,
        phi: parseFloat(phi.toFixed(4)),
        kappa: parseFloat(kappa.toFixed(4)),
        zScore: parseFloat(zScore.toFixed(2)),
        sessions: T,
        expected: parseFloat(expected.toFixed(4)),
        low: parseFloat((expected - half).toFixed(4)),
        high: parseFloat((expected + half).toFixed(4)),
        expectedPct: parseFloat((((expected - S0) / S0) * 100).toFixed(2)),
        path
    };
}

export function momentumForecast(closes, sessions, lookback = 20) {
    const S0 = closes[closes.length - 1];
    const n = Math.min(lookback, closes.length - 1);
    if (!Number.isFinite(S0) || S0 <= 0 || n < 3) {
        return { ok: false, id: 'momentum', name: 'Momentum', note: 'Need more closes.' };
    }
    const Sback = closes[closes.length - 1 - n];
    if (!(Sback > 0)) {
        return { ok: false, id: 'momentum', name: 'Momentum', note: 'Bad lookback.' };
    }

    const roc = (S0 - Sback) / Sback;
    const T = Math.max(1, sessions);
    const expected = S0 * Math.pow(1 + roc, T / n);
    const rets = simpleReturns(closes.slice(-(n + 1)));
    const sigma = stdev(rets) ?? Math.abs(roc) / Math.sqrt(n);
    const half = S0 * sigma * Math.sqrt(T);

    const path = [];
    for (let t = 1; t <= T; t++) {
        const mid = S0 * Math.pow(1 + roc, t / n);
        const h = S0 * sigma * Math.sqrt(t);
        path.push({
            t,
            expected: parseFloat(mid.toFixed(4)),
            low: parseFloat(Math.max(0.01, mid - h).toFixed(4)),
            high: parseFloat((mid + h).toFixed(4))
        });
    }

    return {
        ok: true,
        id: 'momentum',
        name: 'Momentum',
        formula: 'ROC_n · S_T=S₀(1+ROC)^(T/n)',
        tip: `${n}-bar rate of change projected ${T} session(s).`,
        S0: parseFloat(S0.toFixed(4)),
        lookback: n,
        roc: parseFloat((roc * 100).toFixed(2)),
        sessions: T,
        expected: parseFloat(expected.toFixed(4)),
        low: parseFloat(Math.max(0.01, expected - half).toFixed(4)),
        high: parseFloat((expected + half).toFixed(4)),
        expectedPct: parseFloat((((expected - S0) / S0) * 100).toFixed(2)),
        path
    };
}

/** Session VWAP + volume vs average (momentum backing). */
export function volumeAnalytics(bars, lookback = 20) {
    const list = (bars || []).filter(b => Number(b.close) > 0);
    if (list.length < 5) {
        return { ok: false, note: 'Need volume bars.' };
    }

    let pv = 0;
    let vv = 0;
    const window = list.slice(-Math.min(lookback, list.length));
    window.forEach(b => {
        const h = Number(b.high);
        const l = Number(b.low);
        const c = Number(b.close);
        const typical = [h, l, c].every(x => Number.isFinite(x))
            ? (h + l + c) / 3
            : c;
        const vol = Math.max(0, Number(b.volume) || 0);
        pv += typical * vol;
        vv += vol;
    });

    const vwap = vv > 0 ? pv / vv : Number(list[list.length - 1].close);
    const last = Number(list[list.length - 1].close);
    const vols = list.map(b => Number(b.volume) || 0);
    const avgVol = mean(vols.slice(-lookback)) || 0;
    const lastVol = vols[vols.length - 1] || 0;
    const volRatio = avgVol > 0 ? lastVol / avgVol : 0;
    const aboveVwap = last >= vwap;
    const backed = volRatio >= 1.0;
    const thin = volRatio > 0 && volRatio < 0.6;

    let label = 'Neutral volume';
    if (backed && aboveVwap) label = 'Volume backs upside';
    else if (backed && !aboveVwap) label = 'Volume on weakness';
    else if (thin) label = 'Thin liquidity';

    return {
        ok: true,
        vwap: parseFloat(vwap.toFixed(4)),
        last,
        vsVwapPct: parseFloat((((last - vwap) / vwap) * 100).toFixed(2)),
        volRatio: parseFloat(volRatio.toFixed(2)),
        avgVol: Math.round(avgVol),
        lastVol: Math.round(lastVol),
        aboveVwap,
        backed,
        thin,
        label,
        tip: 'VWAP = Σ(typical×vol)/Σvol. Ratio = last vol ÷ avg vol.'
    };
}

/** ATR trailing stop + TP1/TP2/TP3 across forecast band. */
export function buildRiskPlan(bars, forecast, atrValue) {
    const last = Number(bars?.[bars.length - 1]?.close);
    if (!Number.isFinite(last) || last <= 0 || !forecast?.ok) {
        return { ok: false };
    }

    const atr = Number(atrValue) > 0
        ? Number(atrValue)
        : Math.max(last * 0.015, Math.abs(forecast.high - forecast.low) / 4);
    const trailMult = 1.5;
    const trailStop = parseFloat(Math.max(0.01, last - atr * trailMult).toFixed(2));

    const lo = Math.min(forecast.low, forecast.expected, forecast.high);
    const hi = Math.max(forecast.low, forecast.expected, forecast.high);
    const span = Math.max(hi - lo, last * 0.005);
    const tp1 = parseFloat((lo + span * 0.35).toFixed(2));
    const tp2 = parseFloat((lo + span * 0.65).toFixed(2));
    const tp3 = parseFloat(hi.toFixed(2));

    // Order TPs above last when bullish; mirror when bearish
    let tps = [tp1, tp2, tp3].sort((a, b) => a - b);
    if (forecast.expectedPct >= 0) {
        tps = tps.map(p => Math.max(p, last));
        if (tps[0] <= last) tps[0] = parseFloat((last + span * 0.25).toFixed(2));
        if (tps[1] <= tps[0]) tps[1] = parseFloat((tps[0] + span * 0.25).toFixed(2));
        if (tps[2] <= tps[1]) tps[2] = parseFloat((tps[1] + span * 0.25).toFixed(2));
    } else {
        tps = tps.map(p => Math.min(p, last));
    }

    return {
        ok: true,
        atr: parseFloat(atr.toFixed(4)),
        trailMult,
        trailStop,
        takeProfits: [
            { id: 'TP1', price: tps[0] },
            { id: 'TP2', price: tps[1] },
            { id: 'TP3', price: tps[2] }
        ],
        bandLow: parseFloat(lo.toFixed(2)),
        bandHigh: parseFloat(hi.toFixed(2)),
        tip: `Trail = last − ${trailMult}×ATR. TPs span the forecast band.`
    };
}

/** Default ensemble mix (trending markets lean momentum). */
export const DEFAULT_MODEL_WEIGHTS = {
    gbm: 20,
    meanReversion: 30,
    momentum: 50
};

function normalizeUserWeights(raw) {
    const src = raw && typeof raw === 'object' ? raw : DEFAULT_MODEL_WEIGHTS;
    const gbm = Math.max(0, Number(src.gbm) || 0);
    const meanReversion = Math.max(0, Number(src.meanReversion) || 0);
    const momentum = Math.max(0, Number(src.momentum) || 0);
    const sum = gbm + meanReversion + momentum;
    if (sum <= 0) return { ...DEFAULT_MODEL_WEIGHTS };
    return {
        gbm: (gbm / sum) * 100,
        meanReversion: (meanReversion / sum) * 100,
        momentum: (momentum / sum) * 100
    };
}

/**
 * Walk-forward hit rate: fraction of days where next close landed inside the
 * model's ±1σ (or band) forecast from the prior window. Educational accuracy score.
 */
export function scoreModelHitRates(bars, { lookback = 30, sessions = 3 } = {}) {
    const daily = (bars || []).filter((b) => Number(b?.close) > 0);
    const ids = ['gbm', 'meanReversion', 'momentum'];
    const hits = { gbm: 0, meanReversion: 0, momentum: 0 };
    const trials = { gbm: 0, meanReversion: 0, momentum: 0 };
    if (daily.length < lookback + sessions + 12) {
        return {
            ok: false,
            note: 'Need ~60+ sessions for hit-rate scoring.',
            scores: ids.map((id) => ({ id, pct: null, trials: 0 })),
            overall: null
        };
    }

    const start = Math.max(20, daily.length - lookback - sessions);
    for (let i = start; i < daily.length - sessions; i++) {
        const window = daily.slice(0, i + 1);
        const closes = window.map((b) => Number(b.close));
        const actual = Number(daily[i + sessions].close);
        if (!(actual > 0)) continue;
        const models = [
            geometricBrownianMotionForecast(closes, sessions),
            meanReversionForecast(closes, sessions, 20),
            momentumForecast(closes, sessions, Math.min(20, Math.max(4, Math.floor(closes.length / 3))))
        ];
        models.forEach((m) => {
            if (!m.ok) return;
            trials[m.id] += 1;
            const lo = Math.min(m.low, m.high);
            const hi = Math.max(m.low, m.high);
            if (actual >= lo && actual <= hi) hits[m.id] += 1;
        });
    }

    const scores = ids.map((id) => ({
        id,
        name: id === 'gbm' ? 'GBM' : id === 'meanReversion' ? 'Mean rev' : 'Momentum',
        pct: trials[id] ? parseFloat(((hits[id] / trials[id]) * 100).toFixed(1)) : null,
        trials: trials[id],
        hits: hits[id]
    }));
    const usable = scores.filter((s) => s.trials > 0);
    const overall = usable.length
        ? parseFloat((usable.reduce((a, s) => a + s.pct, 0) / usable.length).toFixed(1))
        : null;
    return { ok: overall != null, scores, overall, lookback, sessions };
}

/**
 * Short-horizon ensemble (1–5 sessions) on session-expanded bars.
 * @param {object} [opts]
 * @param {{ gbm?: number, meanReversion?: number, momentum?: number }} [opts.weights]
 */
export function buildTradingPredictions(bars, sessions = 3, opts = {}) {
    const daily = (bars || []).filter(b => Number(b?.close) > 0);
    const sessionBars = expandToSessionBars(daily);
    const series = sessionBars.length >= 24 ? sessionBars : daily;
    const closes = series.map(b => Number(b.close)).filter(c => Number.isFinite(c) && c > 0);

    const T = Math.min(5, Math.max(1, Number(sessions) || 3));
    const gbm = geometricBrownianMotionForecast(closes, T);
    const mr = meanReversionForecast(closes, T, 20);
    const momLookback = Math.min(20, Math.max(4, Math.floor(closes.length / 3)));
    const mom = momentumForecast(closes, T, momLookback);
    const volume = volumeAnalytics(series.length >= 10 ? series : daily, 20);
    const userW = normalizeUserWeights(opts.weights);
    const hitRates = scoreModelHitRates(daily, { lookback: 30, sessions: Math.min(T, 3) });

    const okModels = [gbm, mr, mom].filter(m => m.ok);
    if (!okModels.length) {
        return {
            ok: false,
            note: 'Need more history for models.',
            models: [gbm, mr, mom],
            volume,
            sessions: T,
            weights: userW,
            hitRates,
            usedSessionProxy: series === sessionBars
        };
    }

    // User sliders × volume confirmation (thin liquidity dampens momentum)
    const weights = okModels.map(m => {
        let w = (userW[m.id] ?? 33) / 100;
        if (m.id === 'momentum' && volume.ok && volume.thin) w *= 0.35;
        if (m.id === 'momentum' && volume.ok && volume.backed) w *= 1.25;
        return Math.max(0.01, w);
    });
    const wSum = weights.reduce((a, b) => a + b, 0);

    const wavg = (pick) =>
        okModels.reduce((s, m, i) => s + pick(m) * weights[i], 0) / wSum;

    const S0 = closes[closes.length - 1];
    const expected = wavg(m => m.expected);
    const low = wavg(m => m.low);
    const high = wavg(m => m.high);
    const expectedPct = ((expected - S0) / S0) * 100;

    const pathLen = Math.min(...okModels.map(m => m.path.length));
    const ensemblePath = [];
    for (let i = 0; i < pathLen; i++) {
        ensemblePath.push({
            t: i + 1,
            expected: parseFloat(wavg(m => m.path[i].expected).toFixed(4)),
            low: parseFloat(wavg(m => m.path[i].low).toFixed(4)),
            high: parseFloat(wavg(m => m.path[i].high).toFixed(4))
        });
    }

    const hist = closes.slice(-Math.min(40, closes.length));
    const labels = hist.map((_, i) => (i === hist.length - 1 ? 'Now' : ''));
    for (let t = 1; t <= pathLen; t++) labels.push(`+${t}S`);

    const historySeries = [...hist.map(c => parseFloat(c.toFixed(4))), ...Array(pathLen).fill(null)];
    const pad = Array(hist.length - 1).fill(null).concat([hist[hist.length - 1]]);
    const forecastMid = [...pad, ...ensemblePath.map(p => p.expected)];
    const forecastLow = [...pad, ...ensemblePath.map(p => p.low)];
    const forecastHigh = [...pad, ...ensemblePath.map(p => p.high)];

    const forecast = {
        ok: true,
        expected: parseFloat(expected.toFixed(4)),
        low: parseFloat(low.toFixed(4)),
        high: parseFloat(high.toFixed(4)),
        expectedPct: parseFloat(expectedPct.toFixed(2))
    };

    // ATR from daily bars when possible
    let atr = null;
    if (daily.length >= 15) {
        const trs = [];
        for (let i = 1; i < daily.length; i++) {
            const cur = daily[i];
            const prev = daily[i - 1];
            const h = Number(cur.high) || Number(cur.close);
            const l = Number(cur.low) || Number(cur.close);
            const pc = Number(prev.close);
            trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
        }
        atr = mean(trs.slice(-14));
    }

    const risk = buildRiskPlan(daily.length ? daily : series, forecast, atr);

    return {
        ok: true,
        S0: parseFloat(S0.toFixed(4)),
        sessions: T,
        expected: forecast.expected,
        low: forecast.low,
        high: forecast.high,
        expectedPct: forecast.expectedPct,
        models: [gbm, mr, mom],
        volume,
        risk,
        ensemblePath,
        weights: userW,
        hitRates,
        usedSessionProxy: series !== daily && series === sessionBars,
        chart: {
            labels,
            history: historySeries,
            forecast: forecastMid,
            bandLow: forecastLow,
            bandHigh: forecastHigh
        },
        method: 'GBM + OU mean rev + ROC · custom weights · VWAP/volume · 1–5 sessions'
    };
}

/**
 * Expand daily OHLC into synthetic 4H / 1H bars for multi-timeframe chart study
 * when a true intraday feed is unavailable.
 */
export function expandIntradayBars(bars, timeframe = '1D') {
    const daily = (bars || []).filter((b) => Number(b?.close) > 0);
    if (timeframe === '1D' || !daily.length) return daily;

    const slots = timeframe === '1H' ? 8 : 2; // PSE ~8h / 4h blocks
    const out = [];
    daily.forEach((b) => {
        const o = Number(b.open) || Number(b.close);
        const h = Number(b.high) || o;
        const l = Number(b.low) || o;
        const c = Number(b.close);
        const vol = (Number(b.volume) || 0) / slots;
        const stamp = Number(b.timestamp) || 0;
        for (let i = 0; i < slots; i++) {
            const t = i / (slots - 1 || 1);
            // Path open → high → low → close approximation across slots
            let px;
            if (i === 0) px = o;
            else if (i === slots - 1) px = c;
            else if (i < slots / 2) px = o + (h - o) * (i / (slots / 2));
            else px = h - (h - l) * ((i - slots / 2) / (slots / 2));
            const hi = Math.max(px, i === 0 ? o : out.length ? out[out.length - 1].close : o);
            const lo = Math.min(px, i === 0 ? o : out.length ? out[out.length - 1].close : o);
            out.push({
                open: parseFloat((i === 0 ? o : out[out.length - 1].close).toFixed(4)),
                high: parseFloat(Math.max(hi, px, h * 0.998 + px * 0.002).toFixed(4)),
                low: parseFloat(Math.min(lo, px, l * 0.998 + px * 0.002).toFixed(4)),
                close: parseFloat(px.toFixed(4)),
                volume: vol,
                date: `${b.date || ''}·${timeframe}${i + 1}`,
                timestamp: stamp ? stamp + i * (timeframe === '1H' ? 3600 : 14400) : undefined,
                syntheticTf: timeframe
            });
        }
    });
    return out;
}
