/**
 * Tear-away windows for Scalp DOM + Tape (multi-monitor day trading).
 * Uses window.open + postMessage; optionally Window Management API for screen placement.
 */

const POPOUT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Scalp · DOM & Tape</title>
<style>
  :root { color-scheme: light dark; font-family: "DM Sans", system-ui, sans-serif; }
  body { margin: 0; padding: 12px; background: #fafafa; color: #18181b; }
  h1 { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: #71717a; margin: 0 0 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; height: calc(100vh - 40px); }
  .panel { background: #fff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 10px; overflow: auto; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
  .buy { color: #059669; } .sell { color: #dc2626; }
  .block { background: #fffbeb; font-weight: 700; }
  .meta { font-size: 11px; color: #71717a; margin-bottom: 8px; }
  @media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
  <h1>Day trade · tear-away</h1>
  <p class="meta" id="meta">Waiting for live feed…</p>
  <div class="grid">
    <div class="panel"><h1>Level 2 / DOM</h1><div id="dom" class="mono"></div></div>
    <div class="panel"><h1>Time &amp; sales</h1><div id="tape" class="mono"></div></div>
  </div>
<script>
window.addEventListener('message', (ev) => {
  const msg = ev.data;
  if (!msg || msg.type !== 'scalp-popout') return;
  const meta = document.getElementById('meta');
  const domEl = document.getElementById('dom');
  const tapeEl = document.getElementById('tape');
  if (msg.ticker) meta.textContent = msg.ticker + ' · ' + (msg.feedMode || '') + (msg.price != null ? ' · ₱' + Number(msg.price).toFixed(2) : '');
  if (msg.domHtml) domEl.innerHTML = msg.domHtml;
  if (msg.tapeHtml) tapeEl.innerHTML = msg.tapeHtml;
});
</script>
</body>
</html>`;

export class ScalpPopout {
    constructor() {
        this.win = null;
    }

    get open() {
        return Boolean(this.win && !this.win.closed);
    }

    async openWindow() {
        if (this.open) {
            this.win.focus();
            return this.win;
        }

        let features = 'width=720,height=640,menubar=no,toolbar=no';
        try {
            if (window.getScreenDetails) {
                const details = await window.getScreenDetails();
                const screens = details.screens || [];
                const secondary = screens.find((s) => !s.isPrimary) || screens[0];
                if (secondary) {
                    const left = Math.round(secondary.availLeft + 40);
                    const top = Math.round(secondary.availTop + 40);
                    features = `left=${left},top=${top},width=720,height=640,menubar=no,toolbar=no`;
                }
            }
        } catch {
            /* permission denied — still open on primary */
        }

        const blob = new Blob([POPOUT_HTML], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        this.win = window.open(url, 'ta_scalp_popout', features);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return this.win;
    }

    close() {
        if (this.open) this.win.close();
        this.win = null;
    }

    publish({ ticker, feedMode, price, domHtml, tapeHtml }) {
        if (!this.open) return;
        try {
            this.win.postMessage(
                { type: 'scalp-popout', ticker, feedMode, price, domHtml, tapeHtml },
                '*'
            );
        } catch {
            this.win = null;
        }
    }
}
