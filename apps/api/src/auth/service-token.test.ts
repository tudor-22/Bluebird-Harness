import { SignJWT, exportJWK, generateKeyPair, type CryptoKey } from "jose";
import { describe, expect, it } from "vitest";
import { createTokenVerifier } from "./service-token";

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const verifier = createTokenVerifier(
    { "test-1": publicJwk },
    { issuer: "bluebird-web", audience: "bluebird-api" },
  );

  const sign = (overrides: {
    issuer?: string;
    audience?: string;
    kid?: string;
    expiresIn?: string;
    sub?: string;
    key?: CryptoKey;
  } = {}) =>
    new SignJWT({ email: "dev@example.com", name: "Dev", scp: ["chat"] })
      .setProtectedHeader({ alg: "EdDSA", kid: overrides.kid ?? "test-1" })
      .setIssuer(overrides.issuer ?? "bluebird-web")
      .setAudience(overrides.audience ?? "bluebird-api")
      .setSubject(overrides.sub ?? "google-sub-1")
      .setIssuedAt()
      .setExpirationTime(overrides.expiresIn ?? "60s")
      .sign(overrides.key ?? privateKey);

  return { verifier, sign };
}

describe("service tokens", () => {
  it("accepts a valid token and returns the verified claims", async () => {
    const { verifier, sign } = await setup();
    const claims = await verifier(await sign());
    expect(claims).toEqual({
      sub: "google-sub-1",
      email: "dev@example.com",
      name: "Dev",
      picture: null,
      scopes: ["chat"],
    });
  });

  it("rejects an unknown key id", async () => {
    const { verifier, sign } = await setup();
    await expect(verifier(await sign({ kid: "other" }))).rejects.toThrow();
  });

  it("rejects a token signed by a different key", async () => {
    const { verifier, sign } = await setup();
    const other = await generateKeyPair("EdDSA", { extractable: true });
    await expect(verifier(await sign({ key: other.privateKey }))).rejects.toThrow();
  });

  it("rejects the wrong issuer", async () => {
    const { verifier, sign } = await setup();
    await expect(verifier(await sign({ issuer: "evil" }))).rejects.toThrow();
  });

  it("rejects the wrong audience", async () => {
    const { verifier, sign } = await setup();
    await expect(verifier(await sign({ audience: "other-service" }))).rejects.toThrow();
  });

  it("rejects an expired token beyond the clock tolerance", async () => {
    const { verifier, sign } = await setup();
    await expect(verifier(await sign({ expiresIn: "-30s" }))).rejects.toThrow();
  });
});
