/**
 * Dividend / ex-date calendar for income names (REITs & dividend leaners).
 * Educational approximations — verify against PSE / issuer disclosures.
 */

const EX_DATES = [
    { ticker: 'AREIT', date: '2026-10-15', amount: 0.35, yieldHint: '~5%', note: 'Ayala REIT quarterly (est.)' },
    { ticker: 'MREIT', date: '2026-10-22', amount: 0.24, yieldHint: '~7%', note: 'MREIT distribution window (est.)' },
    { ticker: 'RCR', date: '2026-10-28', amount: 0.10, yieldHint: '~6%', note: 'RL Commercial REIT (est.)' },
    { ticker: 'FILRT', date: '2026-11-05', amount: 0.07, yieldHint: '~7%', note: 'Filinvest REIT (est.)' },
    { ticker: 'CREIT', date: '2026-11-12', amount: 0.05, yieldHint: '~8%', note: 'Citicore Energy REIT (est.)' },
    { ticker: 'DDMPR', date: '2026-11-18', amount: 0.02, yieldHint: '~8%', note: 'DDMP REIT (est.)' },
    { ticker: 'DMC', date: '2026-11-25', amount: 0.48, yieldHint: '~6%', note: 'DMCI dividend window (est.)' },
    { ticker: 'ACEN', date: '2026-12-02', amount: 0.05, yieldHint: '~2%', note: 'ACEN dividend watch (est.)' },
    { ticker: 'COSCO', date: '2026-12-09', amount: 0.20, yieldHint: '~3%', note: 'Cosco Capital (est.)' },
    { ticker: 'SHNG', date: '2026-12-16', amount: 0.08, yieldHint: '~3%', note: 'Shang Properties (est.)' }
];

function daysFromToday(iso) {
    const a = new Date();
    a.setHours(0, 0, 0, 0);
    const b = new Date(`${iso}T00:00:00`);
    return Math.round((b - a) / 86400000);
}

export function upcomingExDates(ticker = null, limit = 8) {
    const t = ticker ? String(ticker).toUpperCase() : null;
    return EX_DATES.map((e) => ({ ...e, inDays: daysFromToday(e.date) }))
        .filter((e) => e.inDays >= -1 && e.inDays <= 120)
        .filter((e) => !t || e.ticker === t)
        .sort((a, b) => a.inDays - b.inDays)
        .slice(0, limit);
}

export function exDatesForTicker(ticker) {
    return upcomingExDates(ticker, 6);
}

/** True if a bar date string is near an ex-date (for model skew warnings). */
export function isNearExDate(ticker, barDateLabel) {
    const events = EX_DATES.filter((e) => e.ticker === String(ticker).toUpperCase());
    if (!events.length || !barDateLabel) return null;
    return events.find((e) => {
        const d = new Date(`${e.date}T00:00:00`);
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return String(barDateLabel).includes(label.slice(0, 6)) || String(barDateLabel).includes(e.date.slice(5));
    });
}
