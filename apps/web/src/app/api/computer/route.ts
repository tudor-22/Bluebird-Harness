import { badGateway, passthrough, serviceFetch } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

export const maxDuration = 300;

export async function GET(_request: Request) {
  try {
    return passthrough(await serviceFetch("/computer", { method: "GET", user: LOCAL_USER }));
  } catch {
    return badGateway();
  }
}
