import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../test/harness";

let harness: Harness;
let token: string;
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

beforeAll(async () => {
  harness = await createHarness();
  token = await harness.signToken({ sub: "google-me", email: "me@example.com", name: "Sign In Name" });
});
afterAll(async () => {
  await harness.close();
});

const call = (method: string, body?: unknown) =>
  fetch(`${harness.baseUrl}/me`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("the profile", () => {
  it("lets the person choose a name and picture, and go back to the default", async () => {
    const before = (await (await call("GET")).json()) as { user: { name: string; picture: string | null } };
    expect(before.user).toMatchObject({ name: "Sign In Name", picture: null });

    const saved = (await (await call("PATCH", { displayName: "Justin", avatar: PIXEL })).json()) as {
      user: { name: string; picture: string };
    };
    expect(saved.user).toMatchObject({ name: "Justin", picture: PIXEL });

    // A later request with the sign-in's own name does not overwrite the choice.
    const again = (await (await call("GET")).json()) as { user: { name: string; picture: string } };
    expect(again.user).toMatchObject({ name: "Justin", picture: PIXEL });

    const cleared = (await (await call("PATCH", { displayName: null, avatar: null })).json()) as {
      user: { name: string; picture: string | null };
    };
    expect(cleared.user).toMatchObject({ name: "Sign In Name", picture: null });
  });

  it("refuses pictures that are not small images", async () => {
    expect((await call("PATCH", { avatar: "https://example.com/a.png" })).status).toBe(400);
    expect((await call("PATCH", { avatar: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" })).status).toBe(400);
    expect((await call("PATCH", { avatar: "data:image/png;base64," + "A".repeat(270_000) })).status).toBe(400);
    expect((await call("PATCH", { displayName: "   " })).status).toBe(400);
  });
});
