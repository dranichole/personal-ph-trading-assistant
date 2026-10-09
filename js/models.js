/**
 * Strict mathematical models used for stock study forecasts.
 * Formulas follow common quant / trading references:
 * - Geometric Brownian Motion (GBM): ΔS/S = μΔt + σϵ√Δt
 *   (e.g. Investopedia Monte Carlo / GBM; Black–Scholes stock process)
 * - Mean reversion toward a moving average (Ornstein–Uhlenbeck style on the gap)
 * - Momentum / rate-of-change extrapolation of past returns
 *
 * Educational only. Not financial advice.
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
    const slice = values.slice(-period);
    return mean(slice);
}

function logReturns(closes) {
    const out = [];
    for (let i = 1; i < closes.length; i++) {
        const a = closes[i - 1];
        const b = closes[i];
        if (a > 0 && b > 0) out.push(Math.log(b / a));
    }
    return out;
}

function simpleReturns(closes) {
    const out = [];
    for (let i = 1; i < closes.length; i++) {
        const a = closes[i - 1];
        const b = closes[i];
        if (a > 0 && Number.isFinite(b)) out.push((b - a) / a);
    }
    return out;
}

/**
 * Geometric Brownian Motion expected path.
 * With μ = mean simple return / day and σ = stdev of simple returns:
 *   E[S_t] ≈ S_0 * (1 + μ)^t
 * Log-space band (common GBM presentation):
 *   S_0 * exp( (μ_log)*t ± z * σ_log * √t )
 * where μ_log = mean(log returns), σ_log = stdev(log returns).
 */
export function geometricBrownianMotionForecast(closes, horizonDays, z = 1) {
    const S0 = closes[closes.length - 1];
    const logs = logReturns(closes);
    const simple = simpleReturns(closes);
    if (!Number.isFinite(S0) || S0 <= 0 || logs.length < 15) {
        return { ok: false, name: 'Geometric Brownian Motion', note: 'Need ≥16 closes for GBM.' };
    }

    const muLog = mean(logs) ?? 0;
    const sigmaLog = stdev(logs) ?? 0;
    const muSimple = mean(simple) ?? 0;
    const T = Math.max(1, horizonDays);

    // E[S_t] under GBM with drift μ from simple returns: S0 * exp(μ_simple * t) ≈ S0*(1+μ)^t for small μ
    const expected = S0 * Math.exp(muSimple * T);
    // Classical log-normal band around the GBM log-mean
    const logMean = Math.log(S0) + muLog * T;
    const half = z * sigmaLog * Math.sqrt(T);
    const low = Math.exp(logMean - half);
    const high = Math.exp(logMean + half);

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
        name: 'Geometric Brownian Motion',
        formula: 'ΔS/S = μΔt + σϵ√Δt · E[S_t] ≈ S₀·e^(μt) · band: S₀·exp(μ_log·t ± z·σ_log·√t)',
        reference: 'GBM / Monte Carlo stock path (Investopedia; Black–Scholes process)',
        S0: parseFloat(S0.toFixed(4)),
        muDaily: parseFloat(muSimple.toFixed(6)),
        sigmaDaily: parseFloat(sigmaLog.toFixed(6)),
        horizonDays: T,
        expected: parseFloat(expected.toFixed(4)),
        low: parseFloat(low.toFixed(4)),
        high: parseFloat(high.toFixed(4)),
        expectedPct: parseFloat((((expected - S0) / S0) * 100).toFixed(2)),
        path
    };
}

/**
 * Mean reversion toward SMA (OU-style on the price gap).
 * Gap X_t = S_t − SMA
 * AR(1): X_{t+1} = φ X_t + ε  ⇒  κ = −ln(φ)  (when 0 < φ < 1)
 * E[S_T] = SMA + (S_0 − SMA)·e^(−κT)
 */
