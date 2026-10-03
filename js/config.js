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

/** Large, liquid PSE names commonly treated as blue chips. */
export const BLUECHIP_STOCKS = [
    { ticker: 'SM', name: 'SM Investments Corp', sector: 'Conglomerate', group: 'bluechip' },
    { ticker: 'JFC', name: 'Jollibee Foods Corp', sector: 'Consumer Services', group: 'bluechip' },
    { ticker: 'BDO', name: 'BDO Unibank, Inc.', sector: 'Financials', group: 'bluechip' },
    { ticker: 'ALI', name: 'Ayala Land, Inc.', sector: 'Real Estate', group: 'bluechip' },
    { ticker: 'GLO', name: 'Globe Telecom', sector: 'Telecommunications', group: 'bluechip' }
];

/**
 * Affordable passive-income / lower-volatility PSE names (mostly under ₱10).
 * Focused on REITs and liquid dividend-leaning names — educational shortlist, not advice.
 * Prices move; “under ₱10” reflects the ~Oct 2026 screen used when adding these.
 */
export const INCOME_SEED_STOCKS = [
    { ticker: 'DDMPR', name: 'DDMP REIT, Inc.', sector: 'REIT · Income', group: 'lowcost', autoAdd: true, note: '~₱1 entry REIT; office-heavy yield play' },
    { ticker: 'CREIT', name: 'Citicore Energy REIT', sector: 'REIT · Income', group: 'lowcost', autoAdd: true, note: 'Renewable REIT; long leases, regular dividends' },
    { ticker: 'FILRT', name: 'Filinvest REIT Corp.', sector: 'REIT · Income', group: 'lowcost', autoAdd: true, note: 'Office REIT with quarterly payouts' },
    { ticker: 'RCR', name: 'RL Commercial REIT', sector: 'REIT · Income', group: 'lowcost', autoAdd: true, note: 'Robinsons-backed commercial REIT' },
    { ticker: 'ACEN', name: 'ACEN Corporation', sector: 'Power · Income', group: 'lowcost', autoAdd: true, note: 'Large renewable generator; liquid under ₱10' },
    { ticker: 'SHNG', name: 'Shang Properties, Inc.', sector: 'Real Estate · Income', group: 'lowcost', autoAdd: true, note: 'Malls/property cash-flow name under ₱10' },
    { ticker: 'DMC', name: 'DMCI Holdings, Inc.', sector: 'Conglomerate · Income', group: 'lowcost', autoAdd: true, note: 'Diversified conglomerate; common dividend payer' },
    { ticker: 'COSCO', name: 'Cosco Capital, Inc.', sector: 'Consumer · Income', group: 'lowcost', autoAdd: true, note: 'Puregold parent; defensive retail cash flows' },
    { ticker: 'MREIT', name: 'MREIT, Inc.', sector: 'REIT · Income', group: 'lowcost', autoAdd: true, note: 'Megaworld office REIT; slightly over ₱10, strong income track' }
];

/** Dashboard section order and copy. */
export const WATCHLIST_SECTIONS = [
    {
        id: 'bluechip',
        title: 'Philippine Blue Chip Companies',
        blurb: 'Large, liquid PSE names often used as core holdings for study.'
    },
    {
        id: 'lowcost',
        title: 'Low-Cost Income Names',
        blurb: 'Mostly under ₱10 — REITs and affordable names for passive-income style practice (not advice).'
    },
    {
        id: 'other',
        title: 'Special & Custom',
        blurb: 'Pre-IPO forecasts and tickers you add yourself.'
    }
];

export const CONFIG = {
    defaultStocks: [
        ...BLUECHIP_STOCKS,
        ...INCOME_SEED_STOCKS,
        {
            ticker: GCASH_PRE_IPO.ticker,
            name: GCASH_PRE_IPO.name,
            sector: GCASH_PRE_IPO.sector,
            group: 'other',
            preIpo: true,
            locked: true
        }
    ],
    bluechipStocks: BLUECHIP_STOCKS,
    incomeSeedStocks: INCOME_SEED_STOCKS,
    watchlistSections: WATCHLIST_SECTIONS,
    gcashPreIpo: GCASH_PRE_IPO,
    storageKeys: {
        watchlist: 'ta_watchlist_v1',
        journal: 'ta_journal_v1',
        theme: 'ta_theme_v1',
        alertLog: 'ta_alert_log_v1',
        /** Bump when a new income seed batch should be offered once to existing users */
        incomeSeedVersion: 'ta_income_seed_ver'
    },
    /** Increment when adding a new auto-add income batch */
    incomeSeedVersion: 1,
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
