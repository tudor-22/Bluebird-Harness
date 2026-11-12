import { badGateway, passthrough, serviceFetch } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

export async function DELETE(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  try {
    return passthrough(
      await serviceFetch(`/skills/${encodeURIComponent(name)}`, {
        method: "DELETE",
        user: LOCAL_USER,
      }),
    );
  } catch {
    return badGateway();
  }
}
