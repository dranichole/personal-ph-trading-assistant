/**
 * ==========================================
 * STATE MANAGEMENT LAYER
 * ==========================================
 */
import { CONFIG, BLUECHIP_STOCKS, INCOME_SEED_STOCKS } from './config.js';

const BLUECHIP_TICKERS = new Set(BLUECHIP_STOCKS.map(s => s.ticker));
const LOWCOST_TICKERS = new Set(INCOME_SEED_STOCKS.map(s => s.ticker));

function inferGroup(stock) {
    const ticker = String(stock.ticker || '').toUpperCase();
    if (stock.group === 'bluechip' || stock.group === 'lowcost' || stock.group === 'other') {
        return stock.group;
    }
    if (stock.preIpo || ticker === 'GCASH') return 'other';
    if (BLUECHIP_TICKERS.has(ticker)) return 'bluechip';
    if (LOWCOST_TICKERS.has(ticker) || stock.autoAdd) return 'lowcost';
    return 'other';
}

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

export class AppState {
    constructor() {
        this.watchlist = this.loadWatchlist();
        this.journal = readJson(CONFIG.storageKeys.journal, []);
        this.stockDataCache = {};
        this.chartInstances = {};
        this.aiCache = {};
        this.activeStock = null;
        this.activeRange = CONFIG.dashboardRange;
        this.forecastHorizon = '1mo';
        this.predictHorizon = '3s';
        this.detailTab = 'chart';
        this.scalpTimeframe = '1m';
        this.sectorFilter = 'all';
        this.sortBy = 'watchlist';
        this.currentView = 'dashboard';
        this.chartStyle = 'combo';
        this.chartBusy = false;
        this.chartRequestId = 0;
        this.lastRefreshedAt = null;
        this.refreshInFlight = false;
        this.theme = this.loadTheme();
        this.activeAlerts = [];
        this.alertLog = readJson(CONFIG.storageKeys.alertLog, {});
        this.browserAlertsEnabled = localStorage.getItem('ta_browser_alerts') === '1';
        this.sectionLayout = this.loadSectionLayout();
    }

    defaultSectionLayout() {
        const defs = CONFIG.watchlistSections || [];
        return {
            order: defs.map(s => s.id),
            visible: Object.fromEntries(defs.map(s => [s.id, true]))
        };
    }

    loadSectionLayout() {
        const defs = CONFIG.watchlistSections || [];
        const fallback = this.defaultSectionLayout();
        const stored = readJson(CONFIG.storageKeys.sectionLayout, null);
        if (!stored || !Array.isArray(stored.order)) return fallback;

        const known = new Set(defs.map(s => s.id));
        const order = stored.order.filter(id => known.has(id));
        defs.forEach(s => {
            if (!order.includes(s.id)) order.push(s.id);
        });
        const visible = { ...fallback.visible, ...(stored.visible || {}) };
        defs.forEach(s => {
            if (typeof visible[s.id] !== 'boolean') visible[s.id] = true;
        });
        return { order, visible };
    }

    persistSectionLayout() {
        writeJson(CONFIG.storageKeys.sectionLayout, this.sectionLayout);
    }

    setSectionVisible(sectionId, visible) {
        if (!this.sectionLayout.visible.hasOwnProperty(sectionId)) return;
        this.sectionLayout.visible[sectionId] = Boolean(visible);
        // Keep at least one section visible
        if (!Object.values(this.sectionLayout.visible).some(Boolean)) {
            this.sectionLayout.visible[sectionId] = true;
        }
        this.persistSectionLayout();
    }

    reorderSections(fromId, toId) {
        const order = [...this.sectionLayout.order];
        const from = order.indexOf(fromId);
        const to = order.indexOf(toId);
        if (from < 0 || to < 0 || from === to) return;
        order.splice(from, 1);
        order.splice(to, 0, fromId);
        this.sectionLayout.order = order;
        this.persistSectionLayout();
    }

