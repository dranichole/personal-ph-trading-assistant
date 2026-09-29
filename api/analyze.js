module.exports = async function(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ error: 'API key not configured on server.' });
    }

    try {
        const {
            stockName,
            ticker,
            latestPrice,
            pctChange,
            range,
            indicators = {},
            recentCloses = [],
            avgVolume,
            dataSource,
            fetchedAt
        } = req.body;

        const simulatedNote = dataSource === 'simulated'
            ? 'WARNING: Price series is SIMULATED fallback data, not live PSE quotes. Be conservative and prefer Hold unless the user thesis is independent of this chart.'
            : 'Price series is from live Yahoo Finance data (PSE).';

        const prompt = `You are an educational quantitative assistant for a personal Philippine Stock Exchange (PSE) journal. This is not financial advice.

Stock: ${stockName || ticker} (${ticker}.PS)
Range: ${range || '1mo'}
Latest close: ₱${latestPrice}
Range % change: ${pctChange}%
Average volume: ${avgVolume ?? 'n/a'}
SMA20: ${indicators.sma20 ?? 'n/a'}
SMA50: ${indicators.sma50 ?? 'n/a'}
RSI14: ${indicators.rsi ?? 'n/a'} (${indicators.rsiLabel || ''})
ATR14: ${indicators.atr ?? 'n/a'}
Support: ₱${indicators.support ?? 'n/a'}
Resistance: ₱${indicators.resistance ?? 'n/a'}
SMA bias: ${indicators.smaBias || 'n/a'}
Recent closes: ${Array.isArray(recentCloses) ? recentCloses.join(', ') : 'n/a'}
Data fetched at (ms): ${fetchedAt || 'n/a'}
${simulatedNote}

Return raw JSON only with keys:
"trend" (Bullish, Bearish, or Neutral),
"action" (Buy, Sell, or Hold),
"rationale" (2-4 sentences grounding the call in the numbers above; mention if data is simulated; include one invalidation level).
Do not use markdown.`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.2,
                        responseMimeType: 'application/json'
                    }
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Google API responded with status: ${response.status}`);
        }

        const data = await response.json();
        const rawText = data.candidates[0].content.parts[0].text;
        const cleanJsonString = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const analysisData = JSON.parse(cleanJsonString);

        return res.status(200).json(analysisData);
    } catch (error) {
        console.error('AI Analysis Error:', error);
        return res.status(500).json({ error: 'Failed to generate analysis.' });
    }
};
