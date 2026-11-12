import { badGateway, passthrough, serviceFetch } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

/** Answers a tool call that is waiting for approval. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return passthrough(
      await serviceFetch(`/thread/tools/${encodeURIComponent(id)}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: await request.text(),
        user: LOCAL_USER,
      }),
    );
  } catch {
    return badGateway();
  }
}
