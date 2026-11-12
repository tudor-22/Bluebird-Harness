import { badGateway, passthrough, serviceFetch } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return passthrough(
      await serviceFetch(`/files/search?q=${encodeURIComponent(q)}`, {
        method: "GET",
        user: LOCAL_USER,
      }),
    );
  } catch {
    return badGateway();
  }
}
