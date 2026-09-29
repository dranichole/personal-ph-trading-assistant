/**
 * ==========================================
 * APPLICATION CORE
 * ==========================================
 */
import { CONFIG } from './config.js';
import { AppState } from './state.js';
import { DataService, AIService } from './services.js';
import { UIController } from './ui.js';

class TradingAssistantApp {
    constructor() {
        this.state = new AppState();
        this.ui = new UIController(this);
    }

    async init() {
        this.ui.createDashboardCards();
        await this.loadDashboardData();
    }

    async loadDashboardData() {
        for (const stock of CONFIG.stocks) {
            const data = await DataService.fetchHistoricalData(stock.ticker);
            this.state.setStockData(stock.ticker, data);
            
            const prices = data.map(d => d.price);
            this.ui.updateDashboardCardData(stock.ticker, prices[prices.length - 1], {
                first: prices[0], last: prices[prices.length - 1]
            });
            this.ui.drawChart(`dash-chart-${stock.ticker}`, data, true, this.state);
        }
    }

    openDetails(ticker) {
        const stock = CONFIG.stocks.find(s => s.ticker === ticker);
        const data = this.state.getStockData(ticker);
        if (stock && data) {
            this.state.activeStock = stock;
            this.ui.showDetails(stock, data);
        }
    }

    async handleAIAnalysis() {
        // Removed API key check logic. We now rely on the secure backend.
        
        const stock = this.state.activeStock;
        const data = this.state.getStockData(stock.ticker);
        const prices = data.map(d => d.price);
        const latestPrice = prices[prices.length - 1].toFixed(2);
        
        this.ui.setAILoading();

        try {
            // Call AIService without passing an API key
            const aiData = await AIService.analyze(stock.name, stock.ticker, prices, latestPrice);
            this.ui.setAIResults(aiData);
        } catch (error) {
            console.error("AI Analysis Error:", error);
            this.ui.setAIError("Failed to fetch analysis. Please try again later.");
        }
    }
}

// Initialize App on DOM Load
document.addEventListener('DOMContentLoaded', () => {
    const app = new TradingAssistantApp();
    app.init();
});