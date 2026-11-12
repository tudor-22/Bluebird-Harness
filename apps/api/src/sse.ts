import type { ServerResponse } from "node:http";

/** Writes one SSE event; silently no-ops once the client has gone away. */
export function sseWrite(res: ServerResponse, event: string, data: unknown): void {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // The socket may already be closed; persistence continues regardless.
  }
}

export function sseKeepAlive(res: ServerResponse): void {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.write(": keep-alive\n\n");
  } catch {
    // Ignore.
  }
}
