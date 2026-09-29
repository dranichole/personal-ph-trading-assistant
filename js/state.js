/**
 * ==========================================
 * STATE MANAGEMENT LAYER
 * ==========================================
 */
export class AppState {
    constructor() {
        this.stockDataCache = {};
        this.chartInstances = {};
        this.activeStock = null;
    }
    
    setStockData(ticker, data) {
        this.stockDataCache[ticker] = data;
    }

    getStockData(ticker) {
        return this.stockDataCache[ticker];
    }

    registerChart(canvasId, chartInstance) {
        if (this.chartInstances[canvasId]) {
            this.chartInstances[canvasId].destroy();
        }
        this.chartInstances[canvasId] = chartInstance;
    }
}