import { describe, expect, it } from "vitest";

import {
  APP_CSP,
  APP_SEND_INTERVAL_MS,
  APP_SEND_MAX_CHARS,
  buildAppDocument,
  clampAppHeight,
  createSendGate,
  parseAppMessage,
} from "./app-sandbox";

describe("buildAppDocument", () => {
  it("blocks every network request and keeps the model's markup inside the body", () => {
    const doc = buildAppDocument("<button>Roll</button>");

    expect(APP_CSP).toContain("connect-src 'none'");
    expect(APP_CSP).toContain("default-src 'none'");
    expect(doc).toContain(`content="${APP_CSP}"`);
    expect(doc.indexOf("<script>")).toBeLessThan(doc.indexOf("<button>Roll</button>"));
    expect(doc).toContain("<body><button>Roll</button></body>");
  });
});

describe("parseAppMessage", () => {
  it("accepts the three messages the frame may send", () => {
    expect(parseAppMessage({ bluebird: true, type: "height", height: 240.4 })).toEqual({
      type: "height",
      height: 240.4,
    });
    expect(parseAppMessage({ bluebird: true, type: "gesture" })).toEqual({ type: "gesture" });
    expect(parseAppMessage({ bluebird: true, type: "send", text: "  Split £80 four ways  " })).toEqual({
      type: "send",
      text: "Split £80 four ways",
    });
  });

  it("ignores anything that is not from the bridge", () => {
    expect(parseAppMessage({ type: "send", text: "hi" })).toBeNull();
    expect(parseAppMessage({ bluebird: false, type: "send", text: "hi" })).toBeNull();
    expect(parseAppMessage({ bluebird: true, type: "navigate", url: "https://x.test" })).toBeNull();
    expect(parseAppMessage({ bluebird: true, type: "send", text: "   " })).toBeNull();
    expect(parseAppMessage({ bluebird: true, type: "height", height: Number.NaN })).toBeNull();
    expect(parseAppMessage("send")).toBeNull();
    expect(parseAppMessage(null)).toBeNull();
  });

  it("caps the length of a message sent from the frame", () => {
    const message = parseAppMessage({ bluebird: true, type: "send", text: "x".repeat(5000) });
    expect(message?.type === "send" ? message.text.length : 0).toBe(APP_SEND_MAX_CHARS);
  });
});

describe("clampAppHeight", () => {
  it("keeps the frame between a readable minimum and a sane maximum", () => {
    expect(clampAppHeight(20)).toBe(120);
    expect(clampAppHeight(260.6)).toBe(261);
    expect(clampAppHeight(5000)).toBe(1000);
  });
});

describe("createSendGate", () => {
  it("does not send until the reader has pressed something in the frame", () => {
    const now = 0;
    const gate = createSendGate(() => now);

    expect(gate.allowSend()).toBe(false);
    gate.gesture();
    expect(gate.allowSend()).toBe(true);
    // One press allows one message.
    expect(gate.allowSend()).toBe(false);
  });

  it("spaces messages apart even after repeated presses", () => {
    let now = 10_000;
    const gate = createSendGate(() => now);

    gate.gesture();
    expect(gate.allowSend()).toBe(true);
    now += APP_SEND_INTERVAL_MS - 1;
    gate.gesture();
    expect(gate.allowSend()).toBe(false);
    now += 1;
    gate.gesture();
    expect(gate.allowSend()).toBe(true);
  });
});
