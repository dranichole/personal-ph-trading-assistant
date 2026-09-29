/**
 * ==========================================
 * SERVICES LAYER (External APIs)
 * ==========================================
 */
import { CONFIG } from './config.js';

export class DataService {
    static async fetchHistoricalData(ticker) {
        try {
            const response = await fetch(CONFIG.apiProxyTemplate(ticker));
            if (!response.ok) throw new Error('Proxy or Network error');
            
            const data = await response.json();
            if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
                throw new Error('No valid payload from Yahoo');
            }

            const result = data.chart.result[0];
            const timestamps = result.timestamp;
            const closes = result.indicators.quote[0].close;

            let cleanData = [];
            for (let i = 0; i < timestamps.length; i++) {
                if (closes[i] !== null && closes[i] !== undefined) {
                    cleanData.push({
                        date: new Date(timestamps[i] * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        price: parseFloat(closes[i].toFixed(2))
                    });
                }
            }
            return cleanData;
        } catch (error) {
            console.warn(`Fallback triggered for ${ticker}: ${error.message}`);
            return this.generateFallbackData(ticker);
        }
    }

    static generateFallbackData(ticker) {
        const basePrices = { 'SM': 950.00, 'JFC': 260.00, 'BDO': 155.00, 'ALI': 34.00, 'GLO': 2100.00 };
        let currentPrice = basePrices[ticker] || 100;
        const data = [];
        const today = new Date();
        
        for (let i = 30; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            if (date.getDay() === 0 || date.getDay() === 6) continue;
            
            const change = 1 + (Math.random() * 0.04 - 0.02);
            currentPrice = currentPrice * change;
            data.push({
                date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                price: parseFloat(currentPrice.toFixed(2))
            });
        }
        return data;
    }
}

export class AIService {
    static async analyze(stockName, ticker, historicalData, latestPrice) {
        // We no longer pass the API key from the frontend!
        // Instead, we call our own secure Vercel backend route.
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stockName, ticker, historicalData, latestPrice })
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        return await response.json();
    }
}