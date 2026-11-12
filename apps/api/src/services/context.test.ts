import { describe, expect, it } from "vitest";
import {
  bedtimeRepetitionGuard,
  calloutNote,
  currentDateNote,
  describeReturnGap,
  recentPhrasesNote,
  stripBedtimeAdvice,
  UI_KIT_NOTE,
  UI_KIT_REMINDER,
  PLANNING_NOTE,
  looksLikePlanningRequest,
} from "./context";

describe("bedtime repetition guard", () => {
  it("suppresses the theme after two paraphrased bedtime reminders", () => {
    const note = bedtimeRepetitionGuard([
      { role: "assistant", content: "Go get some rest then. Sleep well." },
      { role: "user", content: "might do in a bit" },
      {
        role: "assistant",
        content: "Don't stay up too late. The half-asleep brain makes bad decisions.",
      },
      { role: "user", content: "Just look it up again" },
    ]);
    expect(note).toContain("at least twice");
    expect(note).toContain("Do not mention any of those themes");
  });

  it("does not trigger after a single mention or from the user's own words", () => {
    expect(
      bedtimeRepetitionGuard([
        { role: "user", content: "I am going to bed soon" },
        { role: "assistant", content: "I found the answer." },
      ]),
    ).toBeNull();
  });

  it("stands down when the user explicitly asks about time or sleep", () => {
    expect(
      bedtimeRepetitionGuard([
        { role: "assistant", content: "Go to bed. Sleep well." },
        { role: "assistant", content: "It is late. You should rest." },
        { role: "user", content: "What time is it?" },
      ]),
    ).toBeNull();
  });

  it("removes paraphrased bedtime commentary while preserving the real answer", () => {
    expect(
      stripBedtimeAdvice(
        "Still up, I see. Edinburgh. Up late, are we. Now get off the phone.",
      ),
    ).toBe("Edinburgh.");
  });
});

describe("current date context", () => {
  it("anchors every turn to the server date in the user's timezone", () => {
    const note = currentDateNote(
      { timeZone: "Europe/London" },
      new Date("2026-10-20T12:00:00.000Z"),
    );
    expect(note).toContain("Tuesday, 20 October 2026");
    expect(note).toContain("2026-10-20");
    expect(note).toContain("current year is 2026");
    expect(note).toContain("newer than any remembered date or older search result");
  });

  it("falls back to UTC for an invalid timezone", () => {
    const note = currentDateNote(
      { timeZone: "Not/AZone" },
      new Date("2026-10-20T23:30:00.000Z"),
    );
    expect(note).toContain("2026-10-20");
  });
});

describe("interactive panel guidance", () => {
  it("builds panels only on request, while keeping casual chat plain", () => {
    expect(UI_KIT_NOTE).toContain("Answer in plain prose by default");
    expect(UI_KIT_NOTE).toContain("draw a diagram block");
    expect(UI_KIT_NOTE).toContain("always build the visual");
    expect(UI_KIT_NOTE).toContain("A visual never replaces the explanation");
    expect(UI_KIT_NOTE).toContain("Plain greetings, quick facts, short answers and casual chat stay as ordinary Markdown");
    expect(UI_KIT_NOTE).toContain("$$...$$");
    expect(UI_KIT_REMINDER).toContain("never add a diagram or mindmap unprompted");
    expect(UI_KIT_REMINDER).toContain("diagram block");
    expect(UI_KIT_REMINDER).toContain("formula in LaTeX");
  });

  it("teaches 3D scenes built from shapes and tubes", () => {
    expect(UI_KIT_NOTE).toContain("scene {type,id,title?,parts:");
    expect(UI_KIT_NOTE).toContain("so use tubes for rods, pipes, frames");
    expect(UI_KIT_NOTE).toContain('"shape":"tube"');
    expect(UI_KIT_NOTE).toContain("a bicycle, engine, building, molecule");
  });

  it("builds web pages live, and offers a preview only for HTML and SVG code", () => {
    expect(UI_KIT_NOTE).toContain("write it as an app block so it appears live right in the reply");
    expect(UI_KIT_NOTE).toContain("tagged html or svg: the reader gets a Preview button");
    expect(UI_KIT_NOTE).toContain("never say the reader can run it from the chat");
    expect(UI_KIT_NOTE).not.toContain("Run button");
  });

  it("places pictures next to the paragraph and panels at the end", () => {
    expect(UI_KIT_NOTE).toContain("Pictures and entity cards are the exceptions");
    expect(UI_KIT_NOTE).toContain("immediately after the paragraph that talks about");
    expect(UI_KIT_NOTE).toContain("web pictures normally go inline in the reply as Markdown");
    expect(UI_KIT_NOTE).toContain("Entity cards are the preferred shape");
    expect(UI_KIT_NOTE).toContain('"type":"entity"');
    expect(UI_KIT_REMINDER).toContain("never in a ui gallery at the end");
    expect(UI_KIT_REMINDER).toContain("inline entity-card block");
  });
});

