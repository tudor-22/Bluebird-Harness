import { describe, expect, it, vi } from "vitest";
import { composeDictation, desktopDictation, dictationCtor, dictationErrorMessage } from "./dictation";

function bridge() {
  let listener: ((event: { type: string; text?: string; error?: string }) => void) | null = null;
  return {
    start: vi.fn(),
    stop: vi.fn(),
    onEvent: (callback: typeof listener) => {
      listener = callback;
      return () => (listener = null);
    },
    send: (event: { type: string; text?: string; error?: string }) => listener?.(event),
  };
}

describe("desktop dictation", () => {
  it("looks like the browser's: partial words replace each other, a final one stays", () => {
    const native = bridge();
    const Ctor = desktopDictation(native);
    const dictation = new Ctor();
    const seen: { index: number; texts: string[]; final: boolean[] }[] = [];
    dictation.onresult = (event) =>
      seen.push({ index: event.resultIndex, texts: Array.from(event.results).map((r) => r[0]?.transcript ?? ""), final: Array.from(event.results).map((r) => r.isFinal) });
    dictation.lang = "en-GB";
    dictation.start();
    expect(native.start).toHaveBeenCalledWith("en-GB");

    native.send({ type: "partial", text: "hello" });
    native.send({ type: "partial", text: "hello wor" });
    native.send({ type: "final", text: "hello world" });
    native.send({ type: "partial", text: "next" });
    expect(seen.map((s) => s.index)).toEqual([0, 0, 0, 1]);
    expect(seen[1].texts).toEqual(["hello wor"]);
    expect(seen[2]).toMatchObject({ texts: ["hello world"], final: [true] });
    expect(seen[3]).toMatchObject({ texts: ["hello world", "next"], final: [true, false] });
  });

  it("passes errors on, ends cleanly, and stops the native side on stop", () => {
    const native = bridge();
    const dictation = new (desktopDictation(native))();
    const onerror = vi.fn();
    const onend = vi.fn();
    dictation.onerror = onerror;
    dictation.onend = onend;
    dictation.start();
    native.send({ type: "error", error: "not-allowed" });
    native.send({ type: "end" });
    expect(onerror).toHaveBeenCalledWith({ error: "not-allowed" });
    expect(onend).toHaveBeenCalledTimes(1);
    dictation.stop();
    expect(native.stop).toHaveBeenCalled();
  });

  it("explains a language the computer cannot dictate", () => {
    expect(dictationErrorMessage("language-not-supported")).toMatch(/language/);
  });
});

describe("browser dictation helpers", () => {
  it("joins the draft, the committed words and the live tail, skipping empty parts", () => {
    expect(composeDictation("Hello ", " big ", " wor")).toBe("Hello big wor");
    expect(composeDictation("", "", "")).toBe("");
    expect(composeDictation("Draft", "", "tail")).toBe("Draft tail");
  });

  it("gives a plain message for each kind of failure", () => {
    expect(dictationErrorMessage("not-allowed")).toMatch(/blocked/);
    expect(dictationErrorMessage("audio-capture")).toMatch(/microphone/i);
    expect(dictationErrorMessage("network")).toMatch(/network/);
    expect(dictationErrorMessage("no-speech")).toMatch(/speech/);
    expect(dictationErrorMessage(undefined)).toMatch(/stopped/);
  });

  it("uses the Mac app's own dictation when it is there, and the browser's otherwise", () => {
    class Browser {}
    vi.stubGlobal("webkitSpeechRecognition", Browser);
    expect(dictationCtor()).toBe(Browser);
    vi.stubGlobal("bluebirdDesktop", { dictation: bridge() });
    expect(dictationCtor()).not.toBe(Browser);
    vi.unstubAllGlobals();
  });
});
