import { badGateway, passthrough, serviceFetch, unauthorized } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

/** Asks the backend whether Bluebird should open the day; the server decides. */
export async function POST(request: Request) {

  try {
    const upstream = await serviceFetch("/thread/greeting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: await request.text(),
      user: LOCAL_USER,
    });
    return passthrough(upstream);
  } catch {
    return badGateway();
  }
}
