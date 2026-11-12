import type { NextRequest } from "next/server";

import { badGateway, passthrough, serviceFetch, unauthorized } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

export async function GET() {

  try {
    const upstream = await serviceFetch("/me", { method: "GET", user: LOCAL_USER });
    return passthrough(upstream);
  } catch {
    return badGateway();
  }
}

export async function PATCH(request: NextRequest) {

  try {
    const upstream = await serviceFetch("/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: await request.text(),
      user: LOCAL_USER,
    });
    return passthrough(upstream);
  } catch {
    return badGateway();
  }
}
