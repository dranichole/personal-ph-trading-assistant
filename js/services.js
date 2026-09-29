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
    static async analyze(apiKey, stockName, ticker, historicalData, latestPrice) {
        const prompt = `You are an expert financial mentor. Analyze ${stockName} (PSE:${ticker}).
        Historical 30-day closing prices: [${historicalData.join(', ')}].
        Latest known price from technicals: PHP ${latestPrice}.
        
        Search the web for the LATEST news and current price of this Philippine stock to ground your analysis.
        
        Respond strictly with a JSON object matching this schema:
        {
            "price": "String. The current price you found via search, or fallback to the technical price if not found.",
            "trend": "String. One word: Bullish, Bearish, or Neutral.",
            "action": "String. One word: Buy, Sell, or Hold.",
            "rationale": "String. A 2-sentence beginner-friendly explanation combining the recent news and the mathematical price trend."
        }`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                tools: [{ google_search: {} }], // Enable Search Grounding
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const result = await response.json();
        return JSON.parse(result.candidates[0].content.parts[0].text);
    }
}