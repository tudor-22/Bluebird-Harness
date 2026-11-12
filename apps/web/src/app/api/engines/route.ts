import { badGateway, passthrough, serviceFetch } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

/** Every engine with its status and the models it offers right now. */
export async function GET() {
  try {
    return passthrough(await serviceFetch("/engines", { method: "GET", user: LOCAL_USER }));
  } catch {
    return badGateway();
  }
}
