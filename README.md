# Personal PH Trading Assistant

An educational quantitative analysis dashboard for Philippine Stock Exchange (PSE) blue chips. It combines historical OHLCV charts, local technical indicators, a private browser-side trade journal, and optional Gemini-powered mentor notes.

Built as a vanilla JS single-page app (no React/Vue) with a small Vercel serverless route that keeps the Gemini API key off the client.

## Technical Overview

| Layer | Stack |
| --- | --- |
| Frontend | Vanilla JavaScript (ES6 modules), HTML5 |
| Styling | Tailwind CSS (CDN) + `css/styles.css` theme tokens |
| Charts | Chart.js (line sparklines on the watchlist; candles + trend overlays on detail) |
| Market data | Yahoo Finance chart API via allorigins proxy; simulated OHLCV fallback if blocked |
| AI | Google Gemini (server-side via `/api/analyze`) |
| Hosting | Static files + Vercel serverless function |

## Core Features

### Watchlist & data
- Default PSE names (SM, JFC, BDO, ALI, GLO) plus custom tickers you add
- Sort by watchlist order, % change, name, or sector; filter by sector
- **Last close**, period % change, **Bullish / Bearish**, and **Live / Simulated** badges
- Quiet **auto-refresh** (about every 5 minutes during PSE hours in Asia/Manila, every 30 minutes otherwise) with a header “Last refreshed” clock
- OHLCV history for **1W / 1M / 3M / 1Y** on the detail view

### Charts & indicators
- Dashboard cards use **line charts** with a soft area fill
- Detail view supports **Candles** (candles + SMA trend line) or **Line** mode
- Local indicators: SMA 20 / 50, RSI 14, ATR 14, short-range support / resistance
- Beginner-friendly chart hover copy (what an up/down day means, what the trend line is)
- Chart loading overlay that locks range / style controls while updates run

### Beginner helpers
- Clear “last close” wording (ending market price, not a sale price)
- Educational **starter buy idea** (example size near support using a fixed practice risk budget)
- Smooth fade tooltips on indicator tiles and key labels

### AI mentor
- Runs through **`/api/analyze`** so `GEMINI_API_KEY` stays in Vercel env vars
- Prompt includes price change, indicators, recent closes, and whether data is live or simulated
- Session cache per ticker / range; educational disclaimer on the panel

### Personal journal (private per visitor)
- Stored only in **this browser’s `localStorage`** (`ta_journal_v1`)
- Not shared across visitors on the deployed site; each device/browser has its own journal
- Optional attach of the latest AI note; outcomes: open / win / loss / scratch

### Theme
- Day / night toggle (sun / moon icon); preference saved in `localStorage`
- Day mode uses a light palette related to the night accents; night mode uses dark cards with high-contrast chart colors

## Project Structure

```text
trading_assistant/
├── api/
│   └── analyze.js       # Vercel serverless Gemini proxy
├── css/
│   └── styles.css       # Theme tokens, tooltips, loaders
├── js/
│   ├── app.js           # Bootstrap, refresh, chart/theme flow
│   ├── config.js        # Watchlist defaults, ranges, endpoints
│   ├── indicators.js    # SMA, RSI, ATR, S/R, starter buy helper
│   ├── services.js      # Yahoo fetch + AI client
│   ├── state.js         # Cache, watchlist/journal persistence, theme
│   └── ui.js            # DOM + Chart.js
├── index.html
└── README.md
```

## Local Setup

ES6 modules require HTTP(S). Do not open `index.html` as a `file://` URL.

1. **Clone and enter the repo**
   ```bash
   git clone <your-repo-url>
   cd trading_assistant
   ```

2. **Serve the static app**
   ```bash
   python -m http.server 8000
   ```
   Or use VS Code **Live Server**.

3. **Open** `http://localhost:8000`

### AI analysis locally

The UI calls `/api/analyze`. That route only runs when the app is deployed on Vercel (or another host that serves `api/analyze.js`). For local AI:

- Deploy to Vercel and set `GEMINI_API_KEY` in project environment variables, **or**
- Point a local serverless emulator at `api/analyze.js` with the same env var.

Charts, indicators, watchlist, journal, and themes work without the AI key.

## Deploy (Vercel)

1. Connect the repo to [Vercel](https://vercel.com).
2. Set environment variable **`GEMINI_API_KEY`**.
3. Deploy. Static files are served from the root; `api/analyze.js` becomes `/api/analyze`.

## Privacy notes

| Data | Where it lives |
| --- | --- |
| Watchlist | Browser `localStorage` |
| Journal | Browser `localStorage` |
| Theme | Browser `localStorage` |
| Gemini key | Vercel env only (never in the frontend bundle) |
| Market prices | Fetched from Yahoo (via proxy); may fall back to **Simulated** practice series |

Clearing site data for this origin resets watchlist, journal, and theme on that device.

## Educational disclaimer

This app is for learning and personal journaling. Indicator tiles, starter buy ideas, and AI actions are **not** financial advice and are not a recommendation to buy or sell.
