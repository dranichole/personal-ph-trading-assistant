module.exports = async function(req, res) {
    // 1. Check for POST method
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 2. Securely access the API key from Vercel Environment Variables
    const API_KEY = process.env.GEMINI_API_KEY;
    
    if (!API_KEY) {
        return res.status(500).json({ error: 'API key not configured on server.' });
    }

    try {
        const { ticker, price } = req.body;

        const prompt = `You are an expert quantitative stock analyst. Analyze ${ticker} on the Philippine Stock Exchange (PSE). 
        Current simulated price: ₱${price}. 
        Provide a JSON response with exactly these keys: 
        "price" (the current price), "trend" (Bullish, Bearish, or Neutral), "action" (Buy, Sell, or Hold), and "rationale" (a concise 2-sentence explanation of current market sentiment based on recent news or fundamentals). Do not use markdown blocks, just return raw JSON.`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.2,
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Google API responded with status: ${response.status}`);
        }

        const data = await response.json();
        const rawText = data.candidates[0].content.parts[0].text;
        
        // Clean markdown formatting if Google accidentally includes it
        const cleanJsonString = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const analysisData = JSON.parse(cleanJsonString);

        return res.status(200).json(analysisData);

    } catch (error) {
        console.error("AI Analysis Error:", error);
        return res.status(500).json({ error: 'Failed to generate analysis.' });
    }
};