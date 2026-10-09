/**
 * Event-driven scalp triggers (not laggy EOD GBM).
 * Fires on VWAP retest, volume spike, EMA cross, S/R break.
 */

export function evaluateScalpEvents(bars, metrics, prev = {}) {
    const events = [];
    if (!bars.length || !metrics) return { events, state: prev };

    const last = bars[bars.length - 1];
    const prevBar = bars.length > 1 ? bars[bars.length - 2] : null;
    const price = Number(last.close);
    const vwap = metrics.vwap;
    const atr = metrics.atr || price * 0.005;
    const state = { ...prev };

    // Volume spike vs rolling median
    const vols = bars.slice(-20).map((b) => Number(b.volume) || 0).filter((v) => v > 0);
    const med = vols.length
        ? [...vols].sort((a, b) => a - b)[Math.floor(vols.length / 2)]
        : 0;
    if (med > 0 && last.volume >= med * 2.2) {
        events.push({
            id: 'vol-spike',
            label: 'Volume spike',
            tip: 'Current bar volume ≥ 2.2× recent median.',
            bias: price >= (vwap || price) ? 'buy' : 'sell'
        });
    }

    // VWAP retest: price crosses back through VWAP
    if (vwap != null && prevBar) {
        const wasBelow = Number(prevBar.close) < vwap;
        const nowAbove = price >= vwap;
        const wasAbove = Number(prevBar.close) > vwap;
        const nowBelow = price <= vwap;
        if (wasBelow && nowAbove) {
            events.push({
                id: 'vwap-reclaim',
                label: 'VWAP reclaim',
                tip: 'Price reclaimed session VWAP.',
                bias: 'buy'
            });
        }
        if (wasAbove && nowBelow) {
            events.push({
                id: 'vwap-lose',
                label: 'VWAP lost',
                tip: 'Price lost session VWAP.',
                bias: 'sell'
            });
        }
    }

    // EMA 9/21 cross
    if (metrics.ema9 != null && metrics.ema21 != null && metrics.series) {
        const e9 = metrics.series.ema9;
        const e21 = metrics.series.ema21;
        const i = e9.length - 1;
        if (i > 0 && e9[i - 1] != null && e21[i - 1] != null) {
            if (e9[i - 1] <= e21[i - 1] && e9[i] > e21[i]) {
                events.push({
                    id: 'ema-cross-up',
                    label: 'EMA 9>21',
                    tip: 'Fast EMA crossed above slow EMA.',
                    bias: 'buy'
                });
            }
            if (e9[i - 1] >= e21[i - 1] && e9[i] < e21[i]) {
                events.push({
                    id: 'ema-cross-down',
                    label: 'EMA 9<21',
                    tip: 'Fast EMA crossed below slow EMA.',
                    bias: 'sell'
                });
            }
        }
    }

    // Session S/R break (lookback highs/lows)
    const look = bars.slice(-30);
    if (look.length >= 10) {
        const highs = look.slice(0, -1).map((b) => Number(b.high));
        const lows = look.slice(0, -1).map((b) => Number(b.low));
        const res = Math.max(...highs);
        const sup = Math.min(...lows);
        state.resistance = res;
        state.support = sup;
        if (price > res && (!state.brokeResAt || state.brokeResAt !== last.timestamp)) {
            events.push({
                id: 'break-res',
                label: 'Break resistance',
                tip: `Broke ₱${res.toFixed(2)}.`,
                bias: 'buy'
            });
            state.brokeResAt = last.timestamp;
        }
        if (price < sup && (!state.brokeSupAt || state.brokeSupAt !== last.timestamp)) {
            events.push({
                id: 'break-sup',
                label: 'Break support',
                tip: `Broke ₱${sup.toFixed(2)}.`,
                bias: 'sell'
            });
            state.brokeSupAt = last.timestamp;
        }
    }

    // Order flow tilt
    if (Math.abs(metrics.orderFlow) >= 0.35) {
        events.push({
            id: 'order-flow',
            label: metrics.orderFlow > 0 ? 'Buy flow' : 'Sell flow',
            tip: `Order-flow imbalance ${metrics.orderFlow}.`,
            bias: metrics.orderFlow > 0 ? 'buy' : 'sell'
        });
    }

    // Instant risk levels from ATR (in-memory)
    const trail = parseFloat(Math.max(0.01, price - 1.2 * atr).toFixed(4));
    const tp1 = parseFloat((price + 1.0 * atr).toFixed(4));
    const tp2 = parseFloat((price + 1.8 * atr).toFixed(4));

    let action = 'FLAT';
    const buys = events.filter((e) => e.bias === 'buy').length;
    const sells = events.filter((e) => e.bias === 'sell').length;
    if (buys > sells && buys > 0) action = 'LONG BIAS';
    else if (sells > buys && sells > 0) action = 'SHORT BIAS';

    return {
        events: events.slice(0, 5),
        action,
        risk: { trail, tp1, tp2, atr: parseFloat(Number(atr).toFixed(4)), price },
        state
    };
}
