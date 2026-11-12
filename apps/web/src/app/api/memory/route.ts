import type { NextRequest } from "next/server";

import { badGateway, passthrough, serviceFetch, unauthorized } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

export async function GET(request: NextRequest) {

  const includeInvalidated = request.nextUrl.searchParams.get("includeInvalidated") === "1";
  try {
    const upstream = await serviceFetch(
      `/memory${includeInvalidated ? "?includeInvalidated=1" : ""}`,
      { method: "GET", user: LOCAL_USER },
    );
    return passthrough(upstream);
  } catch {
    return badGateway();
  }
}
