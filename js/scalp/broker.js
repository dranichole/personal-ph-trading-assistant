/**
 * Broker adapters for chart-side execution.
 * PaperBroker = local fills. LocalTicketBroker formats orders for PSE retail terminals
 * (DragonFI / FirstMetroSec PRO / BPI Trade) — IBKR/Alpaca do not route PSE retail.
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

const LOCAL_BROKERS = {
    dragonfi: {
        id: 'dragonfi',
        label: 'DragonFI',
        tip: 'Copy ticket into DragonFI / COL-style blotter. No public retail order API.'
    },
    firstmetro: {
        id: 'firstmetro',
        label: 'FirstMetroSec PRO',
        tip: 'Format for FirstMetroSec PRO terminal paste.'
    },
    bpi: {
        id: 'bpi',
        label: 'BPI Trade',
        tip: 'Format for BPI Trade ticket entry.'
    }
};

/**
 * Formats PSE retail tickets for copy-paste / optional webhook.
 * Does not claim live routing — local brokers rarely expose public order APIs.
 */
export class LocalTicketBroker {
    constructor(id = 'dragonfi') {
        const meta = LOCAL_BROKERS[id] || LOCAL_BROKERS.dragonfi;
        this.id = meta.id;
        this.label = meta.label;
        this.tip = meta.tip;
        this.lastTicket = null;
        this.webhookUrl = '';
    }

    async connect() {
        return {
            ok: true,
            message: `${this.label}: copy-paste ticket ready. Live PSE routing needs broker terminal.`
        };
    }

    getPosition() {
        return null;
    }

    listOrders() {
        return this.lastTicket ? [this.lastTicket] : [];
    }

    formatTicket({ ticker, side, qty, type = 'market', limitPrice = null, stopPrice = null }) {
        const t = String(ticker).toUpperCase();
        const q = Math.max(1, Math.floor(Number(qty) || 0));
        const px = limitPrice ?? stopPrice;
        const lines = [
            `BROKER=${this.label}`,
            `SYMBOL=${t}`,
            `SIDE=${String(side).toUpperCase()}`,
            `QTY=${q}`,
            `TYPE=${String(type).toUpperCase()}`,
            px != null ? `PRICE=${Number(px).toFixed(4)}` : 'PRICE=MKT',
            stopPrice != null ? `STOP=${Number(stopPrice).toFixed(4)}` : null,
            `TIF=DAY`,
            `NOTE=Educational ticket — paste into ${this.label} terminal`
        ].filter(Boolean);
        return lines.join('\n');
    }

    async placeOrder(order) {
        const text = this.formatTicket(order);
        this.lastTicket = {
            id: `T-${Date.now()}`,
            ...order,
            ticker: String(order.ticker).toUpperCase(),
            status: 'ticket',
            ticketText: text,
            at: Date.now()
        };

        if (this.webhookUrl) {
            try {
                await fetch(this.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        broker: this.id,
                        ticket: text,
                        order: this.lastTicket
                    })
                });
            } catch (err) {
                console.warn('Ticket webhook failed', err);
            }
        }

        try {
            await navigator.clipboard.writeText(text);
        } catch {
            /* UI will show ticket for manual copy */
        }

        return this.lastTicket;
    }

    async updateStop({ ticker, stopPrice }) {
        return this.placeOrder({
            ticker,
            side: 'sell',
            qty: 0,
            type: 'stop',
            stopPrice
        });
    }
}

export function createBroker(id = 'paper') {
    if (id === 'dragonfi' || id === 'firstmetro' || id === 'bpi') {
        return new LocalTicketBroker(id);
    }
    return new PaperBroker();
}

export { LOCAL_BROKERS };
