import { describe, expect, it } from "vitest";
import { decideGreeting, greetingInstruction, timeOfDay } from "./greeting";

describe("decideGreeting", () => {
  it("never opens a conversation on its own", () => {
    expect(
      decideGreeting({ localDate: "2026-10-09", hasMessages: false, lastGreetingDay: null }),
    ).toBeNull();
    expect(
      decideGreeting({
        localDate: "2026-10-09",
        hasMessages: true,
        lastGreetingDay: "2026-10-08",
      }),
    ).toBeNull();
  });
});

describe("greetingInstruction", () => {
  it("mentions the local time and bans scheduling talk", () => {
    const instruction = greetingInstruction("new-day", "9:12 AM");
    expect(instruction).toContain("9:12 AM");
    expect(instruction).toContain("Never mention");
  });

  it("asks for a greeting that fits the clock", () => {
    expect(greetingInstruction("new-day", "9:12 AM")).toContain("morning greeting in the morning");
    expect(greetingInstruction("new-day", "2:30 PM")).toContain("afternoon greeting in the afternoon");
    expect(greetingInstruction("new-day", "7:45 PM")).toContain("evening greeting in the evening");
    expect(greetingInstruction("new-day", "1:15 AM")).toContain("quieter and low-key");
  });
});

describe("timeOfDay", () => {
  it("reads 12-hour and 24-hour clocks", () => {
    expect(timeOfDay("9:12 AM")).toBe("morning");
    expect(timeOfDay("2:30 PM")).toBe("afternoon");
    expect(timeOfDay("7:45 pm")).toBe("evening");
    expect(timeOfDay("08:05")).toBe("morning");
    expect(timeOfDay("21:30")).toBe("evening");
  });

  it("splits the day at the right boundaries", () => {
    expect(timeOfDay("4:59 AM")).toBe("night");
    expect(timeOfDay("5:00 AM")).toBe("morning");
    expect(timeOfDay("11:59 AM")).toBe("morning");
    expect(timeOfDay("12:00 PM")).toBe("afternoon");
    expect(timeOfDay("4:59 PM")).toBe("afternoon");
    expect(timeOfDay("5:00 PM")).toBe("evening");
    expect(timeOfDay("9:59 PM")).toBe("evening");
    expect(timeOfDay("10:00 PM")).toBe("night");
    expect(timeOfDay("12:00 AM")).toBe("night");
  });

  it("admits when it cannot tell", () => {
    expect(timeOfDay("")).toBe("unknown");
    expect(timeOfDay("later")).toBe("unknown");
  });
});
