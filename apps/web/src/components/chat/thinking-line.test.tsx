import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThinkingLine } from "./thinking-line";

describe("ThinkingLine", () => {
  it("shows how long the model thought and keeps the thinking closed by default", () => {
    render(
      <ThinkingLine
        live={false}
        reasoning="First I weigh the options."
        steps={['Searched the web for "tides" (3 sources)']}
        seconds={25}
        defaultOpen={false}
      />,
    );
    expect(screen.getByText("Thought")).toBeTruthy();
    expect(screen.getByText("25s")).toBeTruthy();
    expect(screen.queryByText("First I weigh the options.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByText("First I weigh the options.")).toBeTruthy();
    expect(screen.getByText(/Searched the web for "tides"/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide details" }));
    expect(screen.queryByText("First I weigh the options.")).toBeNull();
  });

  it("starts open when Show thinking is on, and updates live", () => {
    const { rerender } = render(
      <ThinkingLine live reasoning="Step one." steps={[]} defaultOpen />,
    );
    expect(screen.getByText("Thinking")).toBeTruthy();
    expect(screen.getByText("Step one.")).toBeTruthy();
    rerender(<ThinkingLine live reasoning="Step one. Step two." steps={[]} defaultOpen />);
    expect(screen.getByText("Step one. Step two.")).toBeTruthy();
  });

  it("has no arrow when there is nothing to show", () => {
    render(<ThinkingLine live reasoning="" steps={[]} defaultOpen={false} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("ThinkingLine activity", () => {
  it("shows what is being built instead of a second status line", () => {
    render(<ThinkingLine live reasoning="" steps={[]} trailLabel="Ran 2 commands" activity="Building interactive view" />);
    expect(screen.getByText("Building interactive view")).toBeTruthy();
    expect(screen.queryByText("Working")).toBeNull();
  });
});
