import { badGateway, passthrough, serviceFetch } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return passthrough(
      await serviceFetch(`/schedules/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: await request.text(),
        user: LOCAL_USER,
      }),
    );
  } catch {
    return badGateway();
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return passthrough(
      await serviceFetch(`/schedules/${encodeURIComponent(id)}`, {
        method: "DELETE",
        user: LOCAL_USER,
      }),
    );
  } catch {
    return badGateway();
  }
}
