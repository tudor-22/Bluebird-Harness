import type { DesktopAdapter } from "../../agent/desktop/adapter";
import { imageSize } from "./image";
import { firstJson, toPixels, type BenchModel, type Usage } from "./model";
import { findMark, normalize, outlineShows, parseMarks, type OutlineMark } from "./outline";
import type { Step, Target } from "./tasks";

/** What one step reports back to the runner, beyond its time. */
export type StepOutcome = { ok: boolean; detail?: string; usage?: Usage; modelMs?: number };

/**
 * One way of seeing and using an app. The runner gives every strategy the same steps; a strategy
 * only decides how to find things on screen and how to act on them.
 */
export type Strategy = {
  readonly id: string;
  readonly describe: string;
  /** Whether a model is called; the report then shows its token use. */
  readonly usesModel: boolean;
  run(step: Step, app: string): Promise<StepOutcome>;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Fixed pauses, the same for every strategy. `settleMs` follows each action so the next look sees
 * the change; the others belong to the untimed setup. Tests set them to zero.
 */
export const timing = { settleMs: 150, windowPollMs: 250, quitMs: 1200, launchMs: 600, prepareMs: 200 };

/** Opening an app is the same for every strategy: the system launches it, then we wait for a window. */
async function openApp(adapter: DesktopAdapter, app: string): Promise<StepOutcome> {
  await adapter.launch(app);
  for (let tries = 0; tries < 40; tries += 1) {
    const windows = await adapter.windows(app).catch(() => []);
    if (windows.length > 0) return { ok: true };
    await wait(timing.windowPollMs || 1);
  }
  return { ok: false, detail: "No window appeared in time." };
}


/**
 * Bluebird's native path, with no model: read the window's outline through the accessibility API,
 * pick the element by its label, and use its own action. This is the floor: how fast the control
 * layer itself is when nothing has to think.
 */
export function accessibilityStrategy(adapter: DesktopAdapter): Strategy {
  const locate = async (app: string, target: Target): Promise<OutlineMark | null> => {
    const look = await adapter.look({ app });
    return findMark(parseMarks(look.outline), target);
  };
  return {
    id: "accessibility",
    describe: "Accessibility outline, element chosen by label (no model)",
    usesModel: false,
    async run(step, app) {
      switch (step.kind) {
        case "open":
          return openApp(adapter, app);
        case "find": {
          const found = await locate(app, step.target);
          return found ? { ok: true, detail: `mark ${found.mark} ${found.role} "${found.label}"` } : { ok: false, detail: "Not in the outline." };
        }
        case "click": {
          const found = await locate(app, step.target);
          if (!found) return { ok: false, detail: "Not in the outline." };
          await adapter.act(found.mark);
          await wait(timing.settleMs);
          return { ok: true };
        }
        case "type": {
          const found = step.target ? await locate(app, step.target) : null;
          if (step.target && !found) return { ok: false, detail: "Field not in the outline." };
          await adapter.type(step.text, found ? { mark: found.mark } : { app });
          await wait(timing.settleMs);
          return { ok: true };
        }
        case "key":
          await adapter.key(step.keys, app);
          await wait(timing.settleMs);
          return { ok: true };
        case "read":
          return readByOutline(adapter, app, step.target, step.expect);
      }
    },
  };
}

async function readByOutline(adapter: DesktopAdapter, app: string, target: Target, expect: string): Promise<StepOutcome> {
  const look = await adapter.look({ app });
  const found = findMark(parseMarks(look.outline), target);
  if (found) {
    const info = await adapter.read(found.mark);
    const value = info.value || info.title || "";
    return { ok: normalize(value) === normalize(expect), detail: `read "${value}"` };
  }
  // Displays are often plain text rather than an element with a mark: look for the value in the outline.
  const shown = outlineShows(look.outline, expect);
  return { ok: shown, detail: shown ? `outline shows "${expect}"` : "The expected value is not in the outline." };
}

/**
 * The accessibility outline, with a model choosing the element from the outline text. This is
 * the fair counterpart to the screenshot baseline: the same model makes the same decision, from
 * text instead of pixels.
 */
export function accessibilityModelStrategy(adapter: DesktopAdapter, model: BenchModel): Strategy {
  const choose = async (app: string, target: Target): Promise<{ mark: number | null; usage: Usage; ms: number }> => {
    const look = await adapter.look({ app });
    const reply = await model.ask(
      `Below is the accessibility outline of the ${app} window. Elements you can act on are written as [number] role "label".\n` +
        `Which number is ${target.describe}? Reply with JSON only: {"mark": <number>}, or {"mark": null} if it is not there.\n\n${look.outline}`,
    );
    const mark = firstJson(reply.text)?.mark;
    return { mark: typeof mark === "number" && Number.isInteger(mark) ? mark : null, usage: reply.usage, ms: reply.ms };
  };
  return {
    id: "accessibility-model",
    describe: "Accessibility outline, element chosen by the model from text",
    usesModel: true,
    async run(step, app) {
      switch (step.kind) {
        case "open":
          return openApp(adapter, app);
        case "find": {
          const pick = await choose(app, step.target);
          return { ok: pick.mark !== null, detail: pick.mark !== null ? `mark ${pick.mark}` : "The model found nothing.", usage: pick.usage, modelMs: pick.ms };
        }
        case "click": {
          const pick = await choose(app, step.target);
          if (pick.mark === null) return { ok: false, detail: "The model found nothing.", usage: pick.usage, modelMs: pick.ms };
          await adapter.act(pick.mark);
          await wait(timing.settleMs);
          return { ok: true, usage: pick.usage, modelMs: pick.ms };
        }
        case "type": {
          if (!step.target) {
            await adapter.type(step.text, { app });
            await wait(timing.settleMs);
            return { ok: true };
          }
          const pick = await choose(app, step.target);
          if (pick.mark === null) return { ok: false, detail: "The model found nothing.", usage: pick.usage, modelMs: pick.ms };
          await adapter.type(step.text, { mark: pick.mark });
          await wait(timing.settleMs);
          return { ok: true, usage: pick.usage, modelMs: pick.ms };
        }
        case "key":
          await adapter.key(step.keys, app);
          await wait(timing.settleMs);
          return { ok: true };
        case "read": {
          const look = await adapter.look({ app });
          const reply = await model.ask(
            `Below is the accessibility outline of the ${app} window. What is ${step.target.describe}? Reply with the value only, nothing else.\n\n${look.outline}`,
          );
          const value = reply.text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
          return { ok: normalize(value) === normalize(step.expect), detail: `read "${value.slice(0, 60)}"`, usage: reply.usage, modelMs: reply.ms };
        }
      }
    },
  };
}

/**
 * The baseline most computer-use agents use: take a screenshot, ask a vision model where the
 * element is, and click the real mouse there. Reading a value is also done by the model, from the
 * picture. Typing and key presses go through the same system calls as the other strategies.
 */
export function screenshotStrategy(adapter: DesktopAdapter, model: BenchModel): Strategy {
  type Shot = { mime: string; base64: string; width: number; height: number };
  const shoot = async (app: string): Promise<Shot> => {
    const data = await adapter.screenshot(app);
    const size = imageSize(Buffer.from(data.base64, "base64"));
    if (!size) throw new Error("Could not read the screenshot's size.");
    return { ...data, ...size };
  };

  /** Screen point for a pixel in a window screenshot: the window's frame, scaled to the picture. */
  const toScreen = async (app: string, shot: Shot, pixel: { x: number; y: number }) => {
    const [window] = await adapter.windows(app);
    if (!window || !window.width || !window.height || window.x === undefined || window.y === undefined) {
      throw new Error("The window's position is unknown, so a point in the screenshot cannot be placed on screen.");
    }
    const scale = shot.width / window.width;
    return { x: window.x + pixel.x / scale, y: window.y + pixel.y / scale };
  };

  const locate = async (app: string, target: Target) => {
    const shot = await shoot(app);
    const reply = await model.ask(
      `This is a screenshot of the ${app} window, ${shot.width} by ${shot.height} pixels. Where is ${target.describe}? ` +
        `Reply with JSON only: {"x": <number>, "y": <number>} for the centre of the element, or {"x": null, "y": null} if it is not visible.`,
      { mime: shot.mime, base64: shot.base64 },
    );
    const point = firstJson(reply.text);
    const x = point?.x;
    const y = point?.y;
    if (typeof x !== "number" || typeof y !== "number") return { shot, pixel: null, usage: reply.usage, ms: reply.ms };
    const pixel = toPixels({ x, y }, model.coords, shot);
    const inside = pixel.x >= 0 && pixel.y >= 0 && pixel.x <= shot.width && pixel.y <= shot.height;
    return { shot, pixel: inside ? pixel : null, usage: reply.usage, ms: reply.ms };
  };

  return {
    id: "screenshot",
    describe: "Screenshot, element located by a vision model, real mouse click",
    usesModel: true,
    async run(step, app) {
      switch (step.kind) {
        case "open":
          return openApp(adapter, app);
        case "find": {
          const found = await locate(app, step.target);
          return { ok: found.pixel !== null, detail: found.pixel ? `at ${Math.round(found.pixel.x)}, ${Math.round(found.pixel.y)} px` : "The model found nothing.", usage: found.usage, modelMs: found.ms };
        }
        case "click":
        case "type": {
          if (step.kind === "type" && !step.target) {
            await adapter.type(step.text, { app });
            await wait(timing.settleMs);
            return { ok: true };
          }
          const found = await locate(app, step.target!);
          if (!found.pixel) return { ok: false, detail: "The model found nothing.", usage: found.usage, modelMs: found.ms };
          const point = await toScreen(app, found.shot, found.pixel);
          await adapter.click(point);
          if (step.kind === "type") await adapter.type(step.text, { app });
          await wait(timing.settleMs);
          return { ok: true, usage: found.usage, modelMs: found.ms };
        }
        case "key":
          await adapter.key(step.keys, app);
          await wait(timing.settleMs);
          return { ok: true };
        case "read": {
          const shot = await shoot(app);
          const reply = await model.ask(`This is a screenshot of the ${app} window. What is ${step.target.describe}? Reply with the value only, nothing else.`, {
            mime: shot.mime,
            base64: shot.base64,
          });
          const value = reply.text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
          return { ok: normalize(value) === normalize(step.expect), detail: `read "${value.slice(0, 60)}"`, usage: reply.usage, modelMs: reply.ms };
        }
      }
    },
  };
}
