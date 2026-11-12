import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContextRing, formatTokens, percentOf } from "./context-ring";

describe("formatTokens", () => {
  it("writes thousands with a K", () => {
    expect(formatTokens(128_000)).toBe("128K");
    expect(formatTokens(16_384)).toBe("16K");
    expect(formatTokens(3_400)).toBe("3.4K");
    expect(formatTokens(400)).toBe("0.4K");
    expect(formatTokens(0)).toBe("0K");
    expect(formatTokens(999_000)).toBe("999K");
    expect(formatTokens(1_048_576)).toBe("1M");
    expect(formatTokens(1_000_000)).toBe("1M");
    expect(formatTokens(1_500_000)).toBe("1.5M");
    expect(formatTokens(2_000_000)).toBe("2M");
  });
});

describe("percentOf", () => {
  it("rounds, and says less than one for a little", () => {
    expect(percentOf(12_800, 128_000)).toBe(10);
    expect(percentOf(100, 128_000)).toBe("<1");
    expect(percentOf(0, 128_000)).toBe(0);
    expect(percentOf(200_000, 128_000)).toBe(100);
  });
});

describe("ContextRing", () => {
  it("shows the title, percent and used out of total on hover", () => {
    render(<ContextRing usage={{ used: 12_800, window: 128_000, estimated: false, model: "m" }} />);
    const button = screen.getByRole("button", { name: /Context window usage: 10% used, 13K of 128K/ });
    fireEvent.mouseEnter(button.parentElement!);
    expect(screen.getByText("Context window usage")).toBeTruthy();
    expect(screen.getByText("10% used")).toBeTruthy();
    expect(screen.getByText("13K / 128K")).toBeTruthy();
  });

  it("says when the count is only an estimate, and copes with no data", () => {
    const { rerender } = render(<ContextRing usage={{ used: 2000, window: 16_384, estimated: true, model: null }} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/Estimated/)).toBeTruthy();
    rerender(<ContextRing usage={null} />);
    expect(screen.getByText("Not available yet.")).toBeTruthy();
  });
});
