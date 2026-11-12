import { badGateway, passthrough, serviceFetch } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

/** Puts back the files a reply changed. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return passthrough(
      await serviceFetch(`/thread/messages/${encodeURIComponent(id)}/undo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        user: LOCAL_USER,
      }),
    );
  } catch {
    return badGateway();
  }
}
