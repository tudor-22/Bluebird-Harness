import { beforeAll, describe, expect, it } from "vitest";
import type { DesktopAdapter } from "../../agent/desktop/adapter";
import { imageSize } from "./image";
import { createBenchModel, firstJson, modelConfigFromEnv, toPixels, type BenchModel } from "./model";
import { findMark, outlineShows, parseMarks } from "./outline";
import { markdownTable, median, runBench, summarize, type BenchReport } from "./runner";
import { accessibilityModelStrategy, accessibilityStrategy, screenshotStrategy, timing } from "./strategies";
import { defaultTasks, taskFileSchema } from "./tasks";

/** A tiny calculator that answers like a desktop helper would, with a known window geometry. */
function fakeCalculator() {
  const window = { index: 1, title: "Calculator", x: 100, y: 50, width: 200, height: 300 };
  const buttons = [
    { label: "7", at: { x: 20, y: 100 }, press: "7" },
    { label: "8", at: { x: 60, y: 100 }, press: "8" },
    { label: "Add", at: { x: 100, y: 100 }, press: "+" },
    { label: "Equals", at: { x: 140, y: 100 }, press: "=" },
  ];
  let entry = "";
  let display = "0";
  let open = false;
  const calls: string[] = [];
  const pressKey = (key: string) => {
    if (key === "=") {
      // The entry is only digits and + or * here.
      display = String(entry.split("+").reduce((sum, part) => sum + part.split("*").reduce((product, n) => product * Number(n || 0), 1), 0));
      entry = "";
    } else {
      entry += key;
      display = entry;
    }
  };
  const outline = () => `window "Calculator"\n  ${display}\n${buttons.map((b, i) => `  [${i + 1}] button "${b.label}"`).join("\n")}`;
  const adapter: DesktopAdapter = {
    platform: "fake",
    async status() {
      return { ready: true, message: "Ready." };
    },
    async apps() {
      return [];
    },
    async windows() {
      return open ? [window] : [];
    },
    async look() {
      calls.push("look");
      return { app: "Calculator", outline: outline(), marks: buttons.length, truncated: false };
    },
    async act(mark) {
      calls.push(`act ${mark}`);
      pressKey(buttons[mark - 1].press);
    },
    async click(target) {
      calls.push(`click ${target.x},${target.y}`);
      const hit = buttons.find((b) => Math.abs(window.x + b.at.x - (target.x ?? -1)) < 8 && Math.abs(window.y + b.at.y - (target.y ?? -1)) < 8);
      if (hit) pressKey(hit.press);
    },
    async setValue() {
      return "";
    },
    async type(text) {
      calls.push(`type ${text}`);
      for (const ch of text) pressKey(ch);
    },
    async key(keys) {
      calls.push(`key ${keys}`);
      if (keys === "escape") {
        entry = "";
        display = "0";
      }
    },
    async scroll() {},
    async read() {
      return {};
    },
    async launch() {
      const launched = !open;
      open = true;
      return { launched };
    },
    async activate() {},
    async quit() {
      open = false;
    },
    async screenshot() {
      // A PNG header is enough for the size; the fake model never looks at the pixels.
      const png = Buffer.alloc(33);
      png.writeUInt32BE(0x89504e47, 0);
      png.writeUInt32BE(0x0d0a1a0a, 4);
      png.writeUInt32BE(window.width * 2, 16);
      png.writeUInt32BE(window.height * 2, 20);
      return { base64: png.toString("base64"), mime: "image/png" };
    },
    async clipboardGet() {
      return "";
    },
    async clipboardSet() {},
    async close() {},
  };
  /** A model that knows where everything is: it answers in pixels of a 2x screenshot, or by mark. */
  const model: BenchModel = {
    name: "fake",
    coords: "pixels",
    async ask(prompt, image) {
      const usage = { inputTokens: image ? 1000 : 200, outputTokens: 10 };
      const target = buttons.find((b) => prompt.includes(`the ${b.label} button`) || (b.label === "Add" && prompt.includes("add (+)")) || (b.label === "Equals" && prompt.includes("equals (=)")));
      if (/Reply with the value only/.test(prompt)) return { text: display, usage, ms: 1 };
      if (!target) return { text: image ? '{"x": null, "y": null}' : '{"mark": null}', usage, ms: 1 };
      if (image) return { text: `{"x": ${target.at.x * 2}, "y": ${target.at.y * 2}}`, usage, ms: 1 };
      return { text: `{"mark": ${buttons.indexOf(target) + 1}}`, usage, ms: 1 };
    },
  };
  return { adapter, model, calls, display: () => display };
}

