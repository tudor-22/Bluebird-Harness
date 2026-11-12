import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MessageActions } from "./chat-stage";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("MessageActions", () => {
  it("copies the reply text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<MessageActions messageId="m1" text="Day 1: the historic centre" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy reply" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Day 1: the historic centre"));
    expect(await screen.findByText("Copied")).toBeTruthy();
  });

  it("keeps one feedback choice per reply and lets it be changed", () => {
    render(<MessageActions messageId="m2" text="Hello" />);
    const up = screen.getByRole("button", { name: "Good reply" });
    const down = screen.getByRole("button", { name: "Poor reply" });

    fireEvent.click(up);
    expect(up.getAttribute("aria-pressed")).toBe("true");
    expect(window.localStorage.getItem("bluebird:feedback:m2")).toBe("up");

    fireEvent.click(down);
    expect(down.getAttribute("aria-pressed")).toBe("true");
    expect(up.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(down);
    expect(down.getAttribute("aria-pressed")).toBe("false");
    expect(window.localStorage.getItem("bluebird:feedback:m2")).toBeNull();
  });
});
