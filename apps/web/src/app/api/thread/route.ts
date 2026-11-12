import { badGateway, passthrough, serviceFetch, unauthorized } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

export async function GET() {

  try {
    const upstream = await serviceFetch("/thread", { method: "GET", user: LOCAL_USER });
    return passthrough(upstream);
  } catch {
    return badGateway();
  }
}

export async function DELETE() {

  try {
    const upstream = await serviceFetch("/thread", { method: "DELETE", user: LOCAL_USER });
    return passthrough(upstream);
  } catch {
    return badGateway();
  }
}
