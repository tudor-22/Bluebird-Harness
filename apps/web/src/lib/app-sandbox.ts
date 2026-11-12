/**
 * Model-written tools and games run inside a sandboxed frame. The frame has an
 * opaque origin (no cookies, storage or page access), a Content-Security-Policy
 * that blocks every network request, and no way to navigate the page. Its only
 * way back into the chat is a message the reader chose to send.
 */

export const APP_SEND_MAX_CHARS = 1000;
export const APP_SEND_INTERVAL_MS = 4000;
const APP_MIN_HEIGHT = 120;
const APP_MAX_HEIGHT = 1000;

export const APP_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "media-src data:",
  "font-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

const APP_BASE_CSS = `
html, body { margin: 0; padding: 12px; background: transparent; color: #1f1f1d;
  font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
  color-scheme: light dark; }
button { font: inherit; padding: 8px 14px; border: 1px solid #d9d7d0; border-radius: 999px;
  background: #fff; color: #1f1f1d; cursor: pointer; }
button:disabled { opacity: 0.45; cursor: default; }
input, select { font: inherit; padding: 6px 9px; border: 1px solid #d9d7d0; border-radius: 8px;
  background: #fff; color: #1f1f1d; box-sizing: border-box; }
canvas, svg { max-width: 100%; }
@media (prefers-color-scheme: dark) {
  html, body { color: #ededed; }
  button, input, select { background: #202020; border-color: #3a3a3a; color: #ededed; }
}`;

/**
 * Runs inside the frame before the model's code. It is serialised with
 * toString(), so it must not refer to anything outside its own body.
 */
function appBridge(): void {
  const post = (message: Record<string, unknown>) => {
    window.parent.postMessage({ bluebird: true, ...message }, "*");
  };
  const reportHeight = () => {
    post({ type: "height", height: Math.ceil(document.documentElement.scrollHeight) });
  };
  const gesture = (event: Event) => {
    if (event.isTrusted) post({ type: "gesture" });
  };
  document.addEventListener("pointerdown", gesture, true);
  document.addEventListener("keydown", gesture, true);
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (event.isTrusted && target instanceof Element && target.closest("a[href]")) {
        event.preventDefault();
      }
    },
    true,
  );
  (window as unknown as { bluebird: unknown }).bluebird = {
    send: (text: unknown) => post({ type: "send", text: String(text) }),
  };
  new ResizeObserver(reportHeight).observe(document.documentElement);
  window.addEventListener("load", reportHeight);
  reportHeight();
}

/** The complete document for the frame's srcdoc. */
export function buildAppDocument(html: string): string {
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${APP_CSP}">`,
    `<style>${APP_BASE_CSS}</style>`,
    `<script>(${appBridge.toString()})();</script>`,
    "</head><body>",
    html,
    "</body></html>",
  ].join("");
}

export type AppMessage =
  | { type: "height"; height: number }
  | { type: "gesture" }
  | { type: "send"; text: string };

/** Checks a message from the frame; anything malformed is ignored. */
export function parseAppMessage(value: unknown): AppMessage | null {
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  if (message.bluebird !== true) return null;
  if (message.type === "gesture") return { type: "gesture" };
  if (message.type === "height" && typeof message.height === "number" && Number.isFinite(message.height)) {
    return { type: "height", height: message.height };
  }
  if (message.type === "send" && typeof message.text === "string") {
    const text = message.text.trim().slice(0, APP_SEND_MAX_CHARS);
    return text ? { type: "send", text } : null;
  }
  return null;
}

export function clampAppHeight(height: number): number {
  return Math.min(Math.max(Math.round(height), APP_MIN_HEIGHT), APP_MAX_HEIGHT);
}

/**
 * A frame may only send a message after a real press or keystroke inside it,
 * and at most one message per interval. Code that sends on its own is ignored.
 */
export function createSendGate(now: () => number = Date.now) {
  let armed = false;
  let last = Number.NEGATIVE_INFINITY;
  return {
    gesture() {
      armed = true;
    },
    allowSend(): boolean {
      const time = now();
      if (!armed || time - last < APP_SEND_INTERVAL_MS) return false;
      armed = false;
      last = time;
      return true;
    },
  };
}
