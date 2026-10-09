/**
 * Broker adapters for chart-side execution.
 * PaperBroker is local/educational. Live brokers are stubs until API keys are configured.
 */

const PAPER_KEY = 'ta_paper_broker_v1';

function readPaper() {
    try {
        return JSON.parse(localStorage.getItem(PAPER_KEY) || '{"positions":{},"orders":[]}');
    } catch {
        return { positions: {}, orders: [] };
    }
}

function writePaper(data) {
    localStorage.setItem(PAPER_KEY, JSON.stringify(data));
}

export class PaperBroker {
    constructor() {
        this.id = 'paper';
        this.label = 'Paper';
    }

    async connect() {
        return { ok: true, message: 'Paper broker ready (browser only).' };
    }

    getPosition(ticker) {
        const data = readPaper();
        return data.positions[String(ticker).toUpperCase()] || null;
    }

    listOrders(ticker) {
        const data = readPaper();
        const t = String(ticker).toUpperCase();
        return (data.orders || []).filter((o) => o.ticker === t).slice(-12);
    }

    async placeOrder({ ticker, side, qty, type = 'market', limitPrice = null, stopPrice = null }) {
        const t = String(ticker).toUpperCase();
        const q = Math.max(1, Math.floor(Number(qty) || 0));
        const data = readPaper();
        const pos = data.positions[t] || { ticker: t, qty: 0, avgPrice: 0 };
        const px = Number(limitPrice) || Number(stopPrice) || 0;
        const signed = side === 'sell' ? -q : q;
        const newQty = pos.qty + signed;
        if (newQty < 0) throw new Error('Paper: not enough shares to sell.');
        if (side === 'buy' && px > 0) {
            const notional = pos.avgPrice * pos.qty + px * q;
            pos.qty = newQty;
            pos.avgPrice = pos.qty ? notional / pos.qty : 0;
        } else if (side === 'sell') {
            pos.qty = newQty;
            if (!pos.qty) pos.avgPrice = 0;
        } else {
            pos.qty = newQty;
            if (px > 0 && side === 'buy') pos.avgPrice = px;
        }
        data.positions[t] = pos;
        const order = {
            id: `P-${Date.now()}`,
            ticker: t,
            side,
            qty: q,
            type,
            limitPrice,
            stopPrice,
            status: 'filled',
            at: Date.now()
        };
        data.orders.push(order);
        writePaper(data);
        return order;
    }

    async updateStop({ ticker, stopPrice }) {
        const t = String(ticker).toUpperCase();
        const data = readPaper();
        const pos = data.positions[t];
        if (!pos || !pos.qty) throw new Error('No paper position.');
        pos.stopPrice = Number(stopPrice);
        data.positions[t] = pos;
        writePaper(data);
        return pos;
    }
}

/** Stub — wire Interactive Brokers Client Portal / TWS when keys exist. */
export class InteractiveBrokersStub {
    constructor() {
        this.id = 'ibkr';
        this.label = 'IBKR';
    }
    async connect() {
        return {
            ok: false,
            message: 'IBKR not connected. Add Client Portal URL + auth in CONFIG.brokers.ibkr.'
        };
    }
    getPosition() {
        return null;
    }
    listOrders() {
        return [];
    }
    async placeOrder() {
        throw new Error('Connect IBKR first.');
    }
    async updateStop() {
        throw new Error('Connect IBKR first.');
    }
}

/** Stub — Alpaca paper/live REST when key/secret set. */
export class AlpacaStub {
    constructor() {
        this.id = 'alpaca';
        this.label = 'Alpaca';
    }
    async connect() {
        return {
            ok: false,
            message: 'Alpaca not connected. Set CONFIG.brokers.alpaca key/secret for live routing.'
        };
    }
    getPosition() {
        return null;
    }
    listOrders() {
        return [];
    }
    async placeOrder() {
        throw new Error('Connect Alpaca first.');
    }
    async updateStop() {
        throw new Error('Connect Alpaca first.');
    }
}

export function createBroker(id = 'paper') {
    if (id === 'ibkr') return new InteractiveBrokersStub();
    if (id === 'alpaca') return new AlpacaStub();
    return new PaperBroker();
}
