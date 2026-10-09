/**
 * Intraday metrics: Session VWAP, EMA 9/21, ATR, Hull MA, Volume Delta.
 */

function emaSeries(values, period) {
    const out = new Array(values.length).fill(null);
    if (values.length < period) return out;
    const k = 2 / (period + 1);
    let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    out[period - 1] = prev;
    for (let i = period; i < values.length; i++) {
        prev = values[i] * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
}

function wma(values, period) {
    const out = new Array(values.length).fill(null);
    const denom = (period * (period + 1)) / 2;
    for (let i = period - 1; i < values.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) sum += values[i - period + 1 + j] * (j + 1);
        out[i] = sum / denom;
    }
    return out;
}

/** Hull Moving Average — reduces lag vs SMA/EMA for short-term work. */
export function hullMovingAverage(values, period = 16) {
    const half = Math.max(1, Math.floor(period / 2));
    const sqrt = Math.max(1, Math.round(Math.sqrt(period)));
    const wmaFull = wma(values, period);
    const wmaHalf = wma(values, half);
    const raw = values.map((_, i) => {
        if (wmaFull[i] == null || wmaHalf[i] == null) return null;
        return 2 * wmaHalf[i] - wmaFull[i];
    });
    // WMA of raw series (skip nulls by carrying forward for length)
    const filled = raw.map((v, i) => {
        if (v != null) return v;
        for (let j = i - 1; j >= 0; j--) if (raw[j] != null) return raw[j];
        return values[i];
    });
    return wma(filled, sqrt);
}

export function sessionVwap(bars) {
    let pv = 0;
    let vv = 0;
    const series = [];
    for (const b of bars) {
        const typical = (Number(b.high) + Number(b.low) + Number(b.close)) / 3;
        const vol = Math.max(0, Number(b.volume) || 0);
        pv += typical * (vol || 1);
        vv += vol || 1;
        series.push(vv > 0 ? pv / vv : typical);
    }
    return {
        series,
        value: series.length ? series[series.length - 1] : null
    };
}

export function atrSeries(bars, period = 14) {
    const out = new Array(bars.length).fill(null);
    if (bars.length < 2) return out;
    const tr = bars.map((b, i) => {
        if (i === 0) return Number(b.high) - Number(b.low);
        const prev = Number(bars[i - 1].close);
        return Math.max(
            Number(b.high) - Number(b.low),
            Math.abs(Number(b.high) - prev),
            Math.abs(Number(b.low) - prev)
        );
    });
    let sum = 0;
    for (let i = 1; i <= period && i < tr.length; i++) sum += tr[i];
    if (tr.length <= period) return out;
    let atr = sum / period;
    out[period] = atr;
    for (let i = period + 1; i < tr.length; i++) {
        atr = (atr * (period - 1) + tr[i]) / period;
        out[i] = atr;
    }
    return out;
}

export function volumeDelta(bars) {
    return bars.map((b) => {
        const buy = Number(b.buyVol) || 0;
        const sell = Number(b.sellVol) || 0;
        if (buy || sell) return buy - sell;
        // Infer from candle direction when side unknown
        const dir = Number(b.close) >= Number(b.open) ? 1 : -1;
        return dir * (Number(b.volume) || 0) * 0.5;
    });
}

export function computeIntradayMetrics(bars) {
    const closes = bars.map((b) => Number(b.close));
    const ema9 = emaSeries(closes, 9);
    const ema21 = emaSeries(closes, 21);
    const hma = hullMovingAverage(closes, 16);
    const vwap = sessionVwap(bars);
    const atr = atrSeries(bars, 14);
    const delta = volumeDelta(bars);
    const last = bars.length ? bars[bars.length - 1] : null;
    const i = bars.length - 1;

    const orderFlow =
        last && (last.buyVol || last.sellVol)
            ? (last.buyVol - last.sellVol) / Math.max(1, last.buyVol + last.sellVol)
            : delta[i] != null && last?.volume
                ? delta[i] / Math.max(1, last.volume)
                : 0;

    return {
        ema9: ema9[i] ?? null,
        ema21: ema21[i] ?? null,
        hma: hma[i] ?? null,
        vwap: vwap.value,
        atr: atr[i] ?? null,
        volumeDelta: delta[i] ?? 0,
        orderFlow: parseFloat(Number(orderFlow).toFixed(3)),
        series: { ema9, ema21, hma, vwap: vwap.series, atr, delta }
    };
}