describe("computer-use benchmark", () => {
  beforeAll(() => {
    Object.assign(timing, { settleMs: 0, windowPollMs: 0, quitMs: 0, launchMs: 0, prepareMs: 0 });
  });

  it("parses outline marks and finds elements by label and role", () => {
    const outline = 'window "Calculator"\n  ‎15\n  [1] button "7"\n  [2] textfield "Search" = "hello" (focused)\n  [3] button "All Clear"';
    const marks = parseMarks(outline);
    expect(marks.map((m) => [m.mark, m.role, m.label, m.value])).toEqual([
      [1, "button", "7", ""],
      [2, "textfield", "Search", "hello"],
      [3, "button", "All Clear", ""],
    ]);
    expect(findMark(marks, { describe: "", labels: ["seven", "7"], role: "button" })?.mark).toBe(1);
    expect(findMark(marks, { describe: "", labels: ["clear"], role: "button" })?.mark).toBe(3);
    expect(findMark(marks, { describe: "", labels: ["Search"], role: "button" })).toBeNull();
    expect(outlineShows(outline, "15")).toBe(true);
    expect(outlineShows(outline, "hello")).toBe(true);
    expect(outlineShows(outline, "1")).toBe(false);
  });

  it("runs the default tasks with the accessibility strategy and no model", async () => {
    const { adapter, calls } = fakeCalculator();
    const strategy = accessibilityStrategy(adapter);
    const results = await runBench(adapter, [strategy], defaultTasks("darwin"), { runs: 2 });
    expect(results).toHaveLength(8);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.every((r) => r.inputTokens === 0)).toBe(true);
    expect(calls).toContain("act 1");
    expect(calls.some((c) => c.startsWith("click"))).toBe(false);
  });

  it("maps a model's screenshot point to the screen and clicks the real mouse", async () => {
    const { adapter, model, calls } = fakeCalculator();
    const results = await runBench(adapter, [screenshotStrategy(adapter, model)], defaultTasks("darwin"), { runs: 1 });
    expect(results.map((r) => [r.task, r.ok])).toEqual([
      ["open-app", true],
      ["find-element", true],
      ["click-and-read", true],
      ["type-and-read", true],
    ]);
    // 7 sits at (20, 100) in a window at (100, 50): the screen point is (120, 150).
    expect(calls).toContain("click 120,150");
    const clickAndRead = results.find((r) => r.task === "click-and-read")!;
    expect(clickAndRead.inputTokens).toBe(5000);
    expect(clickAndRead.steps.every((s) => typeof s.modelMs === "number")).toBe(true);
  });

  it("lets the model pick marks from the outline text", async () => {
    const { adapter, model } = fakeCalculator();
    const results = await runBench(adapter, [accessibilityModelStrategy(adapter, model)], defaultTasks("darwin"), { runs: 1 });
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.find((r) => r.task === "click-and-read")!.inputTokens).toBe(1000);
  });

  it("stops a task at the first failed step and reports it", async () => {
    const { adapter, model } = fakeCalculator();
    const blind: BenchModel = { ...model, ask: async () => ({ text: "I cannot tell.", usage: { inputTokens: 5, outputTokens: 3 }, ms: 1 }) };
    const [result] = await runBench(adapter, [screenshotStrategy(adapter, blind)], [defaultTasks("darwin")[2]], { runs: 1 });
    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe(0);
    expect(result.steps).toHaveLength(1);
  });

  it("summarizes runs and writes a markdown table without inventing numbers for model-free runs", async () => {
    const { adapter, model } = fakeCalculator();
    const strategies = [accessibilityStrategy(adapter), screenshotStrategy(adapter, model)];
    const results = await runBench(adapter, strategies, defaultTasks("darwin"), { runs: 3 });
    const summary = summarize(results, strategies);
    expect(summary).toHaveLength(8);
    const ax = summary.find((row) => row.strategy === "accessibility" && row.task === "click-and-read")!;
    expect(ax.successes).toBe(3);
    expect(ax.medianInputTokens).toBeNull();
    const report = { version: 1, startedAt: "t", finishedAt: "t", machine: { platform: "darwin", release: "1", arch: "arm64", cpu: "cpu", cpus: 1, memoryGb: 1, node: "v22" }, model: null, runsPerTask: 3, strategies: [], skipped: [{ id: "x", reason: "why" }], results, summary } satisfies BenchReport;
    const table = markdownTable(report);
    expect(table).toContain("| click-and-read | accessibility | 3/3 |");
    expect(table).toContain("no model");
    expect(table).toContain("Skipped `x`: why");
    expect(table).not.toContain("\u2014");
  });

  it("reads image sizes, model replies and settings", () => {
    // A minimal JPEG: SOI, an APP0 segment, then SOF0 with height 300 and width 400.
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x01, 0x90, 0x03]);
    expect(imageSize(jpeg)).toEqual({ width: 400, height: 300 });
    expect(imageSize(Buffer.from("nope"))).toBeNull();
    expect(firstJson('```json\n{"x": 1, "y": 2}\n```')).toEqual({ x: 1, y: 2 });
    expect(firstJson("<think>{bad}</think> {\"mark\": 3}")).toEqual({ mark: 3 });
    expect(toPixels({ x: 500, y: 250 }, "normalized-1000", { width: 400, height: 200 })).toEqual({ x: 200, y: 50 });
    expect(modelConfigFromEnv({})).toBeNull();
    expect(modelConfigFromEnv({ BENCH_MODEL: "qwen2.5vl:7b" })).toMatchObject({ baseUrl: "http://127.0.0.1:11434/v1", coords: "pixels" });
    expect(() => modelConfigFromEnv({ BENCH_MODEL: "m", BENCH_MODEL_COORDS: "inches" })).toThrow(/BENCH_MODEL_COORDS/);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(taskFileSchema.safeParse({ tasks: defaultTasks("win32") }).success).toBe(true);
  });

  it("sends Chat Completions requests with the image and counts tokens", async () => {
    let sent: { url: string; body: any; headers: Record<string, string> } | null = null;
    const fetcher = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> };
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"x": 3, "y": 4}' } }], usage: { prompt_tokens: 812, completion_tokens: 9 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const model = createBenchModel({ baseUrl: "http://localhost:1234/v1", model: "vl", apiKey: "k" }, fetcher);
    const reply = await model.ask("where?", { mime: "image/png", base64: "AAAA" });
    expect(reply.usage).toEqual({ inputTokens: 812, outputTokens: 9 });
    expect(sent!.url).toBe("http://localhost:1234/v1/chat/completions");
    expect(sent!.headers.Authorization).toBe("Bearer k");
    expect(sent!.body.messages[0].content[1].image_url.url).toBe("data:image/png;base64,AAAA");
  });
});
