#!/usr/bin/env python3
"""
Local static + API server for the trading assistant.

Plain `python -m http.server` cannot run Vercel `api/*.js` handlers, so /api/quote
(and news/ticks/universe) 404. This script serves the SPA and implements those
routes using the public phisix feed (same live PSE last prices the client uses).

Usage:
  python dev_server.py
  python dev_server.py 8080
"""

from __future__ import annotations

import json
import math
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PHISIX = "https://phisix-api3.appspot.com"
MANILA = timezone(timedelta(hours=8))

_quote_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 60.0


def _http_json(url: str, timeout: float = 10.0) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "trading-assistant-local/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _normalize_ticker(raw: str | None) -> str | None:
    if not raw:
        return None
    t = str(raw).strip().upper().replace(".PS", "")
    if not t or len(t) > 12 or not all(c.isalnum() for c in t):
        return None
    return t


def _trading_days_back(count: int) -> list[str]:
    days: list[str] = []
    cursor = datetime.now(MANILA).date()
    guard = 0
    while len(days) < count and guard < count * 4:
        guard += 1
        if cursor.weekday() < 5:
            days.append(cursor.isoformat())
        cursor -= timedelta(days=1)
    days.reverse()
    return days


def _range_days(range_id: str) -> int:
    return {"5d": 5, "3mo": 45, "6mo": 60, "1y": 60}.get(range_id, 22)


def _stitch_closes(bars: list[dict]) -> list[dict]:
    bars = sorted(bars, key=lambda b: b["timestamp"])
    out = []
    for i, b in enumerate(bars):
        open_px = out[-1]["close"] if out else b["close"]
        close = b["close"]
        out.append(
            {
                **b,
                "open": open_px,
                "high": max(open_px, close),
                "low": min(open_px, close),
                "price": close,
            }
        )
    return out


def build_quote(ticker: str, range_id: str) -> dict:
    cache_key = f"{ticker}:{range_id}"
    hit = _quote_cache.get(cache_key)
    if hit and time.time() - hit[0] < _CACHE_TTL:
        return hit[1]

    needed = _range_days(range_id)
    days = _trading_days_back(needed)
    bars: list[dict] = []
    name = ticker

    try:
        latest = _http_json(f"{PHISIX}/stocks/{urllib.parse.quote(ticker)}.json")
        stock = (latest.get("stocks") or [None])[0]
        if stock and stock.get("price", {}).get("amount") is not None:
            name = stock.get("name") or name
            close = float(stock["price"]["amount"])
            as_of = latest.get("as_of")
            when = datetime.fromisoformat(as_of.replace("Z", "+00:00")) if as_of else datetime.now(MANILA)
            ts = int(when.timestamp())
            bars.append(
                {
                    "date": when.strftime("%b %d"),
                    "timestamp": ts,
                    "open": close,
                    "high": close,
                    "low": close,
                    "close": close,
                    "price": close,
                    "volume": int(stock.get("volume") or 0),
                }
            )
    except Exception:
        pass

    for ymd in days:
        try:
            data = _http_json(f"{PHISIX}/stocks/{urllib.parse.quote(ticker)}.{ymd}.json", timeout=8)
            stock = (data.get("stocks") or [None])[0]
            if not stock or stock.get("price", {}).get("amount") is None:
                continue
            name = stock.get("name") or name
            close = float(stock["price"]["amount"])
            as_of = data.get("as_of")
            when = (
                datetime.fromisoformat(as_of.replace("Z", "+00:00"))
                if as_of
                else datetime.fromisoformat(f"{ymd}T00:00:00+08:00")
            )
            ts = int(when.timestamp())
            if any(abs(b["timestamp"] - ts) < 6 * 3600 for b in bars):
                continue
            bars.append(
                {
                    "date": when.strftime("%b %d"),
                    "timestamp": ts,
                    "open": close,
                    "high": close,
                    "low": close,
                    "close": close,
                    "price": close,
                    "volume": int(stock.get("volume") or 0),
                }
            )
        except Exception:
            continue

    stitched = _stitch_closes(bars)
    if len(stitched) < 2:
        raise RuntimeError("phisix insufficient history")

    payload = {
        "ticker": ticker,
        "name": name,
        "bars": stitched,
        "source": "live",
        "provider": "phisix",
        "fetchedAt": int(time.time() * 1000),
        "range": range_id,
        "note": "Local dev_server.py · phisix daily closes",
    }
    _quote_cache[cache_key] = (time.time(), payload)
    return payload


