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
import { ScalpEngine } from './scalp/engine.js';

class TradingAssistantApp {
    constructor() {
        this.state = new AppState();
        this.ui = new UIController(this);
        this.scalp = new ScalpEngine();
    }

    async init() {
        this.state.setTheme(this.state.theme);
        this.ui.syncThemeToggle();
        this.ui.syncWatchlistControls();
        this.ui.renderAlerts(this.state.activeAlerts || []);
        this.ui.syncAlertControls();
        this.ui.renderDashboard();
        this.ui.renderJournal();
        await this.loadDashboardData();
        this.evaluateAlerts({ notifyBrowser: false });
        this.startAutoRefresh();
        this.ui.bindScalp(this.scalp);
        this.scalp.onFill = (payload) => this.logPaperFill(payload);
    }

    logPaperFill({ order, meta, ticker, risk }) {
        if (!order) return;
        const side = order.side;
        const px = Number(order.limitPrice) || 0;
        const qty = order.qty;
        const strategy = meta?.tag || meta?.strategy || 'Paper';
        this.state.addJournalEntry({
            id: crypto.randomUUID(),
            ticker: String(ticker || order.ticker).toUpperCase(),
            date: new Date().toISOString().slice(0, 10),
            thesis: `Paper ${side.toUpperCase()} ${qty} @ ₱${px.toFixed(2)}${risk?.trail ? ` · trail ₱${risk.trail}` : ''}`,
            invalidation: risk?.trail ? `Stop / trail ₱${risk.trail}` : '',
            outcome: meta?.flatten ? 'scratch' : 'open',
            strategy,
            tag: strategy,
            pnl: null,
            fillPrice: px,
            qty,
            side,
            source: 'paper',
            createdAt: Date.now()
        });
        if (this.state.currentView === 'journal') this.ui.renderJournal();
    }

    async openScalp(ticker) {
        const pick =
            ticker ||
            this.ui.els.scalpTickerSelect?.value ||
            this.state.watchlist.find((s) => !s.preIpo)?.ticker ||
            'DMC';
        const t = String(pick).toUpperCase();
        this.state.currentView = 'scalp';
        this.ui.showScalp();
        if (this.ui.els.scalpTickerSelect) this.ui.els.scalpTickerSelect.value = t;
        const tf = this.state.scalpTimeframe || CONFIG.scalp?.defaultTimeframe || '1m';
        await this.scalp.start(t, {
            timeframeId: tf,
            wsUrl: CONFIG.scalp?.wsUrl || '',
            pollMs: CONFIG.scalp?.pollMs || 2500
        });
    }

    async stopScalp() {
        await this.scalp.stop();
    }

    async loadDashboardData() {
        const stocks = this.state.watchlist;
        // Small batches so phisix (live fallback) is not flooded into timeouts → simulated.
        const batchSize = 3;
        for (let i = 0; i < stocks.length; i += batchSize) {
            const batch = stocks.slice(i, i + batchSize);
            await Promise.allSettled(
                batch.map(stock => this.ensureSnapshot(stock.ticker, CONFIG.dashboardRange, {
                    preferLive: true
                }))
            );
            this.ui.renderDashboard();
        }
        this.state.lastRefreshedAt = Date.now();
        this.ui.updateRefreshIndicator();
        this.ui.renderDashboard();
    }

