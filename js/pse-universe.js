/**
 * Liquid PSE universe for Market Scanner.
 * Curated Main Board / ETF-adjacent names (educational discovery set).
 * Merged at runtime with /api/universe when phisix all-stocks is available.
 */

export const PSE_UNIVERSE = [
    { ticker: 'SM', name: 'SM Investments', sector: 'Holding Firms' },
    { ticker: 'SMPH', name: 'SM Prime Holdings', sector: 'Property' },
    { ticker: 'BDO', name: 'BDO Unibank', sector: 'Banks' },
    { ticker: 'BPI', name: 'Bank of the Philippine Islands', sector: 'Banks' },
    { ticker: 'MBT', name: 'Metrobank', sector: 'Banks' },
    { ticker: 'CBC', name: 'China Bank', sector: 'Banks' },
    { ticker: 'SECB', name: 'Security Bank', sector: 'Banks' },
    { ticker: 'UBP', name: 'Union Bank', sector: 'Banks' },
    { ticker: 'EW', name: 'EastWest Bank', sector: 'Banks' },
    { ticker: 'PNB', name: 'Philippine National Bank', sector: 'Banks' },
    { ticker: 'RCB', name: 'RCBC', sector: 'Banks' },
    { ticker: 'ALI', name: 'Ayala Land', sector: 'Property' },
    { ticker: 'MEG', name: 'Megaworld', sector: 'Property' },
    { ticker: 'RLC', name: 'Robinsons Land', sector: 'Property' },
    { ticker: 'FLI', name: 'Filinvest Land', sector: 'Property' },
    { ticker: 'SHNG', name: 'Shang Properties', sector: 'Property' },
    { ticker: 'VLL', name: 'Vista Land', sector: 'Property' },
    { ticker: 'AREIT', name: 'Ayala REIT', sector: 'REIT' },
    { ticker: 'MREIT', name: 'MREIT', sector: 'REIT' },
    { ticker: 'RCR', name: 'RL Commercial REIT', sector: 'REIT' },
    { ticker: 'FILRT', name: 'Filinvest REIT', sector: 'REIT' },
    { ticker: 'CREIT', name: 'Citicore Energy REIT', sector: 'REIT' },
    { ticker: 'DDMPR', name: 'DDMP REIT', sector: 'REIT' },
    { ticker: 'PREIT', name: 'Premiere Island REIT', sector: 'REIT' },
    { ticker: 'JFC', name: 'Jollibee Foods', sector: 'Food & Beverage' },
    { ticker: 'URC', name: 'Universal Robina', sector: 'Food & Beverage' },
    { ticker: 'CNPF', name: 'Century Pacific Food', sector: 'Food & Beverage' },
    { ticker: 'FB', name: 'San Miguel Food and Beverage', sector: 'Food & Beverage' },
    { ticker: 'EMI', name: 'Emperador', sector: 'Food & Beverage' },
    { ticker: 'PGOLD', name: 'Puregold', sector: 'Retail' },
    { ticker: 'RRHI', name: 'Robinsons Retail', sector: 'Retail' },
    { ticker: 'COSCO', name: 'Cosco Capital', sector: 'Retail' },
    { ticker: 'WILCON', name: 'Wilcon Depot', sector: 'Retail' },
    { ticker: 'GLO', name: 'Globe Telecom', sector: 'Telecommunications' },
    { ticker: 'TEL', name: 'PLDT', sector: 'Telecommunications' },
    { ticker: 'CNVRG', name: 'Converge ICT', sector: 'Telecommunications' },
    { ticker: 'ACEN', name: 'ACEN Corporation', sector: 'Electricity' },
    { ticker: 'MER', name: 'Meralco', sector: 'Electricity' },
    { ticker: 'AP', name: 'Aboitiz Power', sector: 'Electricity' },
    { ticker: 'FGEN', name: 'First Gen', sector: 'Electricity' },
    { ticker: 'SCC', name: 'Semirara Mining', sector: 'Mining' },
    { ticker: 'DMC', name: 'DMCI Holdings', sector: 'Holding Firms' },
    { ticker: 'AC', name: 'Ayala Corporation', sector: 'Holding Firms' },
    { ticker: 'AEV', name: 'Aboitiz Equity Ventures', sector: 'Holding Firms' },
    { ticker: 'GTCAP', name: 'GT Capital', sector: 'Holding Firms' },
    { ticker: 'JGS', name: 'JG Summit', sector: 'Holding Firms' },
    { ticker: 'SMC', name: 'San Miguel Corporation', sector: 'Holding Firms' },
    { ticker: 'LTG', name: 'LT Group', sector: 'Holding Firms' },
    { ticker: 'AGI', name: 'Alliance Global', sector: 'Holding Firms' },
    { ticker: 'ICT', name: 'International Container Terminal', sector: 'Transportation' },
    { ticker: 'BLOOM', name: 'Bloomberry Resorts', sector: 'Casinos & Gaming' },
    { ticker: 'WLCON', name: 'Wilcon Depot', sector: 'Retail' },
    { ticker: 'MONDE', name: 'Monde Nissin', sector: 'Food & Beverage' },
    { ticker: 'NIKL', name: 'Nickel Asia', sector: 'Mining' },
    { ticker: 'PX', name: 'Philex Mining', sector: 'Mining' },
    { ticker: 'AT', name: 'Atlas Mining', sector: 'Mining' },
    { ticker: 'CEB', name: 'Cebu Air', sector: 'Transportation' },
    { ticker: 'PAL', name: 'PAL Holdings', sector: 'Transportation' },
    { ticker: 'PCOR', name: 'Petron', sector: 'Oil' },
    { ticker: 'SHELL', name: 'Pilipinas Shell', sector: 'Oil' },
    { ticker: 'PSE', name: 'Philippine Stock Exchange', sector: 'Other Financials' },
    { ticker: 'COL', name: 'COL Financial', sector: 'Other Financials' },
    { ticker: 'MAXS', name: 'Max\'s Group', sector: 'Food & Beverage' },
    { ticker: 'PIZZA', name: 'Shakey\'s Pizza Asia Ventures', sector: 'Food & Beverage' },
    { ticker: 'SSI', name: 'SSI Group', sector: 'Retail' },
    { ticker: 'HOME', name: 'AllHome', sector: 'Retail' },
    { ticker: 'CHP', name: 'Cemex Holdings Philippines', sector: 'Construction' },
    { ticker: 'HLCM', name: 'Holcim Philippines', sector: 'Construction' },
    { ticker: 'PIP', name: 'Pepsi-Cola Products Philippines', sector: 'Food & Beverage' },
    { ticker: 'GSMI', name: 'Ginebra San Miguel', sector: 'Food & Beverage' },
    { ticker: 'PLUS', name: 'DigiPlus Interactive', sector: 'Casinos & Gaming' },
    { ticker: 'DD', name: 'DoubleDragon', sector: 'Property' },
    { ticker: 'CLC', name: 'Celestica Philippines', sector: 'Electronics' },
    { ticker: 'TECH', name: 'Cirtek Holdings', sector: 'Electronics' },
    { ticker: 'MM', name: 'Metro Retail Stores', sector: 'Retail' },
    { ticker: 'FNI', name: 'Global Ferronickel', sector: 'Mining' },
    { ticker: 'APX', name: 'Apex Mining', sector: 'Mining' },
    { ticker: 'BKR', name: 'Bright Kindle Resources', sector: 'Mining' },
    { ticker: 'WEB', name: 'PhilWeb', sector: 'Other Services' },
    { ticker: 'NOW', name: 'Now Corporation', sector: 'Information Technology' }
];

export function mergeUniverse(extra = []) {
    const map = new Map();
    [...PSE_UNIVERSE, ...extra].forEach((row) => {
        const ticker = String(row.ticker || row.symbol || '')
            .toUpperCase()
            .replace(/\.PS$/i, '');
        if (!ticker || ticker.length > 12) return;
        if (!map.has(ticker)) {
            map.set(ticker, {
                ticker,
                name: row.name || row.seclongname || ticker,
                sector: row.sector || row.sectorname || 'PSE'
            });
        }
    });
    return [...map.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
}
