/**
 * ==========================================
 * STATE MANAGEMENT LAYER
 * ==========================================
 */
import { CONFIG } from './config.js';

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
        this.sectorFilter = 'all';
        this.sortBy = 'watchlist';
        this.currentView = 'dashboard';
        this.chartStyle = 'combo';
        this.chartBusy = false;
        this.chartRequestId = 0;
        this.lastRefreshedAt = null;
        this.refreshInFlight = false;
        this.theme = this.loadTheme();
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
        if (Array.isArray(stored)) return stored;
        return CONFIG.defaultStocks.map(s => ({ ...s }));
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
            sector: stock.sector || 'Custom'
        });
        this.persistWatchlist();
        return true;
    }

    removeFromWatchlist(ticker) {
        this.watchlist = this.watchlist.filter(s => s.ticker !== ticker);
        delete this.stockDataCache[ticker];
        this.persistWatchlist();
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
}
