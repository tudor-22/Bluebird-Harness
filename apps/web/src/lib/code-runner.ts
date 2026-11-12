import { APP_CSP } from "./app-sandbox";

/**
 * Only web pages can be previewed: HTML and SVG. They show in a sandboxed
 * frame with no access to the page, the chat or the network. Code in any
 * other language is only ever shown, never run.
 */
export type RunKind = "html" | "svg";

/** Which kind of preview a code block supports, or null when it has none. */
export function runnerKind(language: string | undefined, code: string): RunKind | null {
  const name = (language ?? "").toLowerCase();
  if (name === "html" || name === "htm") return "html";
  if (name === "svg") return "svg";
  if (name === "xml") return /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(code) ? "svg" : null;
  return null;
}

/** Reports the page height to the parent so the frame fits what it shows. */
function heightBridge(): void {
  const report = () =>
    window.parent.postMessage(
      { bluebird: true, type: "height", height: Math.ceil(document.documentElement.scrollHeight) },
      "*",
    );
  new ResizeObserver(report).observe(document.documentElement);
  window.addEventListener("load", report);
  report();
}

const PAGE_CSS = "html, body { margin: 0; background: #fff; color: #14202a; font-family: -apple-system, Arial, sans-serif; }";

function head(): string {
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${APP_CSP}">`,
    `<style>${PAGE_CSS}</style>`,
    `<script>(${heightBridge.toString()})();</script>`,
    "</head><body>",
  ].join("");
}

/** The complete document for a frame's srcdoc. */
export function buildRunDocument(kind: RunKind, code: string): string {
  if (kind === "html") return `${head()}${code}</body></html>`;
  return `${head()}<div style="display:grid;place-items:center;padding:12px">${code}</div></body></html>`;
}
