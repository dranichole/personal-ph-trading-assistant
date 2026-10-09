/**
 * Upcoming PH market catalysts (static calendar) + optional /api/news headlines.
 */

/** Approximate / published event windows for study (not an official feed). */
const PH_CALENDAR = [
    { date: '2026-10-09', title: 'PSE trading session', type: 'market' },
    { date: '2026-10-16', title: 'BSP policy watch window', type: 'macro' },
    { date: '2026-10-20', title: 'GCASH listing target (if unchanged)', type: 'ipo', tickers: ['GCASH'] },
    { date: '2026-10-31', title: 'Month-end / fund rebalance watch', type: 'macro' },
    { date: '2026-11-14', title: 'Q3 earnings season (typical window)', type: 'earnings' },
    { date: '2026-12-25', title: 'Christmas holiday (PSE closed)', type: 'holiday' },
    { date: '2026-12-30', title: 'Rizal Day (PSE closed)', type: 'holiday' }
];

function daysFromToday(iso) {
    const a = new Date();
    a.setHours(0, 0, 0, 0);
    const b = new Date(`${iso}T00:00:00`);
    return Math.round((b - a) / 86400000);
}

export function upcomingCatalysts(ticker, limit = 4) {
    const t = String(ticker || '').toUpperCase();
    const ranked = PH_CALENDAR
        .map(ev => ({ ...ev, inDays: daysFromToday(ev.date) }))
        .filter(ev => ev.inDays >= -2 && ev.inDays <= 90)
        .filter(ev => !ev.tickers || ev.tickers.includes(t) || ev.type !== 'ipo')
        .sort((a, b) => a.inDays - b.inDays);

    const picked = ranked.slice(0, limit);
    if (picked.length) return picked;

    // Always return something useful for the panel.
    return [
        {
            date: new Date().toISOString().slice(0, 10),
            title: 'Check PSE disclosures before acting on models',
            type: 'note',
            inDays: 0
        }
    ];
}

export async function fetchHeadlines(ticker) {
    try {
        const res = await fetch(`/api/news?ticker=${encodeURIComponent(ticker)}`);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data.items) ? data.items : [];
    } catch {
        return [];
    }
}
