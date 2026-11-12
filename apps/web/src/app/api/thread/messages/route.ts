import { badGateway, passthrough, serviceFetch, unauthorized } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

/** Sends a message into the user's single thread and streams the reply. */
export async function POST(request: Request) {

  try {
    const upstream = await serviceFetch("/thread/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: await request.text(),
      // Stop on the page cancels the backend reply, so the model stops too.
      signal: request.signal,
      user: LOCAL_USER,
    });
    return passthrough(upstream);
  } catch {
    return badGateway();
  }
}
