import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { splitFencedBlocks } from "./code-split";
import { LiveStatus, liveActivityLabel, openFenceOf } from "./live-status";

describe("liveActivityLabel", () => {
  it("names an interactive view while it is being built", () => {
    const parts = splitFencedBlocks("Here is one.\n\n```app Star Formation\n<div>");
    expect(
      liveActivityLabel({ hasProse: true, openFence: openFenceOf(parts) }),
    ).toBe("Building Star Formation");
  });

  it("falls back to a generic name when the view has no title yet", () => {
    const parts = splitFencedBlocks("```app\n<div>");
    expect(liveActivityLabel({ hasProse: false, openFence: openFenceOf(parts) })).toBe(
      "Building interactive view",
    );
  });

  it("says searching while the web is being checked", () => {
    expect(liveActivityLabel({ activity: "searching", hasProse: false, openFence: null })).toBe(
      "Searching the web",
    );
  });

  it("says thinking until the first words arrive, then stops naming a step", () => {
    expect(liveActivityLabel({ hasProse: false, openFence: null })).toBe("Thinking");
    expect(liveActivityLabel({ hasProse: true, openFence: null })).toBeNull();
  });

  it("ignores a fence that has closed", () => {
    const parts = splitFencedBlocks("```app Done\n<p>hi</p>\n```\nAfter.");
    expect(openFenceOf(parts)).toBeNull();
  });
});

describe("LiveStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts the seconds since the step started", () => {
    render(<LiveStatus label="Building Star Formation" />);
    expect(screen.getByText("Building Star Formation")).toBeTruthy();
    expect(screen.getByText("0s")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText("3s")).toBeTruthy();
  });
});
