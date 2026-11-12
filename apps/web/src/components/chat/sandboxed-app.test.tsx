import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SandboxedApp } from "./sandboxed-app";

function postFromFrame(frame: HTMLIFrameElement, data: unknown) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", { data, source: frame.contentWindow as MessageEventSource }),
    );
  });
}

describe("SandboxedApp", () => {
  it("runs the tool with scripts only, without same-origin access", () => {
    render(<SandboxedApp title="Dice" html="<button>Roll</button>" onSend={vi.fn()} />);

    const frame = screen.getByTitle("Dice") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("allow")).toBe("");
    expect(frame.getAttribute("srcdoc")).toContain("<button>Roll</button>");
  });

  it("sends a message only after a press inside the frame", () => {
    const onSend = vi.fn();
    render(<SandboxedApp title="Dice" html="<p>Hi</p>" onSend={onSend} />);
    const frame = screen.getByTitle("Dice") as HTMLIFrameElement;

    postFromFrame(frame, { bluebird: true, type: "send", text: "roll again" });
    expect(onSend).not.toHaveBeenCalled();

    postFromFrame(frame, { bluebird: true, type: "gesture" });
    postFromFrame(frame, { bluebird: true, type: "send", text: "roll again" });
    expect(onSend).toHaveBeenCalledWith("roll again");
  });

  it("ignores messages from anything other than its own frame", () => {
    const onSend = vi.fn();
    render(<SandboxedApp title="Dice" html="<p>Hi</p>" onSend={onSend} />);
    const frame = screen.getByTitle("Dice") as HTMLIFrameElement;

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { bluebird: true, type: "gesture" },
          source: window as unknown as MessageEventSource,
        }),
      );
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { bluebird: true, type: "send", text: "forged" },
          source: window as unknown as MessageEventSource,
        }),
      );
    });
    expect(onSend).not.toHaveBeenCalled();
    expect(frame).toBeTruthy();
  });

  it("fits the page it shows, but stops following a page that grows with its frame", () => {
    render(<SandboxedApp title="Game" html="<p>Hi</p>" onSend={vi.fn()} />);
    const frame = screen.getByTitle("Game") as HTMLIFrameElement;

    postFromFrame(frame, { bluebird: true, type: "height", height: 400 });
    expect(frame.style.height).toBe("400px");

    // A page sized to the whole window grows by its padding on every turn.
    for (let step = 1; step <= 10; step += 1) {
      postFromFrame(frame, { bluebird: true, type: "height", height: 400 + step * 48 });
    }
    const held = parseInt(frame.style.height, 10);
    expect(held).toBeLessThan(400 + 10 * 48);

    // Doing something in the page lets it grow again.
    postFromFrame(frame, { bluebird: true, type: "gesture" });
    postFromFrame(frame, { bluebird: true, type: "height", height: held + 100 });
    expect(frame.style.height).toBe(`${held + 100}px`);
  });
});
