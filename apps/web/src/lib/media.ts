/**
 * Web pictures go through the app's own media route. Travel and product sites
 * often block hotlinks, so loading the original URL in the browser can leave a
 * blank card even though the server can read it. The proxy is authenticated
 * and same-origin, which also keeps the source page out of the referrer.
 */
export function webImageSrc(url: string): string {
  if (!url.startsWith("https://")) return url;
  return `/api/media?url=${encodeURIComponent(url)}`;
}