def build_universe() -> dict:
    try:
        data = _http_json(f"{PHISIX}/stocks.json", timeout=12)
        stocks = []
        for s in data.get("stocks") or []:
            sym = str(s.get("symbol") or "").upper().replace(".PS", "")
            if not sym or len(sym) > 12:
                continue
            price = s.get("price", {}).get("amount")
            stocks.append(
                {
                    "ticker": sym,
                    "name": s.get("name") or sym,
                    "price": float(price) if price is not None else None,
                    "volume": int(s.get("volume") or 0),
                    "percentChange": float(s.get("percent_change") or 0),
                }
            )
        return {
            "stocks": stocks,
            "source": "phisix",
            "count": len(stocks),
            "fetchedAt": int(time.time() * 1000),
            "note": "Live PSE last prices via phisix (local server).",
        }
    except Exception as err:
        return {
            "stocks": [],
            "source": "none",
            "count": 0,
            "fetchedAt": int(time.time() * 1000),
            "note": f"Universe feed unavailable: {err}",
        }


def build_news(ticker: str) -> dict:
    return {
        "ticker": ticker,
        "items": [],
        "source": "none",
        "fetchedAt": int(time.time() * 1000),
        "note": "Local server: headlines require Vercel /api/news or Yahoo access.",
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args))

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        if path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return

        if path.startswith("/api/"):
            self._handle_api(path, qs)
            return

        return super().do_GET()

    def _handle_api(self, path: str, qs: dict) -> None:
        try:
            if path == "/api/quote":
                ticker = _normalize_ticker((qs.get("ticker") or [None])[0])
                range_id = (qs.get("range") or ["1mo"])[0]
                if not ticker:
                    return self._json(400, {"error": "Invalid ticker"})
                data = build_quote(ticker, range_id)
                return self._json(200, data)

            if path == "/api/universe":
                return self._json(200, build_universe())

            if path == "/api/news":
                ticker = _normalize_ticker((qs.get("ticker") or [None])[0]) or "SM"
                return self._json(200, build_news(ticker))

            if path == "/api/ticks":
                return self._sse_ticks((qs.get("ticker") or [None])[0])

            if path == "/api/analyze":
                return self._json(
                    501,
                    {
                        "error": "AI analyze needs Vercel + GEMINI_API_KEY",
                        "detail": "Deploy or run `npx vercel dev` for /api/analyze.",
                    },
                )

            return self._json(404, {"error": f"Unknown API route {path}"})
        except Exception as err:
            return self._json(502, {"error": str(err)})

    def _sse_ticks(self, raw_ticker: str | None) -> None:
        ticker = _normalize_ticker(raw_ticker)
        if not ticker:
            return self._json(400, {"error": "Invalid ticker"})

        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        def push(obj: dict) -> None:
            self.wfile.write(f"data: {json.dumps(obj)}\n\n".encode("utf-8"))
            self.wfile.flush()

        push({"hello": True, "ticker": ticker, "t": int(time.time() * 1000)})
        last_vol = None
        last_price = None
        deadline = time.time() + 18
        while time.time() < deadline:
            try:
                data = _http_json(f"{PHISIX}/stocks/{urllib.parse.quote(ticker)}.json", timeout=6)
                stock = (data.get("stocks") or [None])[0]
                if stock and stock.get("price", {}).get("amount") is not None:
                    price = float(stock["price"]["amount"])
                    vol = int(stock.get("volume") or 0)
                    size = max(0, vol - last_vol) if last_vol is not None else 1
                    side = "unknown"
                    if last_price is not None:
                        if price > last_price:
                            side = "buy"
                        elif price < last_price:
                            side = "sell"
                    last_vol, last_price = vol, price
                    push(
                        {
                            "ticker": ticker,
                            "t": int(time.time() * 1000),
                            "price": price,
                            "size": size or 1,
                            "side": side,
                            "source": "sse",
                        }
                    )
            except Exception as err:
                push({"error": str(err), "t": int(time.time() * 1000)})
            time.sleep(2.5)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Trading assistant local server -> http://127.0.0.1:{port}")
    print("API routes: /api/quote /api/universe /api/news /api/ticks")
    print("Stop with Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
