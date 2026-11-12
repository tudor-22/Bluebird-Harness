import { badGateway, passthrough, serviceFetch } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

export async function GET(_request: Request) {
  try {
    return passthrough(
      await serviceFetch("/skills", {
        method: "GET",
        user: LOCAL_USER,
      }),
    );
  } catch {
    return badGateway();
  }
}
