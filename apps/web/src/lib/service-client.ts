import { SignJWT, importJWK, type JWK } from "jose";

const API_URL = (process.env.BLUEBIRD_API_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "");
const KEY_ID = process.env.BLUEBIRD_SERVICE_KEY_ID ?? "dev-1";
const PRIVATE_JWK_B64 = process.env.BLUEBIRD_SERVICE_PRIVATE_JWK ?? "";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

/** Mints the 60-second Ed25519 token the backend verifies. */
async function signServiceToken(user: SessionUser, scopes: string[] = ["chat"]): Promise<string> {
  if (!PRIVATE_JWK_B64) {
    throw new Error("BLUEBIRD_SERVICE_PRIVATE_JWK is not set — run `pnpm setup:keys`");
  }
  const jwk = JSON.parse(Buffer.from(PRIVATE_JWK_B64, "base64").toString("utf8")) as JWK;
  const key = await importJWK(jwk, "EdDSA");
  return new SignJWT({
    email: user.email ?? "",
    name: user.name ?? "",
    picture: user.image ?? "",
    scp: scopes,
  })
    .setProtectedHeader({ alg: "EdDSA", kid: KEY_ID })
    .setIssuer("bluebird-web")
    .setAudience("bluebird-api")
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(key);
}

export async function serviceFetch(
  path: string,
  init: RequestInit & { user: SessionUser },
): Promise<Response> {
  const { user, ...rest } = init;
  const token = await signServiceToken(user);
  return fetch(`${API_URL}${path}`, {
    ...rest,
    headers: { ...(rest.headers ?? {}), Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

/** Streams the backend response back to the browser untouched. */
export function passthrough(upstream: Response): Response {
  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}

export function unauthorized(): Response {
  return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export function badGateway(): Response {
  return Response.json({ ok: false, error: "The backend is unreachable." }, { status: 502 });
}
