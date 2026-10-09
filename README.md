# Personal PH Trading Assistant

An educational quantitative analysis dashboard for Philippine Stock Exchange (PSE) blue chips. It combines historical OHLCV charts, local technical indicators, a private browser-side trade journal, and optional Gemini-powered mentor notes.

Built as a vanilla JS single-page app (no React/Vue) with a small Vercel serverless route that keeps the Gemini API key off the client.

## Technical Overview

| Layer | Stack |
| --- | --- |
| Frontend | Vanilla JavaScript (ES6 modules), HTML5 |
| Styling | Tailwind CSS (CDN) + `css/styles.css` theme tokens |
| Charts | Chart.js (line sparklines on the watchlist; candles + trend overlays on detail) |
| Market data | `/api/quote` → PSE Edge daily OHLC (PHP); phisix closes as fallback; simulated only if all live sources fail |
| AI | Google Gemini (server-side via `/api/analyze`) |
| Hosting | Static files + Vercel serverless function |

## Core Features

### Watchlist & data
- Dashboard split into **Philippine Blue Chip Companies**, **Low-Cost Income Names** (under-₱10 REITs / income seeds), and **Special & Custom** (GCash Pre-IPO + tickers you add)
- Sort by watchlist order, % change, name, or sector; filter by sector within those sections
- **Last close**, period % change, **Bullish / Bearish**, and **Live / Simulated** badges
- Quiet **auto-refresh** (about every 5 minutes during PSE hours in Asia/Manila, every 30 minutes otherwise) with a header “Last refreshed” clock
- OHLCV history for **1W / 1M / 3M / 1Y** on the detail view

### Charts & indicators
- Dashboard cards use **line charts** with a soft area fill
- Detail view supports **Candles** (candles + SMA trend line) or **Line** mode
- Local indicators: SMA 20 / 50, RSI 14, ATR 14, short-range support / resistance
- Beginner-friendly chart hover copy (what an up/down day means, what the trend line is)
- Chart loading overlay that locks range / style controls while updates run

### Scalp / day-trade view
- Separate **Scalp** nav: tick stream → client candle aggregator (1m / 5m / 15m / 1h)
- Feed path: optional WebSocket (`CONFIG.scalp.wsUrl`) → SSE `/api/ticks` → live phisix last-price poll (no free PSE tick WS)
- Intraday metrics in memory: session **VWAP**, **EMA 9/21**, **HMA**, **ATR**, volume delta / order-flow tilt
- Event triggers (not EOD GBM): VWAP reclaim/loss, volume spike, EMA cross, S/R break
- Level-2 DOM (synthetic), time & sales tape, Buy Ask / Sell Bid / Flatten (`Shift+B` / `Shift+S` / `Esc`)
- Paper fills auto-log to the journal with strategy tags

### Watchlist density & math signals
- Cards ↔ high-density **table**; smart filters: vol spike &gt;2×, RSI &lt;30/&gt;70, net flow proxy
- BUY/SELL/HOLD + exclusive OPTIONAL BUY/SELL from GBM + OU + ROC ensemble votes + Wilder RSI
- Position target via **¼-Kelly × ATR stop** (never shown as a red “loss” figure)
- Predict: custom ensemble weight sliders + 30-day model band hit-rate scores
- Chart: denser 60–90 candles, 1D/4H/1H toggles, catalyst flags, synced crosshairs + RSI pane, zoom/pan

### Beginner helpers
- Clear “last close” wording (ending market price, not a sale price)
- Educational **starter buy idea** (example size near support using a fixed practice risk budget)
- Smooth fade tooltips on indicator tiles and key labels
- **GCash IPO offer** card: offer **open Oct 6–12, 2026** at **₱6.60** (min 100 sh via GCash/GStocks); listing targeted **Oct 20, 2026** as `GCASH`; educational pre-listing path until live PSE quotes exist; AI gets offer-window context
- Dashboard **Sections** menu: checklist to show/hide section bands and drag to reorder (saved in this browser)
- **On-site alerts** (free): always-visible alert strip; banner when a name dips ≥3% or rises ≥3% vs prior close; **Enable** + **Test alert** for browser notifications; on-page toast so you can verify without waiting for a real move
- **Strict math models** in `js/models.js`: GBM, adaptive OU/SMA mean reversion, ROC momentum, VWAP/volume confirm; 1–5 session Predict outlooks (OHLC session proxy when no PSE intraday feed)
- **Predict tab**: short path chart, ATR trail + TP1–3 in the forecast band, catalyst calendar + `/api/news` headlines; details in hover tips
- **Signals**: BUY / SELL / HOLD; exclusive OPTIONAL BUY *or* OPTIONAL SELL from the ensemble
- **₱ projection** sidebar: longer horizons from live history (educational)
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
│   ├── analyze.js       # Vercel serverless Gemini proxy
│   ├── quote.js         # Vercel serverless PSE Edge / phisix proxy
│   ├── news.js          # Headlines proxy for Predict catalysts
│   └── ticks.js         # SSE tick relay (phisix last price)
├── css/
│   └── styles.css       # Theme tokens, tooltips, loaders
├── js/
│   ├── app.js           # Bootstrap, refresh, chart/theme flow
│   ├── config.js        # Watchlist defaults, ranges, endpoints
│   ├── indicators.js    # SMA, RSI, ATR, S/R, starter buy helper
│   ├── models.js        # GBM / OU / ROC ensemble (daily Predict)
│   ├── services.js      # Market data + AI client
│   ├── state.js         # Cache, watchlist/journal persistence, theme
│   ├── ui.js            # DOM + Chart.js
│   └── scalp/           # Day-trade engine (ticks, candles, signals, paper broker)
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
3. Deploy. Static files are served from the root; `api/analyze.js` → `/api/analyze`, `api/quote.js` → `/api/quote`.

Market data prefers `/api/quote` (PSE Edge OHLC in pesos). On a plain local static server (where `/api/quote` 404s), the client **skips the dead quote route after the first failure** and loads **live PSE closes from phisix** (queued, batched) so charts stay Live. **Simulated** only appears if Edge and phisix both fail. Use **Refresh** to retry live.

## Privacy notes

| Data | Where it lives |
| --- | --- |
| Watchlist | Browser `localStorage` |
| Journal | Browser `localStorage` |
| Theme | Browser `localStorage` |
| Gemini key | Vercel env only (never in the frontend bundle) |
| Market prices | PSE Edge via `/api/quote` (phisix fallback locally); **Simulated** only if all live sources fail |

Clearing site data for this origin resets watchlist, journal, and theme on that device.

## Educational disclaimer

This app is for learning and personal journaling. Indicator tiles, starter buy ideas, and AI actions are **not** financial advice and are not a recommendation to buy or sell.
