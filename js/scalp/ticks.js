/**
 * Tick ingestion: WebSocket → SSE → live price poll (phisix).
 * PSE has no free public tick WS; poll uses live last price (not random simulated charts).
 */

const PHISIX = 'https://phisix-api3.appspot.com';

async function fetchLastTrade(ticker) {
    const res = await fetch(`${PHISIX}/stocks/${encodeURIComponent(ticker)}.json`);
    if (!res.ok) throw new Error(`phisix ${res.status}`);
    const data = await res.json();
    const stock = data?.stocks?.[0];
    if (stock?.price?.amount == null) throw new Error('no last price');
    return {
        price: Number(stock.price.amount),
        size: Number(stock.volume) || 0,
        name: stock.name || ticker,
        t: data.as_of ? new Date(data.as_of).getTime() : Date.now()
    };
}

export class TickStream {
    /**
     * @param {{ ticker: string, wsUrl?: string, sseUrl?: string, pollMs?: number }} opts
     */
    constructor(opts) {
        this.ticker = String(opts.ticker || '').toUpperCase();
        this.wsUrl = opts.wsUrl || '';
        this.sseUrl = opts.sseUrl || `/api/ticks?ticker=${encodeURIComponent(this.ticker)}`;
        this.pollMs = opts.pollMs || 2500;
        this.listeners = new Set();
        this.mode = 'idle';
        this._ws = null;
        this._es = null;
        this._pollTimer = null;
        this._last = null;
        this._stopped = true;
    }

    onTick(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    _emit(tick) {
        const payload = {
            ticker: this.ticker,
            t: tick.t || Date.now(),
            price: Number(tick.price),
            size: Math.max(0, Number(tick.size) || 0),
            side: tick.side || 'unknown',
            source: tick.source || this.mode
        };
        this._last = payload;
        this.listeners.forEach((fn) => {
            try {
                fn(payload);
            } catch (err) {
                console.warn('tick listener', err);
            }
        });
    }

    async start() {
        this.stop();
        this._stopped = false;

        if (this.wsUrl) {
            try {
                await this._startWs();
                return;
            } catch (err) {
                console.warn('WS feed unavailable:', err.message);
            }
        }

        try {
            await this._startSse();
            return;
        } catch {
            /* fall through to poll */
        }

        this._startPoll();
    }

    stop() {
        this._stopped = true;
        if (this._ws) {
            try {
                this._ws.close();
            } catch {
                /* ignore */
            }
            this._ws = null;
        }
        if (this._es) {
            try {
                this._es.close();
            } catch {
                /* ignore */
            }
            this._es = null;
        }
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
        this.mode = 'idle';
    }

    _startWs() {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(this.wsUrl);
            let opened = false;
            const timer = setTimeout(() => {
                if (!opened) {
                    ws.close();
                    reject(new Error('WS timeout'));
                }
            }, 4000);
            ws.onopen = () => {
                opened = true;
                clearTimeout(timer);
                this._ws = ws;
                this.mode = 'websocket';
                ws.send(JSON.stringify({ op: 'subscribe', ticker: this.ticker }));
                resolve();
            };
            ws.onmessage = (ev) => {
                try {
                    const msg = JSON.parse(ev.data);
                    if (msg.price != null) this._emit({ ...msg, source: 'websocket' });
                } catch {
                    /* ignore */
                }
            };
            ws.onerror = () => {
                clearTimeout(timer);
                if (!opened) reject(new Error('WS error'));
            };
            ws.onclose = () => {
                if (!this._stopped && this.mode === 'websocket') this._startPoll();
            };
        });
    }

    _startSse() {
        return new Promise((resolve, reject) => {
            if (typeof EventSource === 'undefined') {
                reject(new Error('No EventSource'));
                return;
            }
            const es = new EventSource(this.sseUrl);
            let opened = false;
            const timer = setTimeout(() => {
                if (!opened) {
                    es.close();
                    reject(new Error('SSE timeout'));
                }
            }, 3500);
            es.onopen = () => {
                opened = true;
                clearTimeout(timer);
                this._es = es;
                this.mode = 'sse';
                resolve();
            };
            es.onmessage = (ev) => {
                try {
                    const msg = JSON.parse(ev.data);
                    if (msg.price != null) this._emit({ ...msg, source: 'sse' });
                } catch {
                    /* ignore */
                }
            };
            es.onerror = () => {
                clearTimeout(timer);
                if (!opened) {
                    es.close();
                    reject(new Error('SSE unavailable'));
                } else if (!this._stopped) {
                    es.close();
                    this._es = null;
                    this._startPoll();
                }
            };
        });
    }

    _startPoll() {
        this.mode = 'poll-live';
        const beat = async () => {
            if (this._stopped) return;
            try {
                const last = await fetchLastTrade(this.ticker);
                const prev = this._last;
                let size = 0;
                let side = 'unknown';
                if (prev && Number.isFinite(prev.price)) {
                    size = Math.max(0, last.size - (prev._cumVol || 0));
                    if (last.price > prev.price) side = 'buy';
                    else if (last.price < prev.price) side = 'sell';
                }
                const tick = {
                    t: Date.now(),
                    price: last.price,
                    size: size || Math.max(1, Math.round((last.size || 1000) * 0.001)),
                    side,
                    source: 'poll-live',
                    _cumVol: last.size
                };
                this._emit(tick);
            } catch (err) {
                console.warn('Live poll failed:', err.message);
            }
        };
        beat();
        this._pollTimer = setInterval(beat, this.pollMs);
    }
}
