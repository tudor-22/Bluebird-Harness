import type { NextRequest } from "next/server";
import { LOCAL_USER } from "@/lib/local-user";

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\]|.*\.local$|.*\.internal$)/i;
const PRIVATE_172 = /^172\.(1[6-9]|2\d|3[01])\./;
const MAX_BYTES = 6_000_000;

function isAllowedImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    if (url.port && url.port !== "443") return false;
    return !PRIVATE_HOST.test(url.hostname) && !PRIVATE_172.test(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Same-origin proxy for web result pictures. Travel and product sites often
 * block hotlinks, which leaves image cards blank; fetching them server-side
 * with a browser user agent fixes that and keeps the source out of the
 * referrer. It only serves public https pictures, and only matters once web search is on.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw || !isAllowedImageUrl(raw)) {
    return new Response("Bad image url", { status: 400 });
  }

  try {
    const response = await fetch(raw, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; BluebirdHarness/1.0)",
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
      },
      signal: AbortSignal.timeout(8_000),
      redirect: "follow",
    });
    if (!response.ok) return new Response("Image unavailable", { status: 502 });
    if (!isAllowedImageUrl(response.url)) {
      return new Response("Bad image url", { status: 400 });
    }

    const type = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!/^image\/(jpeg|png|webp|avif|gif)$/i.test(type)) {
      return new Response("Unsupported image", { status: 415 });
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) {
      return new Response("Image too large", { status: 413 });
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
      return new Response("Image too large", { status: 413 });
    }
    return new Response(bytes, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Image unavailable", { status: 502 });
  }
}
