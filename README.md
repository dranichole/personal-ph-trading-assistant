# Personal PH Trading Assistant

Trade Assistant is a frontend-only quantitative analysis dashboard built specifically for Philippine blue-chip stocks. It serves as an educational tool for combining historical market data visualization with automated, LLM-driven fundamental analysis.

The project is architected as a Single Page Application (SPA) using standard ES6 modules to demonstrate clean separation of concerns (State, UI, Services) without relying on heavy frontend frameworks like React or Vue.

## Technical Overview

* **Frontend:** Vanilla JavaScript (ES6+), HTML5
* **Styling:** Tailwind CSS (via CDN)
* **Data Visualization:** Chart.js
* **Market Data:** Yahoo Finance API (routed through an allorigins proxy)
* **Analysis Engine:** Google Gemini 1.5 Flash (with Google Search grounding for real-time context)

## Core Features

* **Modular Architecture:** The codebase is split into specific layers (`config`, `state`, `services`, `ui`, `app`) making it highly maintainable and scalable.
* **Resilient Data Pipeline:** Fetches 30-day historical OHLCV data. Includes a graceful fallback mechanism that dynamically generates realistic simulated time-series data if the primary Yahoo Finance API rate-limits or blocks the proxy request.
* **LLM Integration:** Connects directly to the Gemini API from the client side, passing historical price arrays and utilizing search grounding to output structured JSON analyses (Price, Trend, Action, Rationale).

## Project Structure

```text
trade-mate/
├── css/
│   └── styles.css       # Custom scrollbars, animations, and loaders
├── js/
│   ├── app.js           # Application core / bootstrapper
│   ├── config.js        # Constants, stock universe, and endpoints
│   ├── services.js      # Data ingestion and AI API calls
│   ├── state.js         # In-memory state management and caching
│   └── ui.js            # DOM manipulation and Chart.js rendering
├── index.html           # Main entry point
└── README.md
```

## Local Setup and Usage

Because this project uses ES6 Modules (`<script type="module">`), you cannot simply double-click the `index.html` file to run it in your browser. It must be served over HTTP/HTTPS to avoid CORS policy errors.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/trademate.git
   cd trademate
   ```

2. **Serve the application locally:**
   You can use any local web server. If you have Python installed:
   ```bash
   python -m http.server 8000
   ```
   Or, if you use VS Code, install the **Live Server** extension and click "Go Live".

3. **Open in browser:**
   Navigate to `http://localhost:8000` (or the port provided by your local server).

4. **Run AI Analysis:**
   To use the AI Mentor feature on the asset detail view, you will need a valid Google Gemini API key. Input the key directly into the UI prompt when analyzing a stock. (Note: The key is only held in the browser's local memory during the session).