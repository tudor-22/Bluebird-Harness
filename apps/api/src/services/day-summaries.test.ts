import { describe, expect, it } from "vitest";
import { dayKeyFor } from "./day-summaries";

describe("dayKeyFor", () => {
  it("rolls over at the person's midnight, not UTC", () => {
    // 23:30 UTC on 9 October is already 00:30 on 10 October in London.
    expect(dayKeyFor(new Date("2026-10-09T23:30:00.000Z"), "Europe/London")).toBe("2026-10-10");
  });

  it("keeps the same date in UTC", () => {
    expect(dayKeyFor(new Date("2026-10-09T23:30:00.000Z"), "UTC")).toBe("2026-10-09");
  });

  it("falls back to UTC for an unknown timezone", () => {
    expect(dayKeyFor(new Date("2026-10-09T23:30:00.000Z"), "Not/AZone")).toBe("2026-10-09");
  });
});
