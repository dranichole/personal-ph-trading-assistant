/**
 * ==========================================
 * UI CONTROLLER LAYER
 * ==========================================
 */
import { CONFIG, BLUECHIP_STOCKS, INCOME_SEED_STOCKS, WATCHLIST_SECTIONS } from './config.js';
import { summarizeBars, projectHorizonInvestment, FORECAST_HORIZONS } from './indicators.js';

const BLUECHIP_TICKERS = new Set(BLUECHIP_STOCKS.map(s => s.ticker));
const LOWCOST_TICKERS = new Set(INCOME_SEED_STOCKS.map(s => s.ticker));

function stockGroup(stock) {
    const ticker = String(stock?.ticker || '').toUpperCase();
    if (stock?.group === 'bluechip' || stock?.group === 'lowcost' || stock?.group === 'other') {
        return stock.group;
    }
    if (stock?.preIpo || ticker === 'GCASH') return 'other';
    if (BLUECHIP_TICKERS.has(ticker)) return 'bluechip';
    if (LOWCOST_TICKERS.has(ticker) || stock?.autoAdd) return 'lowcost';
    return 'other';
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[s]));
}

function formatFetchedAt(ms) {
    return new Date(ms).toLocaleString('en-PH', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
}

function formatVolume(n) {
    if (!n) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}

export class UIController {
    constructor(app) {
        this.app = app;
        
        this.els = {
            date: document.getElementById('currentDate'),
            dashboardView: document.getElementById('dashboardView'),
            detailView: document.getElementById('detailView'),
            journalView: document.getElementById('journalView'),
            dashboardSections: document.getElementById('dashboardSections'),
            emptyWatchlist: document.getElementById('emptyWatchlist'),
            watchlistMessage: document.getElementById('watchlistMessage'),
            addTickerForm: document.getElementById('addTickerForm'),
            addTickerInput: document.getElementById('addTickerInput'),
            sectorFilter: document.getElementById('sectorFilter'),
            sortSelect: document.getElementById('sortSelect'),
            backBtn: document.getElementById('backBtn'),
            rangeButtons: document.getElementById('rangeButtons'),
            detailName: document.getElementById('detailStockName'),
            detailTicker: document.getElementById('detailStockTicker'),
            detailPrice: document.getElementById('detailLatestPrice'),
            detailPctChange: document.getElementById('detailPctChange'),
            detailDataMeta: document.getElementById('detailDataMeta'),
            indicatorRow: document.getElementById('indicatorRow'),
            runAIBtn: document.getElementById('runAIBtn'),
            retryAIBtn: document.getElementById('retryAIBtn'),
            aiInputState: document.getElementById('aiInputState'),
            aiLoadingState: document.getElementById('aiLoadingState'),
            aiErrorState: document.getElementById('aiErrorState'),
            aiResultsState: document.getElementById('aiResultsState'),
            aiErrorText: document.getElementById('aiErrorText'),
            aiSimBanner: document.getElementById('aiSimBanner'),
            aiAsOf: document.getElementById('aiAsOf'),
            outTrend: document.getElementById('outTrend'),
            outAction: document.getElementById('outAction'),
            outRationale: document.getElementById('outRationale'),
            navDashboard: document.getElementById('navDashboard'),
            navJournal: document.getElementById('navJournal'),
            journalList: document.getElementById('journalList'),
            journalEmpty: document.getElementById('journalEmpty'),
            journalForm: document.getElementById('journalForm'),
            detailJournalForm: document.getElementById('detailJournalForm'),
            detailJournalList: document.getElementById('detailJournalList'),
            detailJournalDate: document.getElementById('detailJournalDate'),
            journalDate: document.getElementById('journalDate'),
            chartStyleButtons: document.getElementById('chartStyleButtons'),
            candleHelp: document.getElementById('candleHelp'),
            chartLoadingOverlay: document.getElementById('chartLoadingOverlay'),
            chartLoadingText: document.getElementById('chartLoadingText'),
            lastRefreshLabel: document.getElementById('lastRefreshLabel'),
            manualRefreshBtn: document.getElementById('manualRefreshBtn'),
            detailPurchaseAmount: document.getElementById('detailPurchaseAmount'),
            detailPurchaseMeta: document.getElementById('detailPurchaseMeta'),
            themeToggle: document.getElementById('themeToggle'),
            preIpoBanner: document.getElementById('preIpoBanner'),
            preIpoBannerText: document.getElementById('preIpoBannerText'),
            preIpoFilingFacts: document.getElementById('preIpoFilingFacts'),
            alertBar: document.getElementById('alertBar'),
            alertList: document.getElementById('alertList'),
            alertEmptyHint: document.getElementById('alertEmptyHint'),
            enableNotifBtn: document.getElementById('enableNotifBtn'),
            testNotifBtn: document.getElementById('testNotifBtn'),
            alertTestToast: document.getElementById('alertTestToast'),
            alertTestToastBody: document.getElementById('alertTestToastBody'),
            detailInvestInput: document.getElementById('detailInvestInput'),
            detailForecastResult: document.getElementById('detailForecastResult'),
            detailForecastBand: document.getElementById('detailForecastBand'),
            detailForecastMeta: document.getElementById('detailForecastMeta'),
            forecastHorizonButtons: document.getElementById('forecastHorizonButtons'),
            dismissAlertsBtn: document.getElementById('dismissAlertsBtn')
        };

        this.setupEventListeners();
        this.initDate();
        this.buildRangeButtons();
        const today = new Date().toISOString().slice(0, 10);
        this.els.detailJournalDate.value = today;
        this.els.journalDate.value = today;
    }

    initDate() {
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        this.els.date.textContent = new Date().toLocaleDateString('en-US', dateOptions);
    }

    setupEventListeners() {
        this.els.backBtn.addEventListener('click', () => this.showDashboard());
        this.els.runAIBtn.addEventListener('click', () => this.app.handleAIAnalysis());
        this.els.retryAIBtn.addEventListener('click', () => {
            this.els.aiErrorState.classList.add('hidden');
            this.els.aiInputState.classList.remove('hidden');
        });
        
        this.els.addTickerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.app.addTicker(this.els.addTickerInput.value);
            this.els.addTickerInput.value = '';
        });

        this.els.sortSelect.addEventListener('change', () => this.app.setSort(this.els.sortSelect.value));
        this.els.sectorFilter.addEventListener('change', () => this.app.setSectorFilter(this.els.sectorFilter.value));

        this.els.navDashboard.addEventListener('click', () => this.showDashboard());
        this.els.navJournal.addEventListener('click', () => this.showJournal());
        this.els.themeToggle?.addEventListener('click', () => {
            const next = this.app.state.theme === 'night' ? 'day' : 'night';
            this.app.setTheme(next);
        });
        this.els.manualRefreshBtn?.addEventListener('click', () => this.app.manualRefresh());
        this.els.enableNotifBtn?.addEventListener('click', () => this.app.enableBrowserAlerts());
        this.els.testNotifBtn?.addEventListener('click', () => this.app.testBrowserAlert());
        this.els.dismissAlertsBtn?.addEventListener('click', () => this.app.dismissAlerts());
        this.els.detailInvestInput?.addEventListener('input', () => this.updateInvestmentForecast());
        this.els.detailInvestInput?.addEventListener('change', () => this.updateInvestmentForecast());
        this.buildForecastHorizonButtons();
        this.els.chartStyleButtons.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-chart-style]');
            if (btn) this.app.setChartStyle(btn.getAttribute('data-chart-style'));
        });

        this.els.journalForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.app.addJournalFromForm({
                ticker: document.getElementById('journalTicker').value,
                date: document.getElementById('journalDate').value,
                thesis: document.getElementById('journalThesis').value,
                invalidation: document.getElementById('journalInvalidation').value,
                outcome: document.getElementById('journalOutcome').value,
                attachAi: false
            });
            this.els.journalForm.reset();
            this.els.journalDate.value = new Date().toISOString().slice(0, 10);
        });

        this.els.detailJournalForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.app.addJournalFromForm({
                ticker: this.app.state.activeStock?.ticker,
                date: document.getElementById('detailJournalDate').value,
                thesis: document.getElementById('detailJournalThesis').value,
                invalidation: document.getElementById('detailJournalInvalidation').value,
                outcome: document.getElementById('detailJournalOutcome').value,
                attachAi: document.getElementById('detailJournalAttachAi').checked
            });
            document.getElementById('detailJournalThesis').value = '';
            document.getElementById('detailJournalInvalidation').value = '';
            document.getElementById('detailJournalAttachAi').checked = false;
        });

        this.els.journalList.addEventListener('click', (e) => this.handleJournalClick(e));
        this.els.detailJournalList.addEventListener('click', (e) => this.handleJournalClick(e));
        this.els.journalList.addEventListener('change', (e) => this.handleJournalChange(e));
        this.els.detailJournalList.addEventListener('change', (e) => this.handleJournalChange(e));
    }

    handleJournalClick(e) {
        const btn = e.target.closest('[data-journal-delete]');
        if (btn) this.app.deleteJournalEntry(btn.getAttribute('data-journal-delete'));
    }

    handleJournalChange(e) {
        const sel = e.target.closest('[data-journal-outcome]');
        if (sel) this.app.setJournalOutcome(sel.getAttribute('data-journal-outcome'), sel.value);
    }

    buildRangeButtons() {
        this.els.rangeButtons.innerHTML = '';
        CONFIG.ranges.forEach(range => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = range.label;
            btn.dataset.range = range.id;
            btn.className = 'range-btn px-2.5 py-1 text-[11px] font-semibold rounded text-zinc-500';
            btn.addEventListener('click', () => this.app.changeRange(range.id));
            this.els.rangeButtons.appendChild(btn);
        });
    }

    syncChartStyleButtons() {
        const style = this.app.state.chartStyle === 'line' ? 'line' : 'combo';
        this.els.chartStyleButtons.querySelectorAll('.chart-style-btn').forEach(btn => {
            const active = btn.getAttribute('data-chart-style') === style;
            btn.className = `chart-style-btn px-2.5 py-1 text-[11px] font-semibold rounded ${
                active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
            }`;
            btn.disabled = this.app.state.chartBusy;
        });
        if (style === 'line') {
            this.els.candleHelp.classList.add('hidden');
        } else {
            this.els.candleHelp.classList.remove('hidden');
            this.els.candleHelp.textContent =
                'Candles show each day’s open, high, low, and close. The smooth line is the recent average with a soft fade underneath.';
        }
    }

    syncThemeToggle() {
        const theme = this.app.state.theme;
        const btn = this.els.themeToggle;
        if (!btn) return;
        const isNight = theme === 'night';
        btn.setAttribute('aria-label', isNight ? 'Switch to day mode' : 'Switch to night mode');
        btn.innerHTML = isNight
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"></path></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>`;
    }

    chartColors() {
        const night = document.documentElement.getAttribute('data-theme') === 'night';
        if (night) {
            return {
                up: '#22c55e',
                down: '#f43f5e',
                line: '#67e8f9',
                closeUp: '#34d399',
                closeDown: '#fb7185',
                fillTopUp: 'rgba(52, 211, 153, 0.28)',
                fillTopDown: 'rgba(251, 113, 133, 0.28)',
                fillBottom: 'rgba(0, 0, 0, 0)',
                fillTop: 'rgba(103, 232, 249, 0.30)',
                grid: '#2a2f3a',
                muted: '#b4b4b4',
                tipBg: '#262626',
                ink: '#f5f5f5'
            };
        }
        return {
            up: '#059669',
            down: '#e11d48',
            line: '#0e7490',
            closeUp: '#047857',
            closeDown: '#be123c',
            fillTopUp: 'rgba(4, 120, 87, 0.22)',
            fillTopDown: 'rgba(190, 18, 60, 0.20)',
            fillBottom: 'rgba(255, 255, 255, 0)',
            fillTop: 'rgba(14, 116, 144, 0.26)',
            grid: '#ebe7ea',
            muted: '#4b5563',
            tipBg: '#1f1f1f',
            ink: '#1a1a1a'
        };
    }

    areaGradient(ctx, chartArea, top, bottom) {
        if (!chartArea) return top;
        const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0, top);
        g.addColorStop(1, bottom);
        return g;
    }

    beginnerCandleTip(bar) {
        const up = bar.close >= bar.open;
        return up
            ? `Up day. Buyers finished stronger. Close ₱${bar.close.toFixed(2)} was above the open.`
            : `Down day. Sellers finished stronger. Close ₱${bar.close.toFixed(2)} was below the open.`;
    }

    beginnerLineTip(label, value) {
        if (label === 'Trend line' || label === 'SMA20') {
            return `Trend line (20-day average): ₱${Number(value).toFixed(2)}. A smooth path of recent typical prices.`;
        }
        if (label === 'SMA50') {
            return `Slower average (50-day): ₱${Number(value).toFixed(2)}. Shows the longer drift.`;
        }
        return `Closing price: ₱${Number(value).toFixed(2)}. Where the stock ended that day.`;
    }

    redrawVisibleCharts() {
        if (this.app.state.currentView === 'dashboard') {
            this.renderDashboard();
            return;
        }
        if (this.app.state.currentView === 'detail' && this.app.state.activeStock) {
            const snap = this.app.state.getSnapshot(this.app.state.activeStock.ticker, this.app.state.activeRange);
            if (snap) this.showDetails(this.app.state.activeStock, snap, { soft: true });
        }
    }

    syncRangeButtons() {
        this.els.rangeButtons.querySelectorAll('.range-btn').forEach(btn => {
            const active = btn.dataset.range === this.app.state.activeRange;
            btn.className = `range-btn px-2.5 py-1 text-[11px] font-semibold rounded ${
                active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
            }`;
            btn.disabled = this.app.state.chartBusy;
        });
    }

    setChartBusy(busy, message = 'Updating chart…') {
        this.app.state.chartBusy = busy;
        if (this.els.chartLoadingText && message) {
            this.els.chartLoadingText.textContent = message;
        }
        this.els.chartLoadingOverlay?.classList.toggle('hidden', !busy);
        this.els.rangeButtons?.classList.toggle('chart-controls-locked', busy);
        this.els.chartStyleButtons?.classList.toggle('chart-controls-locked', busy);
        this.els.backBtn.disabled = busy;
        this.els.backBtn.classList.toggle('opacity-50', busy);
        this.els.backBtn.classList.toggle('pointer-events-none', busy);
        this.syncRangeButtons();
        this.syncChartStyleButtons();
    }

    resetChartCanvas(canvasId) {
        this.app.state.destroyChart(canvasId);
        const old = document.getElementById(canvasId);
        if (!old || !old.parentNode) return null;
        const fresh = old.cloneNode(false);
        fresh.removeAttribute('width');
        fresh.removeAttribute('height');
        old.parentNode.replaceChild(fresh, old);
        return fresh;
    }

    setNav(view) {
        this.els.navDashboard.className = `nav-pill px-3 py-1.5 rounded-full${view === 'dashboard' ? ' active' : ''}`;
        this.els.navJournal.className = `nav-pill px-3 py-1.5 rounded-full${view === 'journal' ? ' active' : ''}`;
    }

    syncWatchlistControls() {
        const current = this.app.state.sectorFilter || this.els.sectorFilter.value || 'all';
        this.els.sectorFilter.innerHTML = '<option value="all">All sectors</option>';
        this.app.state.sectors().forEach(sector => {
            const opt = document.createElement('option');
            opt.value = sector;
            opt.textContent = sector;
            this.els.sectorFilter.appendChild(opt);
        });
        const valid = current === 'all' || this.app.state.sectors().includes(current);
        const next = valid ? current : 'all';
        this.els.sectorFilter.value = next;
        if (this.app.state.sectorFilter !== next) {
            this.app.state.sectorFilter = next;
        }
    }

    setWatchlistMessage(msg, isError = false) {
        this.els.watchlistMessage.textContent = msg;
        this.els.watchlistMessage.classList.remove('hidden');
        this.els.watchlistMessage.className = `mb-4 text-xs ${isError ? 'text-red-600' : 'text-zinc-500'}`;
    }

    setRefreshStatus(text) {
        if (this.els.lastRefreshLabel) this.els.lastRefreshLabel.textContent = text;
    }

    updateRefreshIndicator() {
        if (!this.els.lastRefreshLabel) return;
        const at = this.app.state.lastRefreshedAt;
        if (!at) {
            this.els.lastRefreshLabel.textContent = 'Waiting for first price load…';
        } else {
            const time = new Date(at).toLocaleTimeString('en-PH', {
                hour: 'numeric',
                minute: '2-digit'
            });
            this.els.lastRefreshLabel.textContent = `Last refreshed ${time}`;
        }
        this.setRefreshBusy(this.app.state.refreshInFlight);
    }

    setRefreshBusy(busy) {
        const btn = this.els.manualRefreshBtn;
        if (!btn) return;
        btn.disabled = Boolean(busy);
        btn.classList.toggle('is-spinning', Boolean(busy));
    }

    syncAlertControls() {
        const btn = this.els.enableNotifBtn;
        if (!btn) return;
        const supported = typeof Notification !== 'undefined';
        if (!supported) {
            btn.textContent = 'Alerts unsupported';
            btn.disabled = true;
            if (this.els.testNotifBtn) this.els.testNotifBtn.disabled = true;
            return;
        }
        if (Notification.permission === 'granted' && this.app.state.browserAlertsEnabled) {
            btn.textContent = 'Browser alerts on';
            btn.disabled = true;
        } else if (Notification.permission === 'denied') {
            btn.textContent = 'Alerts blocked';
            btn.disabled = true;
        } else {
            btn.textContent = 'Enable browser alerts';
            btn.disabled = false;
        }
        if (this.els.testNotifBtn) this.els.testNotifBtn.disabled = false;
    }

    renderAlerts(alerts) {
        if (!this.els.alertBar || !this.els.alertList) return;
        const list = alerts || [];
        this.els.alertBar.classList.toggle('is-empty', list.length === 0);
        this.els.alertBar.classList.remove('hidden');

        if (!list.length) {
            this.els.alertList.innerHTML =
                '<p id="alertEmptyHint" class="text-xs text-zinc-500">No ±3% day moves right now. Enable browser alerts, then use Test to confirm notices work.</p>';
        } else {
            this.els.alertList.innerHTML = list.map(a => `
                <p class="text-xs leading-snug ${a.type === 'buy' ? 'alert-item-buy' : 'alert-item-sell'}">
                    <span class="font-semibold">${escapeHtml(a.title)}</span>
                    <span class="text-zinc-600"> · ${escapeHtml(a.body)}</span>
                </p>
            `).join('');
        }
        this.syncAlertControls();
    }

    showAlertTestToast(body) {
        if (!this.els.alertTestToast || !this.els.alertTestToastBody) return;
        this.els.alertTestToastBody.textContent = body;
        this.els.alertTestToast.classList.remove('hidden');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            this.els.alertTestToast.classList.add('hidden');
        }, 6000);
    }

    buildForecastHorizonButtons() {
        const host = this.els.forecastHorizonButtons;
        if (!host) return;
        const horizons = CONFIG.forecastHorizons || FORECAST_HORIZONS;
        host.innerHTML = '';
        horizons.forEach(h => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.forecastHorizon = h.id;
            btn.textContent = h.label;
            btn.className = 'forecast-horizon-btn px-2 py-1 text-[10px] font-semibold rounded border border-zinc-200 text-zinc-500';
            btn.addEventListener('click', () => this.app.setForecastHorizon(h.id));
            host.appendChild(btn);
        });
        this.syncForecastHorizonButtons();
    }

    syncForecastHorizonButtons() {
        const host = this.els.forecastHorizonButtons;
        if (!host) return;
        const active = this.app.state.forecastHorizon || '1mo';
        host.querySelectorAll('.forecast-horizon-btn').forEach(btn => {
            const on = btn.dataset.forecastHorizon === active;
            btn.className = `forecast-horizon-btn px-2 py-1 text-[10px] font-semibold rounded border ${
                on ? 'bg-white text-zinc-900 border-zinc-300 shadow-sm' : 'border-zinc-200 text-zinc-500'
            }`;
        });
    }

    async updateInvestmentForecast() {
        const input = this.els.detailInvestInput;
        const resultEl = this.els.detailForecastResult;
        const bandEl = this.els.detailForecastBand;
        const metaEl = this.els.detailForecastMeta;
        if (!input || !resultEl || !metaEl) return;

        const stock = this.app.state.activeStock;
        if (!stock) {
            resultEl.textContent = '—';
            if (bandEl) bandEl.textContent = '—';
            metaEl.textContent = 'Open a stock to project from its live history.';
            return;
        }
        if (stock.preIpo) {
            resultEl.textContent = 'Not available for Pre-IPO';
            if (bandEl) bandEl.textContent = '—';
            metaEl.textContent = 'GCash is a simulated forecast, not a live investable quote yet.';
            return;
        }

        this.syncForecastHorizonButtons();
        resultEl.textContent = 'Calculating…';
        if (bandEl) bandEl.textContent = 'Pulling price history…';

        // Prefer the longest live series we can get (1y → 6mo → 3mo → chart range).
        const candidates = [
            CONFIG.forecastHistoryRange || '1y',
            '6mo',
            '3mo',
            this.app.state.activeRange,
            '1mo'
        ];
        let snap = null;
        for (const rangeId of [...new Set(candidates)]) {
            try {
                const next = await this.app.ensureSnapshot(stock.ticker, rangeId);
                if (!next?.bars?.length) continue;
                if (next.source === 'preipo' || next.source === 'simulated') continue;
                if (!snap || next.bars.length > snap.bars.length) snap = next;
                // Good enough for any horizon once we have ~4 months of sessions
                if (snap.bars.length >= 90) break;
            } catch {
                /* try next range */
            }
        }
        if (!snap?.bars?.length) {
            resultEl.textContent = '—';
            if (bandEl) bandEl.textContent = '—';
            metaEl.textContent = 'Live history unavailable for projection.';
            return;
        }

        const horizon = this.app.state.forecastHorizon || '1mo';
        const forecast = projectHorizonInvestment(snap.bars, input.value, horizon);
        if (!forecast.ok) {
            resultEl.textContent = '—';
            if (bandEl) bandEl.textContent = '—';
            metaEl.textContent = forecast.note;
            return;
        }

        const sign = forecast.gain >= 0 ? '+' : '';
        const tone = forecast.gain >= 0 ? 'text-emerald-600' : 'text-red-600';
        resultEl.className = `text-sm font-semibold mt-1 ${tone}`;
        resultEl.textContent =
            `≈ ₱${forecast.projected.toLocaleString('en-PH', { minimumFractionDigits: 2 })} (${sign}₱${Math.abs(forecast.gain).toLocaleString('en-PH', { minimumFractionDigits: 2 })})`;
        if (bandEl) {
            bandEl.textContent =
                `1σ band ₱${forecast.low.toLocaleString('en-PH', { minimumFractionDigits: 2 })} – ₱${forecast.high.toLocaleString('en-PH', { minimumFractionDigits: 2 })} · expected ${forecast.expectedPct >= 0 ? '+' : ''}${forecast.expectedPct}% over ${forecast.horizonLabel}`;
        }
        const shareBit = forecast.shares != null
            ? `${forecast.shares} sh at ₱${forecast.price.toFixed(2)} · `
            : '';
        metaEl.textContent =
            `${shareBit}Trail ${forecast.trailPct >= 0 ? '+' : ''}${forecast.trailPct}% over last ${forecast.horizonLabel}; vol ±${forecast.volPct}%. ${forecast.trendNote}. ${forecast.method} Not a promise of profit.`;
    }

    formatPurchaseLine(purchase) {
        if (!purchase?.entry || !purchase?.spend) return { amount: '—', meta: 'Need more price history.' };
        return {
            amount: `~₱${purchase.spend.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
            meta: `${purchase.shares} sh @ ₱${purchase.entry.toFixed(2)} · stop ~₱${purchase.stop.toFixed(2)} · practice only`
        };
    }

    /** Always group in the UI so section headers never collapse into one flat list. */
    dashboardSectionsFromWatchlist() {
        const visible = this.app.state.visibleStocks();
        const defs = CONFIG.watchlistSections || WATCHLIST_SECTIONS || [];
        return defs.map(section => ({
            ...section,
            stocks: visible.filter(s => stockGroup(s) === section.id)
        }));
    }

    renderDashboard() {
        const host = this.els.dashboardSections;
        if (!host) {
            console.error('dashboardSections element missing');
            return;
        }

        const sections = this.dashboardSectionsFromWatchlist();
        const total = sections.reduce((n, s) => n + (s.stocks?.length || 0), 0);
        if (this.els.emptyWatchlist) {
            this.els.emptyWatchlist.classList.toggle('hidden', total > 0);
        }

        // Build off-DOM so a card error cannot leave a wiped page.
        const frag = document.createDocumentFragment();
        const chartJobs = [];

        sections.forEach(section => {
            if (!section.stocks?.length) return;

            const block = document.createElement('section');
            block.className = `watchlist-section watchlist-section--${section.id}`;
            block.dataset.section = section.id;

            const heading = document.createElement('div');
            heading.className = 'watchlist-section__head';
            heading.innerHTML = `
                <p class="watchlist-section__eyebrow">${escapeHtml(
                    section.id === 'bluechip' ? 'Core list' :
                    section.id === 'lowcost' ? 'Income basket' : 'Extras'
                )}</p>
                <h3 class="watchlist-section__title">${escapeHtml(section.title)}</h3>
                <p class="watchlist-section__blurb">${escapeHtml(section.blurb || '')}</p>
            `;
            block.appendChild(heading);

            const grid = document.createElement('div');
            grid.className = 'watchlist-section__grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';

            section.stocks.forEach(stock => {
                try {
                    const { card, snap } = this.buildStockCard(stock);
                    grid.appendChild(card);
                    if (snap?.bars?.length) {
                        chartJobs.push({ id: `dash-chart-${stock.ticker}`, bars: snap.bars });
                    }
                } catch (err) {
                    console.warn(`Card render failed for ${stock?.ticker}:`, err);
                }
            });

            if (!grid.childElementCount) return;
            block.appendChild(grid);
            frag.appendChild(block);
        });

        host.replaceChildren(frag);
        chartJobs.forEach(job => this.drawMiniChart(job.id, job.bars));
    }

    buildStockCard(stock) {
        const snap = this.app.state.getSnapshot(stock.ticker, CONFIG.dashboardRange);
        const bars = Array.isArray(snap?.bars) ? snap.bars : [];
        const isPreIpo = Boolean(stock.preIpo || snap?.preIpo || snap?.source === 'preipo');
        const filing = snap?.filing || (isPreIpo ? CONFIG.gcashPreIpo : null);
            const card = document.createElement('div');
        card.className = `bg-white border border-zinc-200 rounded-lg p-5 shadow-sm flex flex-col hover:shadow-md transition-shadow cursor-pointer relative${isPreIpo ? ' preipo-card' : ''}`;
            card.onclick = () => this.app.openDetails(stock.ticker);

        const lastBar = bars.length ? bars[bars.length - 1] : null;
        const latest = lastBar != null && Number.isFinite(Number(lastBar.close))
            ? Number(lastBar.close)
            : null;
        const stats = bars.length ? summarizeBars(bars) : null;
        const isUp = stats ? stats.pctChange >= 0 : true;
        const source = snap?.source;
        const purchase = stats ? this.formatPurchaseLine(stats.purchase) : null;
        const ipoPrice = filing?.finalOfferPrice != null ? Number(filing.finalOfferPrice) : null;

            card.innerHTML = `
            ${stock.locked ? '' : `<button type="button" data-remove="${escapeHtml(stock.ticker)}" class="absolute top-3 right-3 text-zinc-300 hover:text-zinc-700 text-lg leading-none" aria-label="Remove ${escapeHtml(stock.ticker)}">&times;</button>`}
            <div class="flex justify-between items-start mb-4 ${stock.locked ? '' : 'pr-6'}">
                    <div>
                    <h3 class="text-sm font-bold text-zinc-900">${escapeHtml(stock.name)}</h3>
                    <p class="text-xs font-medium text-zinc-500 mt-0.5 tracking-wider uppercase">${
                        isPreIpo ? 'Simulated · Pre-IPO' : `PSE:${escapeHtml(stock.ticker)}`
                    }</p>
                    </div>
                    <span class="inline-flex items-center rounded bg-zinc-100 px-2 py-1 text-[9px] font-bold text-zinc-600 uppercase tracking-wide">
                    ${escapeHtml(stock.sector)}
                    </span>
                </div>
            ${isPreIpo ? `
            <div class="mb-3 p-2 rounded border border-amber-100 bg-amber-50">
                <p class="text-[9px] font-bold uppercase tracking-widest text-amber-800">Final IPO ${ipoPrice != null ? `₱${ipoPrice.toFixed(2)}` : '—'} · not listed yet</p>
                <p class="text-[10px] text-zinc-600 mt-1 leading-snug">Pre-listing forecast around the official ${ipoPrice != null ? `₱${ipoPrice.toFixed(2)}` : 'IPO'} price. Offer ${escapeHtml(filing?.offerPeriod || '')}. Listing ${escapeHtml(filing?.listingTarget || '')}.</p>
            </div>` : ''}
            <div class="flex justify-between items-end mb-2">
                <div class="has-tip">
                    <p class="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">${isPreIpo ? 'Model price' : 'Last close'}</p>
                    <p class="text-xl font-bold text-zinc-900">${latest == null ? 'Loading...' : '₱' + latest.toFixed(2)}</p>
                    <p class="text-[10px] text-zinc-500 mt-1">${isPreIpo ? 'Simulated, not a PSE quote' : 'Ending market price'}</p>
                    <span class="tip-bubble">${isPreIpo
                        ? 'Education only. Built from Mynt IPO-band and earnings context, not live trading.'
                        : 'The stock’s ending price for the last trading day.'}</span>
                </div>
                <div class="text-right">
                    <span class="text-xs font-bold ${isUp ? 'text-emerald-600' : 'text-red-600'}">${
                        stats ? `${stats.pctChange >= 0 ? '+' : ''}${stats.pctChange.toFixed(2)}%` : '--'
                    }</span>
                </div>
            </div>
            <div class="mb-3 flex flex-wrap gap-1.5 items-center">
                ${isPreIpo ? `<span class="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-amber-50 text-amber-800">Pre-IPO forecast</span>` : ''}
                ${stats && !isPreIpo ? `<span class="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${
                    isUp ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                }">${stats.trendLabel}</span>` : ''}
                ${source === 'preipo' ? `<span class="has-tip text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-amber-50 text-amber-800">Simulated<span class="tip-bubble">Not listed on the PSE. Chart is a forecast model only.</span></span>`
                    : source ? `<span class="has-tip text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${
                    source === 'live' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }">${source === 'live' ? 'Live' : 'Simulated'}<span class="tip-bubble">${
                    source === 'live'
                        ? 'Prices from PSE Edge (or phisix fallback) in Philippine pesos.'
                        : 'Live quotes failed, so this is practice data only.'
                }</span></span>` : ''}
            </div>
            ${isPreIpo && filing ? `
            <div class="mb-3 bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2 text-[10px] text-zinc-600 space-y-0.5">
                <p>Final IPO: ${ipoPrice != null ? `₱${ipoPrice.toFixed(2)}` : '—'} · valuation ~₱${filing.impliedValuationB ?? '—'}B</p>
                <p>NI 2025: ₱${filing.netIncome2025B ?? '—'}B · Q1 2026: ₱${filing.netIncomeQ12026B ?? '—'}B</p>
            </div>` : ''}
            ${purchase && !isPreIpo ? `
            <div class="mb-3 has-tip bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2">
                <p class="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold">Starter buy idea</p>
                <p class="text-sm font-semibold text-zinc-900 mt-0.5">${escapeHtml(purchase.amount || '—')}</p>
                <p class="text-[10px] text-zinc-500 mt-0.5">${escapeHtml(purchase.meta || '')}</p>
                <span class="tip-bubble">A practice-sized buy near recent support. About ₱1,000 would be at risk if the stop is hit. Not advice.</span>
            </div>` : ''}
            <div class="h-28 mb-4 w-full relative">
                 <canvas id="dash-chart-${escapeHtml(stock.ticker)}"></canvas>
            </div>
                <div class="mt-auto pt-4 border-t border-zinc-100 flex justify-between items-center text-xs">
                 <span class="text-zinc-500 font-medium">${isPreIpo ? 'View forecast' : 'View Analysis'}</span>
                     <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </div>
            `;
        const removeBtn = card.querySelector('[data-remove]');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.app.removeTicker(stock.ticker);
            });
        }
        return { card, snap };
    }

    drawMiniChart(canvasId, bars) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || typeof Chart === 'undefined' || !bars?.length) return;
        this.app.state.destroyChart(canvasId);
        const colors = this.chartColors();
        const prices = bars.map(d => d.close);
        const isUp = prices[prices.length - 1] >= prices[0];
        const stroke = isUp ? colors.closeUp : colors.closeDown;
        const fillTop = isUp ? colors.fillTopUp : colors.fillTopDown;

        const chart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: bars.map(d => d.date),
                datasets: [{
                    label: 'Close',
                    data: prices,
                    borderColor: stroke,
                    borderWidth: 2.25,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: true,
                    tension: 0.15,
                    backgroundColor: (context) => {
                        const { chart } = context;
                        const { ctx, chartArea } = chart;
                        if (!chartArea) return fillTop;
                        return this.areaGradient(ctx, chartArea, fillTop, colors.fillBottom);
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        mode: 'index',
                        intersect: false,
                        backgroundColor: colors.tipBg,
                        displayColors: false,
                        callbacks: {
                            title: (items) => items[0]?.label || '',
                            label: (ctx) => {
                                const b = bars[ctx.dataIndex];
                                if (!b) return '';
                                return this.beginnerLineTip('Close', b.close);
                            },
                            afterBody: (items) => {
                                const b = bars[items[0]?.dataIndex];
                                if (!b) return [];
                                return [`O ₱${b.open.toFixed(2)}  H ₱${b.high.toFixed(2)}  L ₱${b.low.toFixed(2)}  C ₱${b.close.toFixed(2)}`];
                            }
                        }
                    }
                },
                scales: {
                    x: { display: false },
                    y: { display: false, beginAtZero: false }
                },
                interaction: { mode: 'nearest', axis: 'x', intersect: false }
            }
        });
        this.app.state.registerChart(canvasId, chart);
    }

    drawDetailCharts(snapshot) {
        if (typeof Chart === 'undefined') return;
        const priceCanvas = this.resetChartCanvas('largeChartCanvas');
        const volumeCanvas = this.resetChartCanvas('volumeChartCanvas');
        if (!priceCanvas || !volumeCanvas) return;

        const bars = snapshot.bars;
        const stats = summarizeBars(bars);
        const labels = bars.map(d => d.date);
        const useCombo = this.app.state.chartStyle !== 'line';
        const colors = this.chartColors();

        const trendFill = (context) => {
            const { chart } = context;
            const { ctx, chartArea } = chart;
            if (!chartArea) return colors.fillTop;
            return this.areaGradient(ctx, chartArea, colors.fillTop, colors.fillBottom);
        };

        const smaDatasets = [
            {
                type: 'line',
                label: 'Trend line',
                data: stats.sma20Series,
                borderColor: colors.line,
                borderWidth: 2.5,
                pointRadius: 0,
                fill: true,
                spanGaps: true,
                order: 0,
                backgroundColor: trendFill
            },
            {
                type: 'line',
                label: 'SMA50',
                data: stats.sma50Series,
                borderColor: colors.muted,
                borderWidth: 1.75,
                borderDash: [5, 4],
                pointRadius: 0,
                fill: false,
                spanGaps: true,
                order: 0
            }
        ];

        let datasets;
        if (useCombo) {
            const candleDatasets = this.candleDatasets(bars, colors);
            const bodyThickness = bars.length > 120 ? 3 : bars.length > 50 ? 5 : 8;
            candleDatasets[1].barThickness = bodyThickness;
            candleDatasets[0].barThickness = Math.max(1, Math.round(bodyThickness / 6));
            datasets = [...candleDatasets, ...smaDatasets];
        } else {
            const closes = bars.map(d => d.close);
            const isUp = closes[closes.length - 1] >= closes[0];
            datasets = [
                {
                    type: 'line',
                    label: 'Close',
                    data: closes,
                    borderColor: isUp ? colors.closeUp : colors.closeDown,
                    borderWidth: 2.5,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: true,
                    tension: 0.15,
                    order: 1,
                    backgroundColor: (context) => {
                        const { chart } = context;
                        const { ctx, chartArea } = chart;
                        if (!chartArea) return isUp ? colors.fillTopUp : colors.fillTopDown;
                        return this.areaGradient(
                            ctx,
                            chartArea,
                            isUp ? colors.fillTopUp : colors.fillTopDown,
                            colors.fillBottom
                        );
                    }
                },
                {
                    ...smaDatasets[0],
                    fill: false,
                    backgroundColor: 'transparent',
                    borderWidth: 2
                },
                smaDatasets[1]
            ];
        }

        const priceChart = new Chart(priceCanvas.getContext('2d'), {
            type: useCombo ? 'bar' : 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                datasets: useCombo ? { bar: { grouped: false } } : {},
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            boxWidth: 12,
                            font: { size: 10 },
                            color: colors.muted,
                            filter: (item) => ['Trend line', 'SMA50', 'Close'].includes(item.text)
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: colors.tipBg,
                        titleColor: '#fff',
                        bodyColor: '#f4f4f5',
                        displayColors: false,
                        filter: (item) => {
                            const label = item.dataset.label;
                            if (useCombo) return label === 'Candle' || label === 'Trend line' || label === 'SMA50';
                            return label === 'Close' || label === 'Trend line' || label === 'SMA50';
                        },
                        callbacks: {
                            label: (ctx) => {
                                const i = ctx.dataIndex;
                                if (ctx.dataset.label === 'Candle') {
                                    const b = bars[i];
                                    return this.beginnerCandleTip(b);
                                }
                                if (ctx.parsed.y == null) return '';
                                return this.beginnerLineTip(ctx.dataset.label, ctx.parsed.y);
                            },
                            afterBody: (items) => {
                                const i = items[0]?.dataIndex;
                                const b = bars[i];
                                if (!b) return [];
                                return [
                                    `O ₱${b.open.toFixed(2)}  H ₱${b.high.toFixed(2)}  L ₱${b.low.toFixed(2)}  C ₱${b.close.toFixed(2)}  V ${formatVolume(b.volume)}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: { display: false },
                        stacked: false,
                        ticks: { color: colors.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }
                    },
                    y: {
                        display: true,
                        grid: { color: colors.grid },
                        stacked: false,
                        beginAtZero: false,
                        ticks: { color: colors.muted }
                    }
                },
                interaction: { mode: 'nearest', axis: 'x', intersect: false }
            }
        });
        this.app.state.registerChart('largeChartCanvas', priceChart);

        const volumeChart = new Chart(volumeCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: bars.map(b => b.volume),
                    backgroundColor: bars.map(b => b.close >= b.open
                        ? `${colors.up}73`
                        : `${colors.down}73`)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: colors.tipBg,
                        displayColors: false,
                        callbacks: {
                            label: (ctx) => {
                                const b = bars[ctx.dataIndex];
                                return `Volume ${formatVolume(b?.volume)}. How many shares changed hands that day.`;
                            }
                        }
                    }
                },
                scales: {
                    x: { display: false },
                    y: { display: false }
                }
            }
        });
        this.app.state.registerChart('volumeChartCanvas', volumeChart);
    }

    candleDatasets(bars, colors = this.chartColors()) {
        const palette = bars.map(b => b.close >= b.open ? colors.up : colors.down);
        return [
            {
                type: 'bar',
                label: 'Wick',
                data: bars.map(b => this.wickRange(b)),
                backgroundColor: palette,
                borderWidth: 0,
                order: 3
            },
            {
                type: 'bar',
                label: 'Candle',
                data: bars.map(b => this.bodyRange(b)),
                backgroundColor: palette,
                borderWidth: 0,
                order: 2
            }
        ];
    }

    wickRange(bar) {
        if (bar.high === bar.low) {
            const pad = Math.max(bar.close * 0.001, 0.01);
            return [bar.low - pad, bar.high + pad];
        }
        return [bar.low, bar.high];
    }

    bodyRange(bar) {
        let lo = Math.min(bar.open, bar.close);
        let hi = Math.max(bar.open, bar.close);
        if (hi === lo) {
            const pad = Math.max((bar.high - bar.low) * 0.12, bar.close * 0.0008, 0.01);
            return [lo - pad, hi + pad];
        }
        return [lo, hi];
    }

    renderIndicators(stats) {
        const atrPct = stats.atr && stats.latestClose
            ? ` (${((stats.atr / stats.latestClose) * 100).toFixed(1)}%)`
            : '';
        const cells = [
            {
                label: 'RSI 14',
                value: stats.rsi == null ? '—' : `${stats.rsi} ${stats.rsiLabel}`,
                tip: this.rsiTip(stats)
            },
            {
                label: 'Trend vs SMA',
                value: stats.smaBias,
                tip: this.smaTip(stats)
            },
            {
                label: 'ATR 14',
                value: stats.atr == null ? 'Need more bars' : `₱${stats.atr.toFixed(2)}${atrPct}`,
                tip: this.atrTip(stats)
            },
            {
                label: 'Range S/R',
                value: stats.support == null ? '—' : `₱${stats.support.toFixed(2)} · ₱${stats.resistance.toFixed(2)}`,
                tip: this.srTip(stats)
            }
        ];
        this.els.indicatorRow.innerHTML = cells.map((c, i) => `
            <div class="stat-card bg-white border border-zinc-200 rounded-lg p-3 cursor-help" tabindex="0">
                <p class="stat-tip ${i >= 2 ? 'stat-tip-end' : ''}">${escapeHtml(c.tip)}</p>
                <p class="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold mb-1">${c.label}</p>
                <p class="text-xs font-medium text-zinc-800">${escapeHtml(c.value)}</p>
            </div>
        `).join('');
    }

    rsiTip(stats) {
        if (stats.rsi == null) {
            return 'RSI shows whether recent days leaned more toward buying or selling. Need more history first.';
        }
        const n = stats.rsi;
        if (n >= 70) return `RSI is ${n}. Recent buying looks strong, which can mean the stock is stretched upward.`;
        if (n <= 30) return `RSI is ${n}. Recent selling looks heavy, which can mean the stock is stretched downward.`;
        return `RSI is ${n}. Recent trading sits in a middle zone, not clearly stretched either way.`;
    }

    smaTip(stats) {
        if (stats.sma20 == null) {
            return 'SMA20 is the average close over the last 20 days. Try the 1M range to see it.';
        }
        if (stats.latestClose >= stats.sma20) {
            return 'Price is above its 20-day average, so recent closes have been stronger than that typical level.';
        }
        return 'Price is below its 20-day average, so recent closes have been weaker than that typical level.';
    }

    atrTip(stats) {
        if (stats.atr == null) {
            return 'ATR measures the usual daily price swing. Try a longer range like 1M.';
        }
        const pct = stats.latestClose ? ((stats.atr / stats.latestClose) * 100).toFixed(1) : null;
        const pctBit = pct ? ` About ${pct}% of the last close.` : '';
        return `ATR is about ₱${stats.atr.toFixed(2)}.${pctBit} A higher number means a bumpier stock.`;
    }

    srTip(stats) {
        if (stats.support == null) {
            return 'Support and resistance are the lowest and highest prices in this chart window.';
        }
        return `₱${stats.support.toFixed(2)} is the recent low and ₱${stats.resistance.toFixed(2)} is the recent high in this window. They often act like a soft floor and ceiling.`;
    }

    showDashboard() {
        this.app.state.currentView = 'dashboard';
        this.els.detailView.classList.add('hidden');
        this.els.journalView.classList.add('hidden');
        this.els.dashboardView.classList.remove('hidden');
        this.setNav('dashboard');
        this.renderDashboard();
    }

    showJournal() {
        this.app.state.currentView = 'journal';
        this.els.detailView.classList.add('hidden');
        this.els.dashboardView.classList.add('hidden');
        this.els.journalView.classList.remove('hidden');
        this.setNav('journal');
        this.renderJournal();
    }

    showDetailsLoading(stock) {
        this.app.state.currentView = 'detail';
        this.els.dashboardView.classList.add('hidden');
        this.els.journalView.classList.add('hidden');
        this.els.detailView.classList.remove('hidden');
        this.setNav('dashboard');
        this.els.detailName.textContent = stock.name;
        this.els.detailTicker.textContent = stock.preIpo ? 'Simulated · Pre-IPO' : `PSE:${stock.ticker}`;
        this.els.detailDataMeta.textContent = 'Loading series…';
        this.syncRangeButtons();
    }

    showDetails(stock, snapshot, { soft = false } = {}) {
        const stats = summarizeBars(snapshot.bars);
        const isPreIpo = Boolean(stock.preIpo || snapshot.preIpo || snapshot.source === 'preipo');
        const filing = snapshot.filing || (isPreIpo ? CONFIG.gcashPreIpo : null);

        this.els.detailName.textContent = stock.name;
        this.els.detailTicker.textContent = isPreIpo ? 'Simulated · Pre-IPO forecast' : `PSE:${stock.ticker}`;
        this.els.detailPrice.textContent = `₱${stats.latestClose.toFixed(2)}`;
        const up = stats.pctChange >= 0;
        this.els.detailPctChange.textContent = `${up ? '+' : ''}${stats.pctChange.toFixed(2)}%`;
        this.els.detailPctChange.className = `text-sm font-semibold mt-1 ${up ? 'text-emerald-600' : 'text-red-600'}`;
        this.els.detailDataMeta.textContent = isPreIpo
            ? `Pre-IPO simulation · ${this.rangeLabel(snapshot.range)} · as of ${formatFetchedAt(snapshot.fetchedAt)}`
            : `${snapshot.source === 'live' ? 'Live PSE' : 'Simulated practice data'} · ${this.rangeLabel(snapshot.range)} · as of ${formatFetchedAt(snapshot.fetchedAt)}`;

        const purchase = this.formatPurchaseLine(stats.purchase);
        if (this.els.detailPurchaseAmount) this.els.detailPurchaseAmount.textContent = purchase.amount;
        if (this.els.detailPurchaseMeta) {
            this.els.detailPurchaseMeta.textContent = isPreIpo
                ? 'Practice sizing only. GCash is not listed yet.'
                : purchase.meta;
        }
        this.updateInvestmentForecast();

        if (this.els.preIpoBanner) {
            this.els.preIpoBanner.classList.toggle('hidden', !isPreIpo);
            if (isPreIpo && filing && this.els.preIpoBannerText) {
                this.els.preIpoBannerText.textContent =
                    `Official final IPO price is ₱${Number(filing.finalOfferPrice).toFixed(2)} (set Oct 1–2, 2026). This chart is still a pre-listing forecast of market expectations around that price, using Mynt’s disclosed earnings. Live PSE quotes appear here only after GCASH starts trading.`;
                this.els.preIpoFilingFacts.innerHTML = `
                    <div class="bg-white/70 border border-zinc-200 rounded p-2"><p class="text-[9px] uppercase text-zinc-500 font-semibold">Final IPO price</p><p class="font-semibold text-zinc-800">₱${Number(filing.finalOfferPrice).toFixed(2)}</p></div>
                    <div class="bg-white/70 border border-zinc-200 rounded p-2"><p class="text-[9px] uppercase text-zinc-500 font-semibold">Listing date</p><p class="font-semibold text-zinc-800">${escapeHtml(filing.listingTarget)}</p></div>
                    <div class="bg-white/70 border border-zinc-200 rounded p-2"><p class="text-[9px] uppercase text-zinc-500 font-semibold">Offer period</p><p class="font-semibold text-zinc-800">${escapeHtml(filing.offerPeriod || '—')}</p></div>
                    <div class="bg-white/70 border border-zinc-200 rounded p-2"><p class="text-[9px] uppercase text-zinc-500 font-semibold">Valuation @ IPO</p><p class="font-semibold text-zinc-800">~₱${filing.impliedValuationB}B</p></div>
                    <div class="bg-white/70 border border-zinc-200 rounded p-2"><p class="text-[9px] uppercase text-zinc-500 font-semibold">NI 2025 / Q1’26</p><p class="font-semibold text-zinc-800">₱${filing.netIncome2025B}B / ₱${filing.netIncomeQ12026B}B</p></div>
                    <div class="bg-white/70 border border-zinc-200 rounded p-2"><p class="text-[9px] uppercase text-zinc-500 font-semibold">Prior indication</p><p class="font-semibold text-zinc-800">Up to ₱${filing.priorBandHigh?.toFixed?.(2) || filing.priorBandHigh} (~₱${filing.priorMaxValuationB}B)</p></div>
                `;
            }
        }

        this.els.dashboardView.classList.add('hidden');
        this.els.journalView.classList.add('hidden');
        this.els.detailView.classList.remove('hidden');
        this.syncRangeButtons();
        this.syncChartStyleButtons();
        this.renderIndicators(stats);
        this.drawDetailCharts(snapshot);
        if (!soft) this.renderDetailJournal(stock.ticker);

        const caution = snapshot.source === 'simulated' || isPreIpo;
        this.els.aiSimBanner.classList.toggle('hidden', !caution);
        this.els.aiSimBanner.textContent = isPreIpo
            ? 'Pre-IPO simulation only. AI will use Mynt filing figures and must not treat this as a live PSE quote.'
            : 'Chart is simulated fallback data. Analysis will treat it as untrustworthy.';
        this.els.runAIBtn.textContent = isPreIpo
            ? 'Run Pre-IPO analysis'
            : caution
                ? 'Run analysis anyway'
                : 'Run Market Analysis';

        if (soft) return;

        const cacheKey = this.app.state.aiCacheKey(stock.ticker, this.app.state.activeRange, snapshot);
        const cached = this.app.state.getAiCache(cacheKey);
        if (cached) {
            this.setAIResults(cached.data, cached.at, snapshot.source);
        } else {
            this.resetAIPanel();
        }
    }

    rangeLabel(id) {
        return CONFIG.ranges.find(r => r.id === id)?.label || id;
    }

    resetAIPanel() {
        this.els.aiInputState.classList.remove('hidden');
        this.els.aiResultsState.classList.add('hidden');
        this.els.aiLoadingState.classList.add('hidden');
        this.els.aiErrorState.classList.add('hidden');
        this.els.runAIBtn.disabled = false;
    }

    setAILoading() {
        this.els.aiInputState.classList.add('hidden');
        this.els.aiLoadingState.classList.remove('hidden');
        this.els.aiErrorState.classList.add('hidden');
        this.els.aiResultsState.classList.add('hidden');
        this.els.runAIBtn.disabled = true;
    }

    setAIResults(aiData, at, source) {
        this.els.outTrend.textContent = aiData.trend;
        this.els.outRationale.textContent = aiData.rationale;
        this.els.aiAsOf.textContent = `As of ${formatFetchedAt(at)}${
            source === 'preipo' ? ' · Pre-IPO simulation' : source === 'simulated' ? ' · simulated prices' : ''
        }`;
        
        const action = String(aiData.action).toUpperCase();
        this.els.outAction.textContent = action;
        this.els.outAction.className = 'text-sm font-bold tracking-widest uppercase';
        if (action.includes('BUY')) this.els.outAction.classList.add('text-emerald-600');
        else if (action.includes('SELL')) this.els.outAction.classList.add('text-red-600');
        else this.els.outAction.classList.add('text-zinc-500');

        this.els.aiLoadingState.classList.add('hidden');
        this.els.aiInputState.classList.add('hidden');
        this.els.aiErrorState.classList.add('hidden');
        this.els.aiResultsState.classList.remove('hidden');
        this.els.runAIBtn.disabled = false;
    }

    setAIError(msg) {
        this.els.aiErrorText.textContent = msg;
        this.els.aiLoadingState.classList.add('hidden');
        this.els.aiErrorState.classList.remove('hidden');
        this.els.runAIBtn.disabled = false;
    }

    journalCardHtml(entry) {
        const ai = entry.aiSnapshot
            ? `<p class="mt-2 text-[11px] text-zinc-500"><span class="font-semibold">${escapeHtml(String(entry.aiSnapshot.action || ''))}</span> · ${escapeHtml(entry.aiSnapshot.rationale || '')}</p>`
            : '';
        return `
            <div class="border border-zinc-200 rounded-lg p-4 bg-white">
                <div class="flex justify-between items-start gap-3">
                    <div>
                        <p class="text-sm font-semibold text-zinc-900">${escapeHtml(entry.ticker)} · ${escapeHtml(entry.date)}</p>
                        <p class="text-xs text-zinc-600 mt-2">${escapeHtml(entry.thesis || '—')}</p>
                        <p class="text-[11px] text-zinc-500 mt-1">Invalidation: ${escapeHtml(entry.invalidation || '—')}</p>
                        ${ai}
                    </div>
                    <div class="flex flex-col items-end gap-2">
                        <select data-journal-outcome="${escapeHtml(entry.id)}" class="text-[11px] border border-zinc-200 rounded px-2 py-1">
                            ${['open', 'win', 'loss', 'scratch'].map(o =>
                                `<option value="${o}" ${entry.outcome === o ? 'selected' : ''}>${o}</option>`
                            ).join('')}
                        </select>
                        <button type="button" data-journal-delete="${escapeHtml(entry.id)}" class="text-[11px] text-zinc-400 hover:text-red-600">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }

    renderJournal() {
        const entries = this.app.state.journal;
        this.els.journalEmpty.classList.toggle('hidden', entries.length > 0);
        this.els.journalList.innerHTML = entries.map(e => this.journalCardHtml(e)).join('');
    }

    renderDetailJournal(ticker) {
        const entries = this.app.state.journalFor(ticker);
        this.els.detailJournalList.innerHTML = entries.length
            ? entries.map(e => this.journalCardHtml(e)).join('')
            : '<p class="text-xs text-zinc-400">No entries for this ticker yet.</p>';
    }
}
