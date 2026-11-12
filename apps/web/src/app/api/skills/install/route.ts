import { badGateway, passthrough, serviceFetch } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

export async function POST(request: Request) {
  try {
    return passthrough(
      await serviceFetch("/skills/install", {
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
