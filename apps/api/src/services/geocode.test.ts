import { describe, expect, it } from "vitest";

import { resolveMapCoordinates, type Geocoder } from "./geocode";

const geocoder: Geocoder = {
  async lookup(query) {
    if (query.includes("Sagrada")) return { lat: 41.4036, lng: 2.1744 };
    return null;
  },
};

describe("resolveMapCoordinates", () => {
  it("fills coordinates for query-only markers", async () => {
    const text =
      'Here:\n\n```ui\n{"blocks":[{"type":"map","markers":[{"label":"Sagrada","q":"Sagrada Familia"}]}]}\n```';
    const out = await resolveMapCoordinates(text, geocoder);
    expect(out).toContain('"lat":41.4036');
    expect(out).toContain('"lng":2.1744');
    expect(out.startsWith("Here:")).toBe(true);
  });

  it("leaves replies without maps untouched", async () => {
    const text = "Just a reply.";
    expect(await resolveMapCoordinates(text, geocoder)).toBe(text);
  });

  it("keeps unresolved markers without coordinates", async () => {
    const text =
      '```ui\n{"blocks":[{"type":"map","markers":[{"label":"Nowhere","q":"Atlantis"}]}]}\n```';
    expect(await resolveMapCoordinates(text, geocoder)).toBe(text);
  });

  it("does not wait for a slow geocoder", async () => {
    const slow: Geocoder = {
      lookup: () => new Promise(() => undefined),
    };
    const text =
      '```ui\n{"blocks":[{"type":"map","markers":[{"label":"Rome"}]}]}\n```';
    const started = Date.now();
    const out = await resolveMapCoordinates(text, slow, 60);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(out).toContain("Rome");
  });
});
