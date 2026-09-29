/**
 * ==========================================
 * CONFIGURATION LAYER
 * ==========================================
 */
export const CONFIG = {
    defaultStocks: [
        { ticker: 'SM', name: 'SM Investments Corp', sector: 'Conglomerate' },
        { ticker: 'JFC', name: 'Jollibee Foods Corp', sector: 'Consumer Services' },
        { ticker: 'BDO', name: 'BDO Unibank, Inc.', sector: 'Financials' },
        { ticker: 'ALI', name: 'Ayala Land, Inc.', sector: 'Real Estate' },
        { ticker: 'GLO', name: 'Globe Telecom', sector: 'Telecommunications' }
    ],
    storageKeys: {
        watchlist: 'ta_watchlist_v1',
        journal: 'ta_journal_v1',
        theme: 'ta_theme_v1'
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
    apiProxyTemplate: (ticker, range = '1mo') =>
        `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.PS?interval=1d&range=${range}`)}`
};
