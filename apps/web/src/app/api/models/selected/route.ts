import { badGateway, passthrough, serviceFetch } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

/** Chooses which installed model chat uses. */
export async function PUT(request: Request) {
  try {
    return passthrough(
      await serviceFetch("/models/selected", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: await request.text(),
        user: LOCAL_USER,
      }),
    );
  } catch {
    return badGateway();
  }
}