    async ensureSnapshot(ticker, range, { force = false, preferLive = false } = {}) {
        if (!force) {
            const cached = this.state.getSnapshot(ticker, range);
            if (cached?.source === 'live') return cached;
            if (cached?.source === 'preipo') return cached;
            // Keep simulated only if we are not actively trying to upgrade to live.
            if (cached && !preferLive && cached.source === 'simulated') return cached;
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

    async quietRefresh({ manual = false } = {}) {
        if (this.state.refreshInFlight || this.state.chartBusy) return;
        if (!manual && document.hidden) return;
        this.state.refreshInFlight = true;
        this.ui.setRefreshStatus('Refreshing…');
        this.ui.setRefreshBusy(true);

        const onDetail = this.state.currentView === 'detail' && this.state.activeStock;
        if (manual) {
            if (onDetail) {
                this.ui.setChartBusy(true, 'Refreshing chart…');
            } else if (this.state.currentView === 'dashboard') {
                this.ui.setRefreshStatus('Refreshing charts…');
            }
        }

        try {
            const stocks = this.state.watchlist;
            const batchSize = 3;
            for (let i = 0; i < stocks.length; i += batchSize) {
                const batch = stocks.slice(i, i + batchSize);
                await Promise.allSettled(
                    batch.map(stock =>
                        this.ensureSnapshot(stock.ticker, CONFIG.dashboardRange, {
                            force: true,
                            preferLive: true
                        })
                    )
                );
                if (this.state.currentView === 'dashboard') this.ui.renderDashboard();
            }

            if (onDetail) {
                await this.ensureSnapshot(
                    this.state.activeStock.ticker,
                    this.state.activeRange,
                    { force: true, preferLive: true }
                );
            }

            this.state.lastRefreshedAt = Date.now();
            this.ui.updateRefreshIndicator();

            if (this.state.currentView === 'dashboard') {
                this.ui.renderDashboard();
            } else if (onDetail) {
                const snap = this.state.getSnapshot(this.state.activeStock.ticker, this.state.activeRange);
                if (snap) this.ui.showDetails(this.state.activeStock, snap, { soft: true });
            }
            this.evaluateAlerts({ notifyBrowser: true });
        } catch (error) {
            console.warn('Quiet refresh failed:', error);
            this.ui.setRefreshStatus('Refresh failed. Try again');
        } finally {
            this.state.refreshInFlight = false;
            if (manual && onDetail) this.ui.setChartBusy(false);
            this.ui.setRefreshBusy(false);
            this.ui.updateRefreshIndicator();
        }
    }

    async manualRefresh() {
        await this.quietRefresh({ manual: true });
    }

    evaluateAlerts({ notifyBrowser = false } = {}) {
        const buyThr = CONFIG.alerts.buyDipPct;
        const sellThr = CONFIG.alerts.sellRisePct;
        const day = this.state.alertDayKey();
        const fresh = [];

        for (const stock of this.state.watchlist) {
            const snap = this.state.getSnapshot(stock.ticker, CONFIG.dashboardRange);
            if (!snap?.bars || snap.bars.length < 2) continue;
            const prev = snap.bars[snap.bars.length - 2].close;
            const last = snap.bars[snap.bars.length - 1].close;
            if (!prev) continue;
            const dayPct = ((last - prev) / prev) * 100;
            const label = stock.preIpo
                ? `${stock.name} (${CONFIG.gcashPreIpo?.offerOpen ? 'IPO offer' : 'pre-listing'})`
                : stock.ticker;

            if (dayPct <= buyThr) {
                const key = `${stock.ticker}|buy|${day}`;
                const alert = {
                    key,
                    type: 'buy',
                    ticker: stock.ticker,
                    title: `Buy watch · ${label}`,
                    body: `Down ${dayPct.toFixed(2)}% vs prior close (₱${last.toFixed(2)}). Significant dip vs your −${Math.abs(buyThr)}% alert.`
                };
                fresh.push(alert);
                if (notifyBrowser && !this.state.wasAlertFired(key)) {
                    this.state.markAlertFired(key);
                    this.maybeBrowserNotify(alert);
                }
            } else if (dayPct >= sellThr) {
                const key = `${stock.ticker}|sell|${day}`;
                const alert = {
                    key,
                    type: 'sell',
                    ticker: stock.ticker,
                    title: `Sell watch · ${label}`,
                    body: `Up +${dayPct.toFixed(2)}% vs prior close (₱${last.toFixed(2)}). Significant rise vs your +${sellThr}% alert.`
                };
                fresh.push(alert);
                if (notifyBrowser && !this.state.wasAlertFired(key)) {
                    this.state.markAlertFired(key);
                    this.maybeBrowserNotify(alert);
                }
            }
        }

        this.state.activeAlerts = fresh;
        this.ui.renderAlerts(fresh);
    }

    maybeBrowserNotify(alert) {
        if (!this.state.browserAlertsEnabled) return;
        if (typeof Notification === 'undefined') return;
        if (Notification.permission !== 'granted') return;
        try {
            new Notification(alert.title, {
                body: alert.body,
                tag: alert.key
            });
        } catch (error) {
            console.warn('Browser notification failed:', error);
        }
    }

    async enableBrowserAlerts() {
        if (typeof Notification === 'undefined') {
            this.ui.setWatchlistMessage('This browser does not support notifications.', true);
            return;
        }
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            this.state.setBrowserAlertsEnabled(true);
            this.ui.syncAlertControls();
            this.ui.setWatchlistMessage('Browser alerts on. You will get a notice on large dips or rises when this tab refreshes data.');
            this.evaluateAlerts({ notifyBrowser: true });
        } else {
            this.state.setBrowserAlertsEnabled(false);
            this.ui.syncAlertControls();
            this.ui.setWatchlistMessage('Browser alerts were not allowed. In-app banners still work.', true);
        }
    }

    /** Visible in-app toast + optional OS notification so the feature can be verified. */
    async testBrowserAlert() {
        const sample = {
            key: `test|${Date.now()}`,
            type: 'buy',
            ticker: 'TEST',
            title: 'Test alert · Trading Assistant',
            body: 'Sample notice: a −3% dip would look like this. In-app toast always shows; browser popup needs permission.'
        };

        this.state.activeAlerts = [sample, ...(this.state.activeAlerts || []).filter(a => a.ticker !== 'TEST')];
        this.ui.renderAlerts(this.state.activeAlerts);
        this.ui.showAlertTestToast(sample.body);

        if (typeof Notification === 'undefined') {
            this.ui.setWatchlistMessage('In-app test shown. This browser has no Notification API.', true);
            return;
        }

        let permission = Notification.permission;
        if (permission === 'default') {
            permission = await Notification.requestPermission();
        }
        if (permission === 'granted') {
            this.state.setBrowserAlertsEnabled(true);
            this.ui.syncAlertControls();
            try {
                new Notification(sample.title, {
                    body: sample.body,
                    tag: sample.key
                });
                this.ui.setWatchlistMessage('Test sent: check the on-page toast and your system notification.');
            } catch (error) {
                console.warn('Test notification failed:', error);
                this.ui.setWatchlistMessage('On-page toast shown; system notification failed.', true);
            }
        } else {
            this.ui.syncAlertControls();
            this.ui.setWatchlistMessage(
                'On-page toast shown. Allow notifications in the browser to also see the system popup.',
                true
            );
        }
    }

    dismissAlerts() {
        this.state.activeAlerts = [];
        this.ui.renderAlerts([]);
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
            let snapshot = await this.ensureSnapshot(ticker, this.state.activeRange);
            // Prefer denser history for chart (60–90 sessions) when the selected range is sparse
            if ((snapshot?.bars?.length || 0) < 45) {
                const denser = await this.ensureSnapshot(ticker, '3mo');
                if ((denser?.bars?.length || 0) > (snapshot?.bars?.length || 0)) {
                    snapshot = {
                        ...snapshot,
                        bars: denser.bars.slice(-90),
                        denserSource: '3mo'
                    };
                }
            } else if (snapshot.bars.length > 90) {
                snapshot = { ...snapshot, bars: snapshot.bars.slice(-90) };
            }
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

    setForecastHorizon(horizonId) {
        const allowed = (CONFIG.forecastHorizons || []).some(h => h.id === horizonId);
        if (!allowed) return;
        this.state.forecastHorizon = horizonId;
        this.ui.syncForecastHorizonButtons();
        this.ui.updateInvestmentForecast();
    }

    setPredictHorizon(horizonId) {
        const allowed = (CONFIG.predictHorizons || []).some(h => h.id === horizonId);
        if (!allowed) return;
        this.state.predictHorizon = horizonId;
        this.ui.syncPredictHorizonButtons();
        this.ui.renderPredictPanel();
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
        if (ticker === 'GCASH') {
            this.ui.setWatchlistMessage('GCash is already on the watchlist as a Pre-IPO forecast card.');
            return;
        }
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
        const removed = this.state.removeFromWatchlist(ticker);
        if (!removed) {
            this.ui.setWatchlistMessage('The GCash Pre-IPO forecast card stays on the watchlist for education.');
            return;
        }
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
                fetchedAt: snapshot.fetchedAt,
                preIpo: (snapshot.preIpo || stock.preIpo) ? (snapshot.filing || CONFIG.gcashPreIpo) : null
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
        const entry = this.state.journal.find((e) => e.id === id);
        const patch = { outcome };
        // Rough educational PnL when paper fill price exists and user marks win/loss
        if (entry && Number.isFinite(Number(entry.fillPrice)) && Number.isFinite(Number(entry.qty))) {
            const notional = Number(entry.fillPrice) * Number(entry.qty);
            if (outcome === 'win') patch.pnl = parseFloat((notional * 0.02).toFixed(2));
            else if (outcome === 'loss') patch.pnl = parseFloat((-notional * 0.015).toFixed(2));
            else if (outcome === 'scratch') patch.pnl = 0;
        }
        this.state.updateJournalEntry(id, patch);
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
