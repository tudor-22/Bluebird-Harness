import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ToolError } from "./workspace";

/** True for addresses that are not on the public internet: this computer, the local network, metadata services. */
export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPrivateAddress(mapped[1]);
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v6 = address.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb");
}

async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ToolError("Only http and https addresses can be fetched.");
  if (url.username || url.password) throw new ToolError("Addresses with a login in them are not fetched.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new ToolError("That address is on this computer or its network, not the web.");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new ToolError(`Could not find ${host}.`);
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new ToolError("That address is on this computer or its network, not the web.");
  }
}

const IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Downloads a picture from the public web. Every address, including each
 * redirect, must be public; the type must be an image; the size is capped.
 */
export async function fetchPicture(
  address: string,
  options: { fetcher?: typeof fetch; signal?: AbortSignal } = {},
): Promise<{ mime: string; bytes: Buffer; url: string }> {
  const fetcher = options.fetcher ?? fetch;
  let current: URL;
  try {
    current = new URL(address);
  } catch {
    throw new ToolError("That is not a valid address.");
  }
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(current);
    const response = await fetcher(current, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BluebirdHarness/1.0)", Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
      signal: AbortSignal.any([AbortSignal.timeout(12_000), ...(options.signal ? [options.signal] : [])]),
    });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      if (!next) throw new ToolError("The server sent a broken redirect.");
      current = new URL(next, current);
      continue;
    }
    if (!response.ok) throw new ToolError(`The server answered ${response.status}.`);
    const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!/^image\/(png|jpeg|webp|gif)$/.test(mime)) throw new ToolError(`That address is not a png, jpg, webp or gif picture (it is ${mime || "unknown"}).`);
    if (Number(response.headers.get("content-length") ?? 0) > IMAGE_BYTES) throw new ToolError("That picture is larger than 8 MB.");
    const chunks: Buffer[] = [];
    let total = 0;
    const reader = response.body?.getReader();
    if (!reader) throw new ToolError("The server sent no picture.");
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > IMAGE_BYTES) {
        await reader.cancel();
        throw new ToolError("That picture is larger than 8 MB.");
      }
      chunks.push(Buffer.from(value));
    }
    return { mime, bytes: Buffer.concat(chunks), url: current.toString() };
  }
  throw new ToolError("Too many redirects.");
}

const PAGE_BYTES = 1_500_000;

/** Downloads a web page's HTML from the public internet, with the same checks as a picture. */
export async function fetchPage(
  address: string,
  options: { fetcher?: typeof fetch; signal?: AbortSignal } = {},
): Promise<{ html: string; url: string }> {
  const fetcher = options.fetcher ?? fetch;
  let current: URL;
  try {
    current = new URL(address);
  } catch {
    throw new ToolError("That is not a valid address.");
  }
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(current);
    const response = await fetcher(current, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BluebirdHarness/1.0)", Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.any([AbortSignal.timeout(12_000), ...(options.signal ? [options.signal] : [])]),
    });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      if (!next) throw new ToolError("The server sent a broken redirect.");
      current = new URL(next, current);
      continue;
    }
    if (!response.ok) throw new ToolError(`The server answered ${response.status}.`);
    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!/html|xml/.test(type)) throw new ToolError(`That address is not a web page (it is ${type || "unknown"}).`);
    const reader = response.body?.getReader();
    if (!reader) throw new ToolError("The server sent no page.");
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      chunks.push(Buffer.from(value));
      // The pictures that matter sit in the first part of a page.
      if (total > PAGE_BYTES) {
        await reader.cancel();
        break;
      }
    }
    return { html: Buffer.concat(chunks).toString("utf8"), url: current.toString() };
  }
  throw new ToolError("Too many redirects.");
}

const decode = (value: string) =>
  value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** The pictures a page offers: its share image first, then the larger pictures in it. */
export function pagePictures(html: string, base: string): string[] {
  const found: string[] = [];
  const add = (raw: string | undefined) => {
    if (!raw) return;
    try {
      const url = new URL(decode(raw.trim()), base);
      if (url.protocol !== "https:" && url.protocol !== "http:") return;
      if (/\.(svg|ico)(\?|$)|sprite|logo|favicon|avatar|pixel|tracking|\b1x1\b/i.test(url.pathname + url.search)) return;
      const text = url.toString();
      if (!found.includes(text)) found.push(text);
    } catch {
      // Not an address.
    }
  };
  const metaImage = /<meta\b[^>]*?(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*?>/gi;
  for (const tag of html.match(metaImage) ?? []) add(/content=["']([^"']+)["']/i.exec(tag)?.[1]);
  for (const tag of html.match(/<link\b[^>]*rel=["']image_src["'][^>]*>/gi) ?? []) add(/href=["']([^"']+)["']/i.exec(tag)?.[1]);
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const width = Number(/\bwidth=["']?(\d+)/i.exec(tag)?.[1] ?? 0);
    const height = Number(/\bheight=["']?(\d+)/i.exec(tag)?.[1] ?? 0);
    if ((width && width < 150) || (height && height < 150)) continue;
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1] ?? /data-src=["']([^"']+)["']/i.exec(tag)?.[1];
    const first = src ?? /srcset=["']\s*([^\s"',]+)/i.exec(tag)?.[1];
    add(first);
  }
  return found.slice(0, 12);
}

/** True when an address names somewhere on the public web, judged by its name alone. */
export function looksPublic(address: string): boolean {
  try {
    const url = new URL(address);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) return false;
    return !isIP(host) || !isPrivateAddress(host);
  } catch {
    return false;
  }
}
