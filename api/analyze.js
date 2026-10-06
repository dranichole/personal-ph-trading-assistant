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
            fetchedAt,
            preIpo = null
        } = req.body;

        const isGCashPreIpo =
            String(ticker || '').toUpperCase() === 'GCASH' ||
            dataSource === 'preipo' ||
            Boolean(preIpo);

        const filing = preIpo || {
            listingTarget: 'October 20, 2026',
            offerPeriod: 'October 6–12, 2026',
            finalOfferPrice: 6.60,
            offerLow: 6.0,
            offerHigh: 7.5,
            priorBandLow: 8.0,
            priorBandHigh: 10.0,
            netIncome2025B: 17.2,
            netIncomeQ12026B: 5.6,
            impliedValuationB: 442,
            priorMaxValuationB: 669,
            issuer: 'Mynt (GCash)'
        };

        let dataNote;
        if (isGCashPreIpo) {
            dataNote = `CRITICAL: This is a SIMULATED pre-listing price path for GCash / Mynt (ticker GCASH). It is NOT live PSE trading until listing day. Never describe the chart as a live quote.
Official IPO facts (current as of Oct 6 2026 offer open):
- Final offer price: ₱${filing.finalOfferPrice ?? 6.60} per share
- Retail / TP offer period OPEN: ${filing.offerPeriod || 'October 6–12, 2026'}
- Subscribe via: ${filing.subscribeVia || 'GCash / GStocks PH'}; minimum about ${filing.minSubscriptionShares || 100} shares (₱${filing.minSubscriptionPesos || 660})
- Scheduled PSE listing: ${filing.listingTarget || 'October 20, 2026'} under GCASH
- Implied valuation at final price: about ₱${filing.impliedValuationB ?? 442} billion
- Net income 2025: ₱${filing.netIncome2025B ?? 17.2} billion; Q1 2026: ₱${filing.netIncomeQ12026B ?? 5.6} billion
Frame as IPO-offer watch / educational subscription context. Prefer Hold/Neutral on the simulated path. Always say offer-period / pre-listing — not trading yet.`;
        } else if (dataSource === 'simulated') {
            dataNote = 'WARNING: Price series is SIMULATED fallback data, not live PSE quotes. Be conservative and prefer Hold unless the user thesis is independent of this chart.';
        } else {
            dataNote = 'Price series is from live PSE market data (Edge / phisix), in PHP.';
        }

        const listingLabel = isGCashPreIpo
            ? `${stockName || 'GCash (Mynt)'} · IPO OFFER OPEN (pre-listing path)`
            : `${stockName || ticker} (${ticker}.PS)`;

        const prompt = `You are an educational quantitative assistant for a personal Philippine markets journal. This is not financial advice.

Stock: ${listingLabel}
Ticker token: ${ticker}
Range: ${range || '1mo'}
Latest simulated or market close: ₱${latestPrice}
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
${dataNote}

Return raw JSON only with keys:
"trend" (Bullish, Bearish, or Neutral),
"action" (Buy, Sell, or Hold),
"rationale" (2-4 sentences grounding the call in the numbers above; for GCash always state this is an IPO-offer / pre-listing educational path anchored to Mynt filing figures and the ₱6.60 offer — not live PSE trading; include one invalidation level).
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
