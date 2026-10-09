/**
 * Market Replay — synthesize tick tape + DOM from a historical daily OHLC bar
 * so users can practice scalping after PSE hours (09:30–15:00 Manila).
 */

const SESSION_MS = (15 - 9.5) * 60 * 60 * 1000; // 5.5h

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Build a tick path for one trading day from OHLC (open → high → low → close
 * with micro-noise). Educational approximation — not true exchange prints.
 */
export function synthesizeDayTicks(bar, { ticks = 180 } = {}) {
    const o = Number(bar.open) || Number(bar.close);
    const h = Number(bar.high) || o;
    const l = Number(bar.low) || o;
    const c = Number(bar.close);
    const vol = Math.max(ticks, Number(bar.volume) || ticks * 100);
    const seed = Math.floor((Number(bar.timestamp) || Date.now() / 1000) % 1e9);
    const rnd = mulberry32(seed);
    const dayStart = (Number(bar.timestamp) || Math.floor(Date.now() / 1000)) * 1000;
    // Anchor to 09:30 Manila conceptually
    const sessionStart = dayStart;

    const waypoints = [
        { t: 0, px: o },
        { t: 0.28, px: h },
        { t: 0.62, px: l },
        { t: 1, px: c }
    ];

    const out = [];
    let prev = o;
    for (let i = 0; i < ticks; i++) {
        const u = i / (ticks - 1 || 1);
        let j = 0;
        while (j < waypoints.length - 2 && u > waypoints[j + 1].t) j += 1;
        const a = waypoints[j];
        const b = waypoints[j + 1];
        const span = b.t - a.t || 1;
        const local = (u - a.t) / span;
        let px = a.px + (b.px - a.px) * local;
        px += (rnd() - 0.5) * (h - l) * 0.04;
        px = Math.max(l * 0.998, Math.min(h * 1.002, px));
        const size = Math.max(1, Math.round((vol / ticks) * (0.4 + rnd() * 1.6)));
        const side = px >= prev ? 'buy' : 'sell';
        prev = px;
        out.push({
            t: sessionStart + Math.floor(u * SESSION_MS),
            price: parseFloat(px.toFixed(4)),
            size,
            side,
            source: 'replay',
            block: size >= vol / ticks * 3
        });
    }
    return out;
}

export function pickReplayBar(bars) {
    const list = (bars || []).filter(
        (b) => Number(b.close) > 0 && Number(b.high) >= Number(b.low)
    );
    if (list.length < 5) return null;
    // Prefer mid-history liquid day (skip last 2)
    const pool = list.slice(0, -2);
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx];
}

export class MarketReplay {
    constructor() {
        this.ticks = [];
        this.index = 0;
        this.speed = 2;
        this.playing = false;
        this._timer = null;
        this.listeners = new Set();
        this.bar = null;
        this.tape = [];
        this.dom = { bids: [], asks: [], spread: null };
    }

    onTick(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    load(bar, opts = {}) {
        this.stop();
        this.bar = bar;
        this.ticks = synthesizeDayTicks(bar, opts);
        this.index = 0;
        this.tape = [];
        this.dom = { bids: [], asks: [], spread: null };
        return this.ticks.length;
    }

    setSpeed(speed) {
        this.speed = speed === 5 ? 5 : speed === 1 ? 1 : 2;
        if (this.playing) {
            this.pause();
            this.play();
        }
    }

    _rebuildDom(tick) {
        const mid = tick.price;
        const tickSize = mid >= 100 ? 0.5 : mid >= 50 ? 0.1 : 0.01;
        const bids = [];
        const asks = [];
        for (let i = 1; i <= 8; i++) {
            bids.push({
                price: parseFloat((mid - i * tickSize).toFixed(4)),
                size: 150 + i * 40 + (tick.side === 'buy' ? 80 : 0)
            });
            asks.push({
                price: parseFloat((mid + i * tickSize).toFixed(4)),
                size: 150 + i * 40 + (tick.side === 'sell' ? 80 : 0)
            });
        }
        this.dom = {
            bids,
            asks: asks.reverse(),
            spread: parseFloat((asks[asks.length - 1].price - bids[0].price).toFixed(4)),
            bestBid: bids[0].price,
            bestAsk: asks[asks.length - 1].price
        };
    }

    _emit(tick) {
        this.tape.unshift(tick);
        if (this.tape.length > 60) this.tape.length = 60;
        this._rebuildDom(tick);
        this.listeners.forEach((fn) => {
            try {
                fn({
                    tick,
                    tape: this.tape.slice(0, 40),
                    dom: this.dom,
                    progress: this.index / this.ticks.length,
                    bar: this.bar,
                    index: this.index,
                    total: this.ticks.length
                });
            } catch {
                /* ignore */
            }
        });
    }

    step() {
        if (this.index >= this.ticks.length) {
            this.pause();
            return false;
        }
        const tick = this.ticks[this.index++];
        this._emit(tick);
        return true;
    }

    play() {
        if (!this.ticks.length) return;
        this.playing = true;
        const baseMs = 120;
        const interval = Math.max(16, baseMs / this.speed);
        clearInterval(this._timer);
        this._timer = setInterval(() => {
            if (!this.step()) clearInterval(this._timer);
        }, interval);
    }

    pause() {
        this.playing = false;
        clearInterval(this._timer);
        this._timer = null;
    }

    stop() {
        this.pause();
        this.index = 0;
        this.tape = [];
    }
}
