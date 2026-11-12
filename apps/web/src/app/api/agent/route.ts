import { badGateway, passthrough, serviceFetch } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

/** The workspace folder, mode and what this computer can sandbox. */
export async function GET() {
  try {
    return passthrough(await serviceFetch("/agent", { method: "GET", user: LOCAL_USER }));
  } catch {
    return badGateway();
  }
}

/** Saves workspace settings. */
export async function PUT(request: Request) {
  try {
    return passthrough(
      await serviceFetch("/agent", {
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
