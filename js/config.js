/**
 * ==========================================
 * CONFIGURATION LAYER
 * ==========================================
 */

/**
 * Educational Pre-IPO / pre-listing forecast for Mynt (GCash).
 * Final IPO price set at ₱6.60 (disclosed Oct 1–2, 2026). Listing targeted Oct 20, 2026.
 * Not live PSE quotes until trading begins under ticker GCASH.
 */
export const GCASH_PRE_IPO = {
    ticker: 'GCASH',
    name: 'GCash (Mynt)',
    sector: 'Fintech · Pre-IPO',
    preIpo: true,
    locked: true,
    listingTarget: 'October 20, 2026',
    offerPeriod: 'October 6–12, 2026',
    finalOfferPrice: 6.60,
    /** Soft discovery band used for simulated grey-market style path around the final price */
    offerLow: 6.0,
    offerHigh: 7.5,
    priorBandLow: 8.0,
    priorBandHigh: 10.0,
    netIncome2025B: 17.2,
    netIncomeQ12026B: 5.6,
    impliedValuationB: 442,
    priorMaxValuationB: 669,
    issuer: 'Mynt (GCash)',
    note: 'Simulated pre-listing forecast only. Final IPO price is ₱6.60. GCASH is not trading on the PSE until the scheduled listing. Series models market expectations around that price and Mynt’s disclosed earnings.'
};

export const CONFIG = {
    defaultStocks: [
        { ticker: 'SM', name: 'SM Investments Corp', sector: 'Conglomerate' },
        { ticker: 'JFC', name: 'Jollibee Foods Corp', sector: 'Consumer Services' },
        { ticker: 'BDO', name: 'BDO Unibank, Inc.', sector: 'Financials' },
        { ticker: 'ALI', name: 'Ayala Land, Inc.', sector: 'Real Estate' },
        { ticker: 'GLO', name: 'Globe Telecom', sector: 'Telecommunications' },
        {
            ticker: GCASH_PRE_IPO.ticker,
            name: GCASH_PRE_IPO.name,
            sector: GCASH_PRE_IPO.sector,
            preIpo: true,
            locked: true
        }
    ],
    gcashPreIpo: GCASH_PRE_IPO,
    storageKeys: {
        watchlist: 'ta_watchlist_v1',
        journal: 'ta_journal_v1',
        theme: 'ta_theme_v1',
        alertLog: 'ta_alert_log_v1'
    },
    ranges: [
        { id: '5d', label: '1W' },
        { id: '1mo', label: '1M' },
        { id: '3mo', label: '3M' },
        { id: '1y', label: '1Y' }
    ],
    dashboardRange: '1mo',
    refreshMsOpen: 5 * 60 * 1000,
    refreshMsClosed: 30 * 60 * 1000,
    starterRiskPesos: 1000,
    /** Session / browser alerts (no email). Day-over-day % move thresholds. */
    alerts: {
        buyDipPct: -3,
        sellRisePct: 3,
        enabledByDefault: true
    },
    /**
     * Primary live path: Vercel `/api/quote` → PSE Edge OHLC (PHP),
     * with phisix daily closes as server/client fallback.
     * Yahoo *.PS equity charts currently 404, so they are not used.
     */
    quoteApiUrl: (ticker, range = '1mo') =>
        `/api/quote?ticker=${encodeURIComponent(ticker)}&range=${encodeURIComponent(range)}`
};
