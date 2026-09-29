/**
 * ==========================================
 * UI CONTROLLER LAYER
 * ==========================================
 */
import { CONFIG } from './config.js';

export class UIController {
    constructor(app) {
        this.app = app;
        
        // DOM Elements cache
        this.els = {
            date: document.getElementById('currentDate'),
            dashboardView: document.getElementById('dashboardView'),
            detailView: document.getElementById('detailView'),
            stockGrid: document.getElementById('stockGrid'),
            backBtn: document.getElementById('backBtn'),
            detailName: document.getElementById('detailStockName'),
            detailTicker: document.getElementById('detailStockTicker'),
            detailPrice: document.getElementById('detailLatestPrice'),
            // Removed apiKeyInput and apiKeyError
            runAIBtn: document.getElementById('runAIBtn'),
            retryAIBtn: document.getElementById('retryAIBtn'),
            aiInputState: document.getElementById('aiInputState'),
            aiLoadingState: document.getElementById('aiLoadingState'),
            aiErrorState: document.getElementById('aiErrorState'),
            aiResultsState: document.getElementById('aiResultsState'),
            aiErrorText: document.getElementById('aiErrorText'),
            outTrend: document.getElementById('outTrend'),
            outAction: document.getElementById('outAction'),
            outRationale: document.getElementById('outRationale')
        };

        this.setupEventListeners();
        this.initDate();
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
        
        // Removed apiKeyInput event listener
    }

    createDashboardCards() {
        this.els.stockGrid.innerHTML = '';
        CONFIG.stocks.forEach(stock => {
            const card = document.createElement('div');
            card.className = "bg-white border border-zinc-200 rounded-lg p-5 shadow-sm flex flex-col hover:shadow-md transition-shadow cursor-pointer";
            // Using event delegation via inline arrow function for simplicity in this context
            card.onclick = () => this.app.openDetails(stock.ticker);
            card.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="text-sm font-bold text-zinc-900">${stock.name}</h3>
                        <p class="text-xs font-medium text-zinc-500 mt-0.5 tracking-wider uppercase">PSE:${stock.ticker}</p>
                    </div>
                    <span class="inline-flex items-center rounded bg-zinc-100 px-2 py-1 text-[9px] font-bold text-zinc-600 uppercase tracking-wide">
                        ${stock.sector}
                    </span>
                </div>
                
                <div class="flex justify-between items-end mb-4">
                    <div>
                        <p class="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">Est. Price</p>
                        <p class="text-xl font-bold text-zinc-900" id="dash-price-${stock.ticker}">Loading...</p>
                    </div>
                    <div class="text-right">
                        <span id="dash-trend-${stock.ticker}" class="text-xs font-bold uppercase tracking-wider text-zinc-400">--</span>
                    </div>
                </div>

                <div class="h-24 mb-4 w-full relative">
                     <canvas id="dash-chart-${stock.ticker}"></canvas>
                </div>
                
                <div class="mt-auto pt-4 border-t border-zinc-100 flex justify-between items-center text-xs">
                     <span class="text-zinc-500 font-medium">View Analysis</span>
                     <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </div>
            `;
            this.els.stockGrid.appendChild(card);
        });
    }

    updateDashboardCardData(ticker, latestPrice, trendData) {
        document.getElementById(`dash-price-${ticker}`).textContent = `₱${latestPrice.toFixed(2)}`;
        
        const trendEl = document.getElementById(`dash-trend-${ticker}`);
        const isUp = trendData.last > trendData.first;
        
        trendEl.textContent = isUp ? 'BULLISH' : 'BEARISH';
        trendEl.className = `text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider ${isUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`;
    }

    drawChart(canvasId, data, isMini = false, appStateRef) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        const labels = data.map(d => d.date);
        const prices = data.map(d => d.price);
        
        const firstPrice = prices[0];
        const lastPrice = prices[prices.length - 1];
        const isUp = lastPrice >= firstPrice;
        const lineColor = isUp ? '#10b981' : '#f43f5e';
        const bgColor = isUp ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)';

        // Ensure Chart.js is available globally (loaded via CDN in HTML)
        if (typeof Chart === 'undefined') {
            console.error('Chart.js is not loaded.');
            return;
        }

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Close',
                    data: prices,
                    borderColor: lineColor,
                    backgroundColor: bgColor,
                    borderWidth: isMini ? 1.5 : 2,
                    pointRadius: isMini ? 0 : 3,
                    pointHoverRadius: 5,
                    fill: !isMini,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: !isMini,
                        mode: 'index',
                        intersect: false,
                        backgroundColor: '#18181b',
                        callbacks: { label: (ctx) => ' ₱' + ctx.parsed.y.toFixed(2) }
                    }
                },
                scales: {
                    x: { display: !isMini, grid: { display: false } },
                    y: { display: !isMini, grid: { color: '#f4f4f5' } }
                },
                interaction: { mode: 'nearest', axis: 'x', intersect: false }
            }
        });
        appStateRef.registerChart(canvasId, chart);
    }

    showDashboard() {
        this.els.detailView.classList.add('hidden');
        this.els.dashboardView.classList.remove('hidden');
    }

    showDetails(stock, data) {
        const latestPrice = data[data.length - 1].price;
        this.els.detailName.textContent = stock.name;
        this.els.detailTicker.textContent = `PSE:${stock.ticker}`;
        this.els.detailPrice.textContent = `₱${latestPrice.toFixed(2)}`;

        this.els.dashboardView.classList.add('hidden');
        this.els.detailView.classList.remove('hidden');

        // Reset AI Panel state
        this.els.aiInputState.classList.remove('hidden');
        this.els.aiResultsState.classList.add('hidden');
        this.els.aiLoadingState.classList.add('hidden');
        this.els.aiErrorState.classList.add('hidden');
        // Removed apiKeyError reset

        this.drawChart('largeChartCanvas', data, false, this.app.state);
    }

    setAILoading() {
        this.els.aiInputState.classList.add('hidden');
        this.els.aiLoadingState.classList.remove('hidden');
        this.els.aiErrorState.classList.add('hidden');
        this.els.runAIBtn.disabled = true;
    }

    setAIResults(aiData) {
        this.els.outTrend.textContent = aiData.trend;
        this.els.outRationale.textContent = aiData.rationale;
        
        const action = String(aiData.action).toUpperCase();
        this.els.outAction.textContent = action;
        this.els.outAction.className = "text-sm font-bold tracking-widest uppercase"; 
        if(action.includes('BUY')) this.els.outAction.classList.add('text-emerald-600');
        else if(action.includes('SELL')) this.els.outAction.classList.add('text-red-600');
        else this.els.outAction.classList.add('text-zinc-500');

        this.els.aiLoadingState.classList.add('hidden');
        this.els.aiResultsState.classList.remove('hidden');
        this.els.runAIBtn.disabled = false;
    }

    setAIError(msg) {
        this.els.aiErrorText.textContent = msg;
        this.els.aiLoadingState.classList.add('hidden');
        this.els.aiErrorState.classList.remove('hidden');
        this.els.runAIBtn.disabled = false;
    }
}