export function meanReversionForecast(closes, horizonDays, smaPeriod = 20) {
    const S0 = closes[closes.length - 1];
    const m = smaLast(closes, smaPeriod);
    if (!Number.isFinite(S0) || S0 <= 0 || m == null || closes.length < smaPeriod + 10) {
        return { ok: false, name: 'Mean reversion (OU / SMA)', note: 'Need enough closes for SMA + AR(1).' };
    }

    const gaps = [];
    for (let i = smaPeriod - 1; i < closes.length; i++) {
        const window = closes.slice(i - smaPeriod + 1, i + 1);
        const sma = mean(window);
        gaps.push(closes[i] - sma);
    }

    // Estimate φ from AR(1) on gaps: X_t = φ X_{t-1}
    let num = 0;
    let den = 0;
    for (let i = 1; i < gaps.length; i++) {
        num += gaps[i] * gaps[i - 1];
        den += gaps[i - 1] * gaps[i - 1];
    }
    let phi = den > 0 ? num / den : 0.9;
    phi = Math.min(0.99, Math.max(0.05, phi));
    const kappa = -Math.log(phi);
    const T = Math.max(1, horizonDays);
    const X0 = S0 - m;
    const expected = m + X0 * Math.exp(-kappa * T);
    const gapSigma = stdev(gaps) ?? Math.abs(X0) * 0.5;
    const half = gapSigma * Math.sqrt(Math.max(0.05, 1 - Math.exp(-2 * kappa * T)) / (2 * kappa || 1));

    const path = [];
    for (let t = 1; t <= T; t++) {
        const mid = m + X0 * Math.exp(-kappa * t);
        const h = gapSigma * Math.sqrt(Math.max(0.05, 1 - Math.exp(-2 * kappa * t)) / (2 * kappa || 1));
        path.push({
            t,
            expected: parseFloat(mid.toFixed(4)),
            low: parseFloat((mid - h).toFixed(4)),
            high: parseFloat((mid + h).toFixed(4))
        });
    }

    const zScore = gapSigma > 0 ? X0 / gapSigma : 0;

    return {
        ok: true,
        id: 'meanReversion',
        name: 'Mean reversion (OU → SMA)',
        formula: 'X=S−SMA · X_{t+1}=φX_t+ε · κ=−ln(φ) · E[S_T]=SMA+(S₀−SMA)e^(−κT)',
        reference: 'Ornstein–Uhlenbeck / mean-reversion trading (stat-arb S-score family)',
        S0: parseFloat(S0.toFixed(4)),
        meanLevel: parseFloat(m.toFixed(4)),
        phi: parseFloat(phi.toFixed(4)),
        kappa: parseFloat(kappa.toFixed(4)),
        zScore: parseFloat(zScore.toFixed(2)),
        horizonDays: T,
        expected: parseFloat(expected.toFixed(4)),
        low: parseFloat((expected - half).toFixed(4)),
        high: parseFloat((expected + half).toFixed(4)),
        expectedPct: parseFloat((((expected - S0) / S0) * 100).toFixed(2)),
        path
    };
}

/**
 * Momentum / rate-of-change projection.
 * ROC_n = (S_t − S_{t−n}) / S_{t−n}
 * Projected: S_T = S_0 · (1 + ROC_n)^(T/n)
 */
export function momentumForecast(closes, horizonDays, lookback = 22) {
    const S0 = closes[closes.length - 1];
    const n = Math.min(lookback, closes.length - 1);
    if (!Number.isFinite(S0) || S0 <= 0 || n < 5) {
        return { ok: false, name: 'Momentum (ROC)', note: 'Need a longer lookback for ROC.' };
    }
    const Sback = closes[closes.length - 1 - n];
    if (!(Sback > 0)) {
        return { ok: false, name: 'Momentum (ROC)', note: 'Invalid lookback price.' };
    }

    const roc = (S0 - Sback) / Sback;
    const T = Math.max(1, horizonDays);
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
        name: 'Momentum (rate of change)',
        formula: 'ROC_n=(S_t−S_{t−n})/S_{t−n} · S_T=S₀·(1+ROC_n)^(T/n)',
        reference: 'Momentum / trend-following on past returns (quant momentum strategies)',
        S0: parseFloat(S0.toFixed(4)),
        lookback: n,
        roc: parseFloat((roc * 100).toFixed(2)),
        horizonDays: T,
        expected: parseFloat(expected.toFixed(4)),
        low: parseFloat(Math.max(0.01, expected - half).toFixed(4)),
        high: parseFloat((expected + half).toFixed(4)),
        expectedPct: parseFloat((((expected - S0) / S0) * 100).toFixed(2)),
        path
    };
}

