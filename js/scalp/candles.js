/**
 * Dynamic OHLCV aggregation from trade ticks → 1m / 5m / 15m / 1h candles.
 */

export const SCALP_TIMEFRAMES = [
    { id: '1m', label: '1m', ms: 60_000 },
    { id: '5m', label: '5m', ms: 5 * 60_000 },
    { id: '15m', label: '15m', ms: 15 * 60_000 },
    { id: '1h', label: '1h', ms: 60 * 60_000 }
];

function bucketStart(tsMs, timeframeMs) {
    return Math.floor(tsMs / timeframeMs) * timeframeMs;
}

export class CandleAggregator {
    constructor(timeframeMs = 60_000, maxBars = 240) {
        this.timeframeMs = timeframeMs;
        this.maxBars = maxBars;
        this.candles = [];
        this.current = null;
    }

    setTimeframe(timeframeMs) {
        if (timeframeMs === this.timeframeMs) return;
        this.timeframeMs = timeframeMs;
        this.candles = [];
        this.current = null;
    }

    /**
     * @param {{ t: number, price: number, size?: number, side?: 'buy'|'sell'|'unknown' }} tick
     * t = unix ms
     */
    pushTick(tick) {
        const price = Number(tick.price);
        const size = Math.max(0, Number(tick.size) || 0);
        const t = Number(tick.t) || Date.now();
        if (!Number.isFinite(price) || price <= 0) return this.snapshot();

        const start = bucketStart(t, this.timeframeMs);
        if (!this.current || this.current.t !== start) {
            if (this.current) {
                this.candles.push(this.current);
                if (this.candles.length > this.maxBars) {
                    this.candles = this.candles.slice(-this.maxBars);
                }
            }
            this.current = {
                t: start,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: size,
                buyVol: tick.side === 'buy' ? size : 0,
                sellVol: tick.side === 'sell' ? size : 0,
                trades: 1
            };
        } else {
            const c = this.current;
            c.high = Math.max(c.high, price);
            c.low = Math.min(c.low, price);
            c.close = price;
            c.volume += size;
            if (tick.side === 'buy') c.buyVol += size;
            if (tick.side === 'sell') c.sellVol += size;
            c.trades += 1;
        }
        return this.snapshot();
    }

    snapshot() {
        const bars = this.current ? [...this.candles, this.current] : [...this.candles];
        return bars.map((b) => ({
            timestamp: Math.floor(b.t / 1000),
            date: new Date(b.t).toLocaleTimeString('en-PH', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'Asia/Manila'
            }),
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: b.volume,
            buyVol: b.buyVol,
            sellVol: b.sellVol,
            trades: b.trades
        }));
    }
}
