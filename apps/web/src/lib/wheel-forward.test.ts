import { afterEach, describe, expect, it } from "vitest";

import { forwardWheelToThread, wheelDeltaPixels } from "./wheel-forward";

afterEach(() => {
  document.body.innerHTML = "";
});

/** jsdom has no layout, so give an element the sizes a real one would have. */
function sized(element: HTMLElement, sizes: { scrollHeight: number; clientHeight: number; scrollTop?: number }) {
  Object.defineProperty(element, "scrollHeight", { configurable: true, value: sizes.scrollHeight });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: sizes.clientHeight });
  element.scrollTop = sizes.scrollTop ?? 0;
  element.style.overflowY = "auto";
  return element;
}

function wheel(target: Element, init: WheelEventInit): WheelEvent {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, "target", { value: target });
  return event;
}

function page() {
  document.body.innerHTML = `
    <div id="side"></div>
    <main id="thread"><p id="inside">hello</p></main>
    <pre id="code"></pre>
    <div role="dialog" id="dialog"><span id="dialogText"></span></div>`;
  const thread = sized(document.getElementById("thread")!, { scrollHeight: 2000, clientHeight: 600 });
  return {
    thread,
    side: document.getElementById("side")!,
    inside: document.getElementById("inside")!,
    code: document.getElementById("code")!,
    dialogText: document.getElementById("dialogText")!,
  };
}

describe("wheel scrolling on the blank sides", () => {
  it("scrolls the conversation when the pointer is off to the side", () => {
    const { thread, side } = page();
    expect(forwardWheelToThread(wheel(side, { deltaY: 120 }), thread)).toBe(true);
    expect(thread.scrollTop).toBe(120);
    expect(forwardWheelToThread(wheel(side, { deltaY: -50 }), thread)).toBe(true);
    expect(thread.scrollTop).toBe(70);
  });

  it("leaves the conversation to scroll itself when the pointer is over it", () => {
    const { thread, inside } = page();
    expect(forwardWheelToThread(wheel(inside, { deltaY: 120 }), thread)).toBe(false);
    expect(thread.scrollTop).toBe(0);
  });

  it("lets a scrollable code block keep its own scrolling, until it reaches its end", () => {
    const { thread, code } = page();
    sized(code, { scrollHeight: 900, clientHeight: 300, scrollTop: 0 });
    expect(forwardWheelToThread(wheel(code, { deltaY: 100 }), thread)).toBe(false);
    // At the end of the code, the turn moves on to the conversation.
    code.scrollTop = 600;
    expect(forwardWheelToThread(wheel(code, { deltaY: 100 }), thread)).toBe(true);
    expect(thread.scrollTop).toBe(100);
    // Scrolling back up still belongs to the code block.
    expect(forwardWheelToThread(wheel(code, { deltaY: -100 }), thread)).toBe(false);
  });

  it("ignores open dialogs, sideways turns and zoom gestures", () => {
    const { thread, side, dialogText } = page();
    expect(forwardWheelToThread(wheel(dialogText, { deltaY: 100 }), thread)).toBe(false);
    expect(forwardWheelToThread(wheel(side, { deltaX: 200, deltaY: 10 }), thread)).toBe(false);
    expect(forwardWheelToThread(wheel(side, { deltaY: 100, ctrlKey: true }), thread)).toBe(false);
    expect(thread.scrollTop).toBe(0);
  });

  it("reads line and page based wheels in pixels", () => {
    expect(wheelDeltaPixels({ deltaY: 3, deltaMode: 1 }, 600)).toBe(48);
    expect(wheelDeltaPixels({ deltaY: 1, deltaMode: 2 }, 600)).toBe(600);
    expect(wheelDeltaPixels({ deltaY: 90, deltaMode: 0 }, 600)).toBe(90);
  });
});