    orderedVisibleSectionDefs() {
        const defs = CONFIG.watchlistSections || [];
        const byId = Object.fromEntries(defs.map(s => [s.id, s]));
        return this.sectionLayout.order
            .filter(id => this.sectionLayout.visible[id] !== false)
            .map(id => byId[id])
            .filter(Boolean);
    }

    loadTheme() {
        const stored = localStorage.getItem(CONFIG.storageKeys.theme);
        return stored === 'night' ? 'night' : 'day';
    }

    setTheme(theme) {
        this.theme = theme === 'night' ? 'night' : 'day';
        localStorage.setItem(CONFIG.storageKeys.theme, this.theme);
        document.documentElement.setAttribute('data-theme', this.theme);
    }

    beginChartRequest() {
        this.chartBusy = true;
        this.chartRequestId += 1;
        return this.chartRequestId;
    }

    isLatestChartRequest(id) {
        return id === this.chartRequestId;
    }

    endChartRequest(id) {
        if (id === this.chartRequestId) this.chartBusy = false;
    }

    loadWatchlist() {
        const stored = readJson(CONFIG.storageKeys.watchlist, null);
        let list = Array.isArray(stored)
            ? stored.map(s => ({ ...s }))
            : CONFIG.defaultStocks.map(s => ({ ...s }));

        // Keep GCash Pre-IPO card present and up to date.
        const gcash = CONFIG.defaultStocks.find(s => s.ticker === 'GCASH');
        if (gcash && !list.some(s => s.ticker === 'GCASH')) {
            list.push({ ...gcash });
        } else if (gcash) {
            list = list.map(s => (s.ticker === 'GCASH' ? { ...s, ...gcash } : s));
        }

        // Offer curated income / under-₱10 seeds once per seed version (removals stick).
        const seedKey = CONFIG.storageKeys.incomeSeedVersion;
        const appliedVer = Number(localStorage.getItem(seedKey) || 0);
        const targetVer = Number(CONFIG.incomeSeedVersion || 0);
        if (appliedVer < targetVer) {
            const seeds = CONFIG.incomeSeedStocks || [];
            for (const seed of seeds) {
                if (!list.some(s => s.ticker === seed.ticker)) {
                    list.push({
                        ticker: seed.ticker,
                        name: seed.name,
                        sector: seed.sector,
                        group: seed.group || 'lowcost',
                        autoAdd: true
                    });
                }
            }
            localStorage.setItem(seedKey, String(targetVer));
        }

        // Ensure blue-chip defaults are never wiped by an empty/corrupt stored list.
        for (const chip of CONFIG.bluechipStocks || []) {
            if (!list.some(s => s.ticker === chip.ticker)) {
                list.push({ ...chip });
            }
        }

        list = list.map(s => ({ ...s, ticker: String(s.ticker || '').toUpperCase(), group: inferGroup(s) }));
        writeJson(CONFIG.storageKeys.watchlist, list);
        return list;
    }

    persistWatchlist() {
        writeJson(CONFIG.storageKeys.watchlist, this.watchlist);
    }

    persistJournal() {
        writeJson(CONFIG.storageKeys.journal, this.journal);
    }

    addToWatchlist(stock) {
        const ticker = stock.ticker.toUpperCase();
        if (this.watchlist.some(s => s.ticker === ticker)) return false;
        this.watchlist.push({
            ticker,
            name: stock.name || ticker,
            sector: stock.sector || 'Custom',
            group: stock.group || inferGroup({ ...stock, ticker }),
            preIpo: Boolean(stock.preIpo),
            locked: Boolean(stock.locked)
        });
        this.persistWatchlist();
        return true;
    }

    removeFromWatchlist(ticker) {
        const row = this.watchlist.find(s => s.ticker === ticker);
        if (row?.locked || ticker === 'GCASH') return false;
        this.watchlist = this.watchlist.filter(s => s.ticker !== ticker);
        delete this.stockDataCache[ticker];
        this.persistWatchlist();
        return true;
    }

