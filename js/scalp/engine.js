/**
 * In-memory scalp engine: ticks → candles → indicators → events → risk.
 * Runs on the main thread with rAF batching (Web Worker-ready shape).
 */

import { CandleAggregator, SCALP_TIMEFRAMES } from './candles.js';
import { TickStream } from './ticks.js';
import { computeIntradayMetrics } from './indicators.js';
import { evaluateScalpEvents } from './signals.js';
import { createBroker } from './broker.js';

export { SCALP_TIMEFRAMES };

export class ScalpEngine {
    constructor() {
        this.ticker = null;
        this.timeframeId = '1m';
        this.aggregator = new CandleAggregator(60_000);
        this.stream = null;
        this.unsub = null;
        this.broker = createBroker('paper');
        this.listeners = new Set();
        this.signalState = {};
        this.lastMetrics = null;
        this.lastEvents = { events: [], action: 'FLAT', risk: null };
        this.feedMode = 'idle';
        this._raf = null;
        this._dirty = false;
        this._lastTick = null;
    }

    subscribe(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    _publish() {
        const bars = this.aggregator.snapshot();
        const payload = {
            ticker: this.ticker,
            timeframeId: this.timeframeId,
            feedMode: this.feedMode,
            tick: this._lastTick,
            bars,
            metrics: this.lastMetrics,
            signal: this.lastEvents,
            position: this.broker.getPosition(this.ticker),
            orders: this.broker.listOrders(this.ticker)
        };
        this.listeners.forEach((fn) => {
            try {
                fn(payload);
            } catch (err) {
                console.warn('scalp ui', err);
            }
        });
    }

    _schedulePublish() {
        this._dirty = true;
        if (this._raf) return;
        this._raf = requestAnimationFrame(() => {
            this._raf = null;
            if (!this._dirty) return;
            this._dirty = false;
            this._recompute();
            this._publish();
        });
    }

    _recompute() {
        const bars = this.aggregator.snapshot();
        if (bars.length < 2) {
            this.lastMetrics = null;
            return;
        }
        this.lastMetrics = computeIntradayMetrics(bars);
        this.lastEvents = evaluateScalpEvents(bars, this.lastMetrics, this.signalState);
        this.signalState = this.lastEvents.state || this.signalState;

        // Sync paper trailing stop in memory on every recompute
        const pos = this.broker.getPosition(this.ticker);
        if (pos?.qty > 0 && this.lastEvents.risk?.trail) {
            pos.stopPrice = this.lastEvents.risk.trail;
        }
    }

    async setBroker(id) {
        this.broker = createBroker(id);
        const status = await this.broker.connect();
        this._publish();
        return status;
    }

    async start(ticker, { timeframeId = '1m', wsUrl = '', pollMs = 2500 } = {}) {
        await this.stop();
        this.ticker = String(ticker || '').toUpperCase();
        this.timeframeId = timeframeId;
        const tf = SCALP_TIMEFRAMES.find((t) => t.id === timeframeId) || SCALP_TIMEFRAMES[0];
        this.aggregator = new CandleAggregator(tf.ms);
        this.signalState = {};
        this.stream = new TickStream({
            ticker: this.ticker,
            wsUrl,
            pollMs
        });
        this.unsub = this.stream.onTick((tick) => {
            this._lastTick = tick;
            this.feedMode = tick.source || this.stream.mode;
            this.aggregator.pushTick(tick);
            this._schedulePublish();
        });
        await this.stream.start();
        this.feedMode = this.stream.mode;
        this._publish();
    }

    setTimeframe(timeframeId) {
        const tf = SCALP_TIMEFRAMES.find((t) => t.id === timeframeId);
        if (!tf || !this.ticker) return;
        this.timeframeId = tf.id;
        // Rebuild aggregator; seed from existing bars by replaying closes as ticks
        const prev = this.aggregator.snapshot();
        this.aggregator = new CandleAggregator(tf.ms);
        prev.forEach((b) => {
            this.aggregator.pushTick({
                t: (b.timestamp || 0) * 1000,
                price: b.close,
                size: b.volume,
                side: b.close >= b.open ? 'buy' : 'sell'
            });
        });
        this._recompute();
        this._publish();
    }

    async stop() {
        if (this.unsub) {
            this.unsub();
            this.unsub = null;
        }
        if (this.stream) {
            this.stream.stop();
            this.stream = null;
        }
        if (this._raf) {
            cancelAnimationFrame(this._raf);
            this._raf = null;
        }
        this.feedMode = 'idle';
    }

    async buy(qty, price) {
        const order = await this.broker.placeOrder({
            ticker: this.ticker,
            side: 'buy',
            qty,
            type: 'market',
            limitPrice: price
        });
        this._publish();
        return order;
    }

    async sell(qty, price) {
        const order = await this.broker.placeOrder({
            ticker: this.ticker,
            side: 'sell',
            qty,
            type: 'market',
            limitPrice: price
        });
        this._publish();
        return order;
    }

    async setStop(stopPrice) {
        const pos = await this.broker.updateStop({
            ticker: this.ticker,
            stopPrice
        });
        this._publish();
        return pos;
    }
}