describe("describeReturnGap", () => {
  it("stays silent for a quick follow-up", () => {
    expect(
      describeReturnGap(
        new Date("2026-10-09T22:00:00.000Z"),
        new Date("2026-10-09T22:30:00.000Z"),
        "Europe/London",
      ),
    ).toBeNull();
  });

  it("describes an overnight break in the person's timezone", () => {
    const note = describeReturnGap(
      new Date("2026-10-09T22:00:00.000Z"),
      new Date("2026-10-10T07:00:00.000Z"),
      "Europe/London",
    );
    expect(note).toContain("about 9 hours");
    expect(note).toContain("2026-10-09 23:00");
    expect(note).toContain("never mention timestamps");
  });

  it("counts longer breaks in days", () => {
    const note = describeReturnGap(
      new Date("2026-10-07T10:00:00.000Z"),
      new Date("2026-10-09T10:00:00.000Z"),
      "Europe/London",
    );
    expect(note).toContain("about 2 days");
  });
});

describe("recentPhrasesNote", () => {
  it("stays quiet when Bluebird has not spoken yet", () => {
    expect(
      recentPhrasesNote([
        { role: "user", content: "just made a yuzu iced tea and I'm doing my msc" },
      ]),
    ).toBeNull();
  });

  it("lists the lines from the last two replies", () => {
    const note = recentPhrasesNote([
      { role: "assistant", content: "Old reply that should be ignored entirely." },
      {
        role: "assistant",
        content: "Hope the code is flowing as smoothly as that tea. Python is solid ground.",
      },
      {
        role: "assistant",
        content: "Hope the MSc work feels engaging with the tea break keeping you going.",
      },
      { role: "user", content: "none yet" },
    ]);
    expect(note).toContain("Do not reuse");
    expect(note).toContain("smoothly as that tea");
    expect(note).toContain("tea break keeping you going");
    expect(note).not.toContain("Old reply");
  });

  it("skips fragments and de-duplicates lines", () => {
    const note = recentPhrasesNote([
      { role: "assistant", content: "Nice. Sounds good. Tea helps focus during study sessions." },
      { role: "assistant", content: "Tea helps focus during study sessions." },
    ]);
    expect(note?.match(/Tea helps focus/g)).toHaveLength(1);
    expect(note).not.toContain("- Nice");
  });
});

describe("calloutNote", () => {
  it("fires when they challenge the conversation itself", () => {
    for (const line of [
      "That's it?",
      "That is it?",
      "You're not gonna ask me?",
      "You are not gonna ask me?",
      "You didn't ask me how I feel back.",
      "You did not ask me how I feel back.",
      "You, you're the reason.",
      "You are the reason.",
      "I'm confused.",
      "I am confused.",
    ]) {
      expect(calloutNote(line), line).toContain("give them something back");
    }
  });

  it("stays quiet for ordinary conversation", () => {
    for (const line of [
      "How's your morning?",
      "What's the weather like today?",
      "Can you help me debug this function?",
      "Mochi is asleep on my desk.",
    ]) {
      expect(calloutNote(line), line).toBeNull();
    }
  });
});

describe("planning requests", () => {
  it("recognises requests for a trip, itinerary or schedule", () => {
    expect(looksLikePlanningRequest("plan me a trip to madrid")).toBe(true);
    expect(looksLikePlanningRequest("build a 3 day itinerary for Lisbon")).toBe(true);
    expect(looksLikePlanningRequest("make me a study plan for my exams")).toBe(true);
  });

  it("leaves ordinary questions alone", () => {
    expect(looksLikePlanningRequest("what is 2 plus 2")).toBe(false);
    expect(looksLikePlanningRequest("who wrote Hamlet")).toBe(false);
  });

  it("asks for the detail, the questionnaire and the follow-ups in one panel", () => {
    expect(PLANNING_NOTE).toContain("Day 1: the historic centre");
    expect(PLANNING_NOTE).toContain("Markdown table");
    expect(PLANNING_NOTE).toContain("single ui panel");
    expect(PLANNING_NOTE).toContain("suggestions block");
    expect(PLANNING_NOTE).not.toContain("—");
  });

  it("teaches the suggestions block in the block list", () => {
    expect(UI_KIT_NOTE).toContain("suggestions {type,items:[{label,message}]}");
  });
});