    setSnapshot(ticker, range, snapshot) {
        if (!this.stockDataCache[ticker]) this.stockDataCache[ticker] = {};
        this.stockDataCache[ticker][range] = snapshot;
    }

    getSnapshot(ticker, range) {
        return this.stockDataCache[ticker]?.[range] || null;
    }

    pctChangeFor(ticker, range = CONFIG.dashboardRange) {
        const snap = this.getSnapshot(ticker, range);
        if (!snap?.bars?.length) return 0;
        const first = snap.bars[0].close;
        const last = snap.bars[snap.bars.length - 1].close;
        if (!first) return 0;
        return ((last - first) / first) * 100;
    }

    visibleStocks() {
        let list = [...this.watchlist];
        if (this.sectorFilter !== 'all') {
            list = list.filter(s => s.sector === this.sectorFilter);
        }
        if (this.sortBy === 'change') {
            list.sort((a, b) => this.pctChangeFor(b.ticker) - this.pctChangeFor(a.ticker));
        } else if (this.sortBy === 'name') {
            list.sort((a, b) => a.name.localeCompare(b.name));
        } else if (this.sortBy === 'sector') {
            list.sort((a, b) => a.sector.localeCompare(b.sector) || a.name.localeCompare(b.name));
        }
        return list;
    }

    /** Visible stocks grouped for dashboard sections (empty sections omitted by UI). */
    visibleStocksBySection() {
        const visible = this.visibleStocks();
        return (CONFIG.watchlistSections || []).map(section => ({
            ...section,
            stocks: visible.filter(s => (s.group || 'other') === section.id)
        }));
    }

    sectors() {
        return [...new Set(this.watchlist.map(s => s.sector))].sort();
    }

    aiCacheKey(ticker, range, snapshot) {
        return `${ticker}|${range}|${snapshot?.source}`;
    }

    getAiCache(key) {
        return this.aiCache[key] || null;
    }

    setAiCache(key, data) {
        this.aiCache[key] = { data, at: Date.now() };
    }

    addJournalEntry(entry) {
        this.journal.unshift(entry);
        this.persistJournal();
    }

    updateJournalEntry(id, patch) {
        this.journal = this.journal.map(e => e.id === id ? { ...e, ...patch } : e);
        this.persistJournal();
    }

    removeJournalEntry(id) {
        this.journal = this.journal.filter(e => e.id !== id);
        this.persistJournal();
    }

    journalFor(ticker) {
        return this.journal.filter(e => e.ticker === ticker);
    }

    destroyChart(canvasId) {
        const existing = this.chartInstances[canvasId];
        if (existing) {
            existing.destroy();
            delete this.chartInstances[canvasId];
        }
        const canvas = document.getElementById(canvasId);
        if (canvas && typeof Chart !== 'undefined' && typeof Chart.getChart === 'function') {
            const bound = Chart.getChart(canvas);
            if (bound) bound.destroy();
        }
    }

    registerChart(canvasId, chartInstance) {
        this.chartInstances[canvasId] = chartInstance;
    }

    alertDayKey() {
        const d = new Date();
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }

    wasAlertFired(key) {
        return Boolean(this.alertLog[key]);
    }

    markAlertFired(key) {
        this.alertLog[key] = Date.now();
        // Keep log small: drop entries older than 14 days
        const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
        Object.keys(this.alertLog).forEach(k => {
            if (this.alertLog[k] < cutoff) delete this.alertLog[k];
        });
        writeJson(CONFIG.storageKeys.alertLog, this.alertLog);
    }

    setBrowserAlertsEnabled(on) {
        this.browserAlertsEnabled = Boolean(on);
        localStorage.setItem('ta_browser_alerts', on ? '1' : '0');
    }
}
