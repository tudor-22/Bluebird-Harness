import { importJWK, jwtVerify, type JWK } from "jose";

export type ServiceClaims = {
  /** Stable Google account identifier. */
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
  scopes: string[];
};

export type TokenVerifier = (token: string) => Promise<ServiceClaims>;

/**
 * Verifies short-lived Ed25519 service tokens minted by the web BFF against a
 * `kid`-keyed public JWK set. Issuer, audience, expiry and algorithm are all
 * enforced; anything else is a 401.
 */
export function createTokenVerifier(
  publicKeys: Record<string, JWK>,
  options: { issuer: string; audience: string },
): TokenVerifier {
  return async (token: string) => {
    const { payload } = await jwtVerify(
      token,
      async (header) => {
        const kid = header.kid;
        if (!kid || !publicKeys[kid]) {
          throw new Error(`Unknown service key id: ${kid ?? "(none)"}`);
        }
        return importJWK(publicKeys[kid], "EdDSA");
      },
      {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ["EdDSA"],
        clockTolerance: 5,
      },
    );

    if (!payload.sub) throw new Error("Service token is missing a subject");

    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : "",
      name: typeof payload.name === "string" ? payload.name : null,
      picture: typeof payload.picture === "string" ? payload.picture : null,
      scopes: Array.isArray(payload.scp) ? (payload.scp as string[]) : [],
    };
  };
}
