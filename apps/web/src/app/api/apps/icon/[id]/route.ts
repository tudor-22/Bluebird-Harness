import { badGateway, serviceFetch } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

type RouteContext = { params: Promise<{ id: string }> };

/** An app's icon. Unlike other answers it may be kept by the browser, since icons rarely change. */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const upstream = await serviceFetch(`/apps/icon/${encodeURIComponent(id)}`, { method: "GET", user: LOCAL_USER });
    const headers = new Headers();
    const type = upstream.headers.get("content-type");
    if (type) headers.set("content-type", type);
    if (upstream.ok) headers.set("cache-control", "private, max-age=86400");
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return badGateway();
  }
}
