/**
 * ==========================================
 * APPLICATION CORE
 * ==========================================
 */
import { CONFIG } from './config.js';
import { AppState } from './state.js';
import { DataService, AIService } from './services.js';
import { summarizeBars } from './indicators.js';
import { UIController } from './ui.js';

class TradingAssistantApp {
    constructor() {
        this.state = new AppState();
        this.ui = new UIController(this);
    }

    async init() {
        this.state.setTheme(this.state.theme);
        this.ui.syncThemeToggle();
        this.ui.syncWatchlistControls();
        this.ui.renderDashboard();
        this.ui.renderJournal();
        await this.loadDashboardData();
        this.startAutoRefresh();
    }

    async loadDashboardData() {
        const stocks = this.state.watchlist;
        await Promise.all(stocks.map(stock => this.ensureSnapshot(stock.ticker, CONFIG.dashboardRange)));
        this.state.lastRefreshedAt = Date.now();
        this.ui.updateRefreshIndicator();
        this.ui.renderDashboard();
    }

    async ensureSnapshot(ticker, range, { force = false } = {}) {
        if (!force) {
            const cached = this.state.getSnapshot(ticker, range);
            if (cached) return cached;
        }
        const snapshot = await DataService.fetchHistoricalData(ticker, range);
        this.state.setSnapshot(ticker, range, snapshot);
        return snapshot;
    }