/**
 * Equal-weight ensemble of GBM + mean reversion + momentum (strict model outputs only).
 */
export function buildTradingPredictions(bars, horizonDays = 22) {
    const closes = (bars || [])
        .map(b => Number(b?.close ?? b))
        .filter(c => Number.isFinite(c) && c > 0);

    const T = Math.max(1, Number(horizonDays) || 22);
    const gbm = geometricBrownianMotionForecast(closes, T);
    const mr = meanReversionForecast(closes, T, 20);
    const mom = momentumForecast(closes, T, Math.min(22, Math.max(5, closes.length - 1)));

    const okModels = [gbm, mr, mom].filter(m => m.ok);
    if (!okModels.length) {
        return {
            ok: false,
            note: 'Need more historical closes to run GBM, mean reversion, and momentum.',
            models: [gbm, mr, mom],
            horizonDays: T
        };
    }

    const S0 = closes[closes.length - 1];
    const expected = mean(okModels.map(m => m.expected));
    const low = mean(okModels.map(m => m.low));
    const high = mean(okModels.map(m => m.high));
    const expectedPct = ((expected - S0) / S0) * 100;

    const pathLen = Math.min(...okModels.map(m => m.path.length));
    const ensemblePath = [];
    for (let i = 0; i < pathLen; i++) {
        ensemblePath.push({
            t: i + 1,
            expected: parseFloat(mean(okModels.map(m => m.path[i].expected)).toFixed(4)),
            low: parseFloat(mean(okModels.map(m => m.path[i].low)).toFixed(4)),
            high: parseFloat(mean(okModels.map(m => m.path[i].high)).toFixed(4))
        });
    }

    const labels = [];
    const hist = closes.slice(-Math.min(60, closes.length));
    for (let i = 0; i < hist.length; i++) {
        labels.push(i === hist.length - 1 ? 'Now' : `H-${hist.length - 1 - i}`);
    }
    for (let t = 1; t <= pathLen; t++) {
        labels.push(`+${t}d`);
    }

    const historySeries = [...hist.map(c => parseFloat(c.toFixed(4))), ...Array(pathLen).fill(null)];
    const pad = Array(hist.length - 1).fill(null).concat([hist[hist.length - 1]]);
    const forecastMid = [...pad, ...ensemblePath.map(p => p.expected)];
    const forecastLow = [...pad, ...ensemblePath.map(p => p.low)];
    const forecastHigh = [...pad, ...ensemblePath.map(p => p.high)];

    // Align forecast series length with labels
    while (forecastMid.length < labels.length) forecastMid.push(null);
    while (forecastLow.length < labels.length) forecastLow.push(null);
    while (forecastHigh.length < labels.length) forecastHigh.push(null);
    while (historySeries.length < labels.length) historySeries.push(null);

    return {
        ok: true,
        S0: parseFloat(S0.toFixed(4)),
        horizonDays: T,
        expected: parseFloat(expected.toFixed(4)),
        low: parseFloat(low.toFixed(4)),
        high: parseFloat(high.toFixed(4)),
        expectedPct: parseFloat(expectedPct.toFixed(2)),
        models: [gbm, mr, mom],
        ensemblePath,
        chart: {
            labels,
            history: historySeries,
            forecast: forecastMid,
            bandLow: forecastLow,
            bandHigh: forecastHigh
        },
        method:
            'Equal-weight ensemble of Geometric Brownian Motion, OU mean reversion to SMA20, and ROC momentum'
    };
}
