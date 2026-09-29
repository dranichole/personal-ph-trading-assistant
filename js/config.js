/**
 * ==========================================
 * CONFIGURATION LAYER
 * ==========================================
 */
export const CONFIG = {
    stocks: [
        { ticker: 'SM', name: 'SM Investments Corp', sector: 'Conglomerate' },
        { ticker: 'JFC', name: 'Jollibee Foods Corp', sector: 'Consumer Services' },
        { ticker: 'BDO', name: 'BDO Unibank, Inc.', sector: 'Financials' },
        { ticker: 'ALI', name: 'Ayala Land, Inc.', sector: 'Real Estate' },
        { ticker: 'GLO', name: 'Globe Telecom', sector: 'Telecommunications' }
    ],
    // Yahoo Finance Proxy mapping
    apiProxyTemplate: (ticker) => `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.PS?interval=1d&range=1mo`)}`
};