    refreshIntervalMs() {
        const now = new Date();
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Manila',
            weekday: 'short',
            hour: 'numeric',
            hour12: false
        }).formatToParts(now);
        const weekday = parts.find(p => p.type === 'weekday')?.value;
        const hour = Number(parts.find(p => p.type === 'hour')?.value);
        const weekend = weekday === 'Sat' || weekday === 'Sun';
        const marketOpen = !weekend && hour >= 9 && hour < 16;
        return marketOpen ? CONFIG.refreshMsOpen : CONFIG.refreshMsClosed;
    }

    startAutoRefresh() {
        const tick = async () => {
            await this.quietRefresh();
            this._refreshTimer = setTimeout(tick, this.refreshIntervalMs());
        };
        this._refreshTimer = setTimeout(tick, this.refreshIntervalMs());
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.quietRefresh();
        });
    }

    async quietRefresh() {
        if (this.state.refreshInFlight || this.state.chartBusy || document.hidden) return;
        this.state.refreshInFlight = true;
        this.ui.setRefreshStatus('Refreshing…');
        try {
            await Promise.all(
                this.state.watchlist.map(stock =>
                    this.ensureSnapshot(stock.ticker, CONFIG.dashboardRange, { force: true })
                )
            );

            if (this.state.currentView === 'detail' && this.state.activeStock) {
                await this.ensureSnapshot(
                    this.state.activeStock.ticker,
                    this.state.activeRange,
                    { force: true }
                );
            }

            this.state.lastRefreshedAt = Date.now();
            this.ui.updateRefreshIndicator();

            if (this.state.currentView === 'dashboard') {
                this.ui.renderDashboard();
            } else if (this.state.currentView === 'detail' && this.state.activeStock && !this.state.chartBusy) {
                const snap = this.state.getSnapshot(this.state.activeStock.ticker, this.state.activeRange);
                if (snap) this.ui.showDetails(this.state.activeStock, snap, { soft: true });
            }
        } catch (error) {
            console.warn('Quiet refresh failed:', error);
            this.ui.setRefreshStatus('Refresh failed — will try again');
        } finally {
            this.state.refreshInFlight = false;
            this.ui.updateRefreshIndicator();
        }
    }

    async openDetails(ticker) {
        if (this.state.chartBusy) return;
        const stock = this.state.watchlist.find(s => s.ticker === ticker);
        if (!stock) return;
        this.state.activeStock = stock;
        if (!CONFIG.ranges.some(r => r.id === this.state.activeRange)) {
            this.state.activeRange = CONFIG.dashboardRange;
        }
        const requestId = this.state.beginChartRequest();
        this.ui.showDetailsLoading(stock);
        this.ui.setChartBusy(true, 'Loading chart…');
        try {
            const snapshot = await this.ensureSnapshot(ticker, this.state.activeRange);
            if (!this.state.isLatestChartRequest(requestId)) return;
            this.ui.showDetails(stock, snapshot);
        } finally {
            if (this.state.isLatestChartRequest(requestId)) {
                this.state.endChartRequest(requestId);
                this.ui.setChartBusy(false);
            }
        }
    }

    async setChartStyle(style) {
        if (this.state.chartBusy) return;
        const next = style === 'line' ? 'line' : 'combo';
        if (next === this.state.chartStyle) return;
        const stock = this.state.activeStock;
        if (!stock) return;
        const snapshot = this.state.getSnapshot(stock.ticker, this.state.activeRange);
        if (!snapshot) return;

        const requestId = this.state.beginChartRequest();
        this.state.chartStyle = next;
        this.ui.syncChartStyleButtons();
        this.ui.setChartBusy(true, next === 'line' ? 'Switching to line…' : 'Switching to candles…');
        try {
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            if (!this.state.isLatestChartRequest(requestId)) return;
            this.ui.drawDetailCharts(snapshot);
        } finally {
            if (this.state.isLatestChartRequest(requestId)) {
                this.state.endChartRequest(requestId);
                this.ui.setChartBusy(false);
            }
        }
    }

    async changeRange(range) {
        if (this.state.chartBusy) return;
        if (range === this.state.activeRange) return;
        const stock = this.state.activeStock;
        if (!stock) return;

        const requestId = this.state.beginChartRequest();
        this.state.activeRange = range;
        this.ui.syncRangeButtons();
        this.ui.setChartBusy(true, `Loading ${this.ui.rangeLabel(range)}…`);
        try {
            const snapshot = await this.ensureSnapshot(stock.ticker, range);
            if (!this.state.isLatestChartRequest(requestId)) return;
            this.ui.showDetails(stock, snapshot);
        } finally {
            if (this.state.isLatestChartRequest(requestId)) {
                this.state.endChartRequest(requestId);
                this.ui.setChartBusy(false);
            }
        }
    }

    async addTicker(rawTicker) {
        const ticker = rawTicker.trim().toUpperCase().replace(/\.PS$/i, '');
        if (!/^[A-Z0-9]{1,10}$/.test(ticker)) {
            this.ui.setWatchlistMessage('Use a PSE ticker like SM or ALI.', true);
            return;
        }
        if (this.state.watchlist.some(s => s.ticker === ticker)) {
            this.ui.setWatchlistMessage(`${ticker} is already on the watchlist.`);
            return;
        }

        this.ui.setWatchlistMessage(`Adding ${ticker}…`);
        const snapshot = await DataService.fetchHistoricalData(ticker, CONFIG.dashboardRange);
        const name = snapshot.source === 'live' && snapshot.name ? snapshot.name : ticker;
        const added = this.state.addToWatchlist({ ticker, name, sector: 'Custom' });
        if (!added) {
            this.ui.setWatchlistMessage(`${ticker} is already on the watchlist.`);
            return;
        }
        this.state.setSnapshot(ticker, CONFIG.dashboardRange, snapshot);
        this.ui.setWatchlistMessage(
            snapshot.source === 'live'
                ? `Added ${ticker}.`
                : `Added ${ticker} with simulated data — live quotes were unavailable.`
        );
        this.ui.syncWatchlistControls();
        this.ui.renderDashboard();
    }

    removeTicker(ticker) {
        this.state.removeFromWatchlist(ticker);
        if (this.state.activeStock?.ticker === ticker) {
            this.state.activeStock = null;
            this.ui.showDashboard();
        }
        this.ui.syncWatchlistControls();
        this.ui.renderDashboard();
    }

    setSort(sortBy) {
        this.state.sortBy = sortBy;
        this.ui.renderDashboard();
    }

    setSectorFilter(sector) {
        this.state.sectorFilter = sector;
        this.ui.renderDashboard();
    }

    async handleAIAnalysis() {
        const stock = this.state.activeStock;
        const snapshot = this.state.getSnapshot(stock.ticker, this.state.activeRange);
        if (!snapshot) return;

        const stats = summarizeBars(snapshot.bars);
        const cacheKey = this.state.aiCacheKey(stock.ticker, this.state.activeRange, snapshot);
        const cached = this.state.getAiCache(cacheKey);
        if (cached) {
            this.ui.setAIResults(cached.data, cached.at, snapshot.source);
            return;
        }

        this.ui.setAILoading();

        try {
            const aiData = await AIService.analyze({
                stockName: stock.name,
                ticker: stock.ticker,
                latestPrice: stats.latestClose,
                pctChange: stats.pctChange,
                range: this.state.activeRange,
                indicators: {
                    sma20: stats.sma20,
                    sma50: stats.sma50,
                    rsi: stats.rsi,
                    rsiLabel: stats.rsiLabel,
                    atr: stats.atr,
                    support: stats.support,
                    resistance: stats.resistance,
                    smaBias: stats.smaBias
                },
                recentCloses: stats.recentCloses,
                avgVolume: stats.avgVolume,
                dataSource: snapshot.source,
                fetchedAt: snapshot.fetchedAt
            });
            this.state.setAiCache(cacheKey, aiData);
            this.ui.setAIResults(aiData, Date.now(), snapshot.source);
        } catch (error) {
            console.error('AI Analysis Error:', error);
            this.ui.setAIError('Failed to fetch analysis. Please try again later.');
        }
    }

    addJournalFromForm(form) {
        const ticker = (form.ticker || this.state.activeStock?.ticker || '').toUpperCase();
        if (!ticker) return;
        const snapshot = this.state.getSnapshot(ticker, this.state.activeRange);
        const cacheKey = snapshot ? this.state.aiCacheKey(ticker, this.state.activeRange, snapshot) : null;
        const cached = cacheKey ? this.state.getAiCache(cacheKey) : null;
        const attachAi = form.attachAi && cached;

        this.state.addJournalEntry({
            id: crypto.randomUUID(),
            ticker,
            date: form.date || new Date().toISOString().slice(0, 10),
            thesis: form.thesis.trim(),
            invalidation: form.invalidation.trim(),
            outcome: form.outcome || 'open',
            aiSnapshot: attachAi ? { ...cached.data, at: cached.at } : null,
            createdAt: Date.now()
        });
        this.ui.renderJournal();
        if (this.state.activeStock) {
            const snap = this.state.getSnapshot(this.state.activeStock.ticker, this.state.activeRange);
            if (snap) this.ui.renderDetailJournal(this.state.activeStock.ticker);
        }
    }

    setJournalOutcome(id, outcome) {
        this.state.updateJournalEntry(id, { outcome });
        this.ui.renderJournal();
        if (this.state.activeStock) this.ui.renderDetailJournal(this.state.activeStock.ticker);
    }

    setTheme(theme) {
        this.state.setTheme(theme);
        this.ui.syncThemeToggle();
        this.ui.redrawVisibleCharts();
    }

    deleteJournalEntry(id) {
        this.state.removeJournalEntry(id);
        this.ui.renderJournal();
        if (this.state.activeStock) this.ui.renderDetailJournal(this.state.activeStock.ticker);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new TradingAssistantApp();
    app.init();
});
