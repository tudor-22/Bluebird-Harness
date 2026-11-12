import { badGateway, passthrough, serviceFetch } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

/** Forgets every "always allow" choice. */
export async function DELETE() {
  try {
    return passthrough(await serviceFetch("/agent/grants", { method: "DELETE", user: LOCAL_USER }));
  } catch {
    return badGateway();
  }
}
