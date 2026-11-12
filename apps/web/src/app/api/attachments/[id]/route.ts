import { badGateway, passthrough, serviceFetch, unauthorized } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const upstream = await serviceFetch(`/attachments/${encodeURIComponent(id)}`, {
      method: "GET",
      user: LOCAL_USER,
    });
    return passthrough(upstream);
  } catch {
    return badGateway();
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const upstream = await serviceFetch(`/attachments/${encodeURIComponent(id)}`, {
      method: "DELETE",
      user: LOCAL_USER,
    });
    return passthrough(upstream);
  } catch {
    return badGateway();
  }
}
