import { afterEach, describe, expect, it } from "vitest";
import { checkApiRequest } from "./origin-guard";

const base = { method: "POST", host: "localhost:3000", origin: "http://localhost:3000", fetchSite: "same-origin", fetchMode: "cors" };

afterEach(() => {
  delete process.env.BLUEBIRD_ALLOWED_HOSTS;
});

describe("the cross-site guard", () => {
  it("lets the app talk to its own API", () => {
    expect(checkApiRequest(base).ok).toBe(true);
    expect(checkApiRequest({ ...base, host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }).ok).toBe(true);
    expect(checkApiRequest({ ...base, host: "[::1]:3000", origin: "http://[::1]:3000" }).ok).toBe(true);
    // Command-line tools send no browser headers at all.
    expect(checkApiRequest({ method: "GET", host: "localhost:3000", origin: null, fetchSite: null, fetchMode: null }).ok).toBe(true);
    expect(checkApiRequest({ method: "POST", host: "localhost:3000", origin: null, fetchSite: null, fetchMode: null }).ok).toBe(true);
  });

  it("refuses another website, in every form", () => {
    expect(checkApiRequest({ ...base, origin: "https://evil.example", fetchSite: "cross-site" }).ok).toBe(false);
    expect(checkApiRequest({ ...base, origin: null, fetchSite: "cross-site" }).ok).toBe(false);
    expect(checkApiRequest({ ...base, origin: "null", fetchSite: "cross-site" }).ok).toBe(false);
    // A page on another site that simply loads a link to the app is allowed to navigate.
    expect(checkApiRequest({ method: "GET", host: "localhost:3000", origin: null, fetchSite: "cross-site", fetchMode: "navigate" }).ok).toBe(true);
    // A form post from another site is not.
    expect(checkApiRequest({ ...base, origin: "https://evil.example", fetchSite: "cross-site", fetchMode: "navigate" }).ok).toBe(false);
    // Another port on this machine is another site.
    expect(checkApiRequest({ ...base, origin: "http://localhost:9999", fetchSite: "same-site" }).ok).toBe(false);
  });

  it("refuses a name that points at this machine from the outside (DNS rebinding)", () => {
    expect(checkApiRequest({ ...base, host: "evil.example:3000", origin: "http://evil.example:3000" }).ok).toBe(false);
    process.env.BLUEBIRD_ALLOWED_HOSTS = "mymac.local";
    expect(checkApiRequest({ ...base, host: "mymac.local:3000", origin: "http://mymac.local:3000" }).ok).toBe(true);
  });
});
