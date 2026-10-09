/**
 * ==========================================
 * CONFIGURATION LAYER
 * ==========================================
 */

/**
 * Mynt / GCash IPO tracker.
 * Offer period OPEN Oct 6–12, 2026 at ₱6.60. Listing targeted Oct 20, 2026 (ticker GCASH).
 * Chart stays a pre-listing educational path until live GCASH.PS quotes exist after listing.
 */
export const GCASH_PRE_IPO = {
    ticker: 'GCASH',
    name: 'GCash (Mynt)',
    sector: 'Fintech · IPO Offer',
    preIpo: true,
    locked: true,
    phase: 'offer-open',
    listingTarget: 'October 20, 2026',
    offerPeriod: 'October 6–12, 2026',
    offerOpen: true,
    finalOfferPrice: 6.60,
    minSubscriptionShares: 100,
    minSubscriptionPesos: 660,
    subscribeVia: 'GCash / GStocks PH',
    offerLow: 6.0,
    offerHigh: 7.5,
    priorBandLow: 8.0,
    priorBandHigh: 10.0,
    netIncome2025B: 17.2,
    netIncomeQ12026B: 5.6,
    impliedValuationB: 442,
    priorMaxValuationB: 669,
    issuer: 'Mynt (GCash)',
    note: 'IPO offer is open Oct 6–12, 2026 at ₱6.60 (min 100 shares / ₱660 via GCash GStocks PH). Shares are expected to list on the PSE Main Board as GCASH on Oct 20, 2026. Until then this card is an educational pre-listing path around the offer price — not a live PSE quote.'
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
        blurb: 'IPO watch (GCash offer open now) and tickers you add yourself.'
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
        incomeSeedVersion: 'ta_income_seed_ver',
        sectionLayout: 'ta_section_layout_v1'
    },
    /** Increment when adding a new auto-add income batch */
    incomeSeedVersion: 1,
    ranges: [
        { id: '5d', label: '1W' },
        { id: '1mo', label: '1M' },
        { id: '3mo', label: '3M' },
        { id: '1y', label: '1Y' }
    ],
    /** Horizons for the detail-view investment projection (includes 6M). */
    forecastHorizons: [
        { id: '5d', label: '1W' },
        { id: '1mo', label: '1M' },
        { id: '3mo', label: '3M' },
        { id: '6mo', label: '6M' },
        { id: '1y', label: '1Y' }
    ],
    /** Short Predict-tab sessions (1–5), session bars from daily OHLC when no intraday feed. */
    predictHorizons: [
        { id: '1s', sessions: 1, label: '1S' },
        { id: '2s', sessions: 2, label: '2S' },
        { id: '3s', sessions: 3, label: '3S' },
        { id: '4s', sessions: 4, label: '4S' },
        { id: '5s', sessions: 5, label: '5S' }
    ],
    dashboardRange: '1mo',
    forecastHistoryRange: '1y',
    predictHistoryRange: '1y',
    refreshMsOpen: 5 * 60 * 1000,
    refreshMsClosed: 30 * 60 * 1000,
    starterRiskPesos: 1000,
    /** Ensemble mix for Predict + signals (GBM / OU mean-rev / ROC momentum). */
    modelWeights: {
        gbm: 20,
        meanReversion: 30,
        momentum: 50
    },
    /** Implied practice capital for ¼-Kelly sizing (risk unit = starterRiskPesos). */
    practiceCapitalPesos: 20000,
    /** Session / browser alerts (no email). Day-over-day % move thresholds. */
    alerts: {
        buyDipPct: -3,
        sellRisePct: 3,
        enabledByDefault: true
    },
    storageKeysExtra: {
        density: 'ta_density_v1',
        modelWeights: 'ta_model_weights_v1',
        smartFilter: 'ta_smart_filter_v1'
    },
    /**
     * Primary live path: Vercel `/api/quote` → PSE Edge OHLC (PHP),
     * with phisix daily closes as server/client fallback.
     * Yahoo *.PS equity charts currently 404, so they are not used.
     */
    quoteApiUrl: (ticker, range = '1mo') =>
        `/api/quote?ticker=${encodeURIComponent(ticker)}&range=${encodeURIComponent(range)}`,
    /**
     * Day-trade / scalp feed.
     * Set wsUrl to a real exchange/broker tick socket when you have one.
     * Otherwise: SSE `/api/ticks` (Vercel) → live phisix poll on the client.
     */
    scalp: {
        pollMs: 2500,
        defaultTimeframe: '1m',
        wsUrl: '', // e.g. wss://your-tick-gateway/stream
        defaultBroker: 'paper',
        /** Optional webhook for LocalTicketBroker copy payloads */
        ticketWebhook: ''
    },
    scanner: {
        range: '1mo',
        concurrency: 4,
        maxUniverse: 80
    }
};
