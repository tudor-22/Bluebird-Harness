import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Target } from "./outline";

/**
 * A benchmark task is a short script of steps against one app. The same script runs under every
 * strategy, so the only thing that changes between runs is how the steps see and act on the app.
 */
const targetSchema = z.object({
  describe: z.string().min(1),
  labels: z.array(z.string()).min(1),
  role: z.string().optional(),
});

const stepSchema = z.discriminatedUnion("kind", [
  /** Open the app (or bring it forward) and wait until it shows a window. */
  z.object({ kind: z.literal("open") }),
  /** Locate an element without acting on it. */
  z.object({ kind: z.literal("find"), target: targetSchema }),
  z.object({ kind: z.literal("click"), target: targetSchema }),
  /** Type into an element, or into whatever has focus in the app when no target is given. */
  z.object({ kind: z.literal("type"), text: z.string().min(1), target: targetSchema.optional() }),
  /** Press keys, such as escape or cmd+a. Every strategy sends them the same way. */
  z.object({ kind: z.literal("key"), keys: z.string().min(1) }),
  /** Read a value back and compare it with what is expected. */
  z.object({ kind: z.literal("read"), expect: z.string().min(1), target: targetSchema }),
]);

const taskSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  app: z.string().min(1),
  /** Steps run before the timed steps, such as clearing the app. Not timed, not scored. */
  setup: z.array(stepSchema).default([]),
  steps: z.array(stepSchema).min(1),
});

export const taskFileSchema = z.object({ tasks: z.array(taskSchema).min(1) });

export type Step = z.infer<typeof stepSchema>;
export type Task = z.infer<typeof taskSchema>;
export type { Target };

const digit = (n: string, word: string): Target => ({ describe: `the ${n} button`, labels: [n, word], role: "button" });
const add: Target = { describe: "the add (+) button", labels: ["Add", "plus", "+"], role: "button" };
const equals: Target = { describe: "the equals (=) button", labels: ["Equals", "equal", "="], role: "button" };

/**
 * The default tasks use the calculator each system ships with, because its buttons and display
 * are the same from one run to the next. Pass --tasks with a JSON file to use any other app.
 */
function calculatorTasks(app: string, display: Target): Task[] {
  return [
    { id: "open-app", title: "Open the app", app, setup: [], steps: [{ kind: "open" }] },
    { id: "find-element", title: "Find a button", app, setup: [{ kind: "open" }], steps: [{ kind: "find", target: digit("7", "seven") }] },
    {
      id: "click-and-read",
      title: "Click 7 + 8 = and read the result",
      app,
      setup: [{ kind: "open" }, { kind: "key", keys: "escape" }, { kind: "key", keys: "escape" }],
      steps: [
        { kind: "click", target: digit("7", "seven") },
        { kind: "click", target: add },
        { kind: "click", target: digit("8", "eight") },
        { kind: "click", target: equals },
        { kind: "read", expect: "15", target: display },
      ],
    },
    {
      id: "type-and-read",
      title: "Type 12*3= and read the result",
      app,
      setup: [{ kind: "open" }, { kind: "key", keys: "escape" }, { kind: "key", keys: "escape" }],
      steps: [
        { kind: "type", text: "12*3=" },
        { kind: "read", expect: "36", target: display },
      ],
    },
  ];
}

export function defaultTasks(platform: NodeJS.Platform = process.platform): Task[] {
  if (platform === "win32") return calculatorTasks("Calculator", { describe: "the calculator's result display", labels: ["Display is", "Display"] });
  if (platform === "linux") return calculatorTasks("gnome-calculator", { describe: "the calculator's result display", labels: ["Result", "Display"] });
  return calculatorTasks("Calculator", { describe: "the number shown in the calculator's display", labels: ["Display", "main display"] });
}

export async function loadTasks(path: string): Promise<Task[]> {
  const parsed = taskFileSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
  if (!parsed.success) throw new Error(`The task file is not valid: ${parsed.error.issues[0]?.message ?? "unknown problem"}`);
  return parsed.data.tasks;
}
