import type { FastifyInstance } from "fastify";
import type { ServerDeps } from "../deps";
import { upsertUser } from "../services/users";

/** Paths that need no service token. Everything else is protected (fail-closed). */
const PUBLIC_PATHS = new Set(["/health"]);

function isProtected(url: string): boolean {
  const path = url.split("?")[0];
  return !PUBLIC_PATHS.has(path);
}

/**
 * Verifies the BFF's service token on every protected route, provisions the
 * account from the verified claims and attaches the request identity. The
 * browser never names a user; this is the only place identity is established.
 */
export function registerServiceAuth(app: FastifyInstance, deps: ServerDeps): void {
  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS" || !isProtected(request.url)) return;

    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) {
      return reply.status(401).send({ ok: false, error: "Missing service token." });
    }

    let claims;
    try {
      claims = await deps.verifyServiceToken(token);
    } catch {
      return reply.status(401).send({ ok: false, error: "Invalid service token." });
    }

    try {
      const id = await upsertUser(deps.pool, claims);
      request.authUser = {
        id,
        googleSub: claims.sub,
        email: claims.email,
        name: claims.name,
        picture: claims.picture,
      };
    } catch (error) {
      request.log.error({ err: error }, "user provisioning failed");
      return reply.status(503).send({ ok: false, error: "The service is temporarily unavailable." });
    }
  });
}
