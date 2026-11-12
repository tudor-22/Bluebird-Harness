import { NextResponse, type NextRequest } from "next/server";

import { checkApiRequest } from "./lib/origin-guard";

/** Every request to the local API passes through here first. */
export function proxy(request: NextRequest) {
  const verdict = checkApiRequest({
    method: request.method,
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    fetchSite: request.headers.get("sec-fetch-site"),
    fetchMode: request.headers.get("sec-fetch-mode"),
  });
  if (!verdict.ok) {
    return NextResponse.json({ ok: false, error: verdict.reason }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
