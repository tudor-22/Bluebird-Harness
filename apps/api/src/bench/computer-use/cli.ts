import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createDesktop } from "../../agent/desktop";
import { createBenchModel, modelConfigFromEnv } from "./model";
import { machineInfo, markdownTable, runBench, summarize, type BenchReport } from "./runner";
import { accessibilityModelStrategy, accessibilityStrategy, screenshotStrategy, type Strategy } from "./strategies";
import { defaultTasks, loadTasks } from "./tasks";

const HELP = `Computer-use benchmark: Bluebird's accessibility control against a screenshot baseline.

Usage: pnpm bench:computer-use [--runs 5] [--tasks file.json] [--strategies accessibility,screenshot] [--out dir]

  --runs        Runs per task and strategy (default 5).
  --tasks       A JSON task file (see docs/benchmarks/computer-use.md). Default: the system calculator.
  --strategies  Any of accessibility, accessibility-model, screenshot (default: all that can run).
  --out         Folder for the results (default .data/bench/computer-use).

The model strategies need a model that speaks the Chat Completions API:
  BENCH_MODEL         Model name, such as qwen2.5vl:7b or gpt-4o. Required for the model strategies.
  BENCH_MODEL_URL     Base address (default http://127.0.0.1:11434/v1, Ollama).
  BENCH_MODEL_KEY     API key, for hosted services.
  BENCH_MODEL_COORDS  pixels (default), normalized-1000 or normalized-1: how the model gives positions.
`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      runs: { type: "string", default: "5" },
      tasks: { type: "string" },
      strategies: { type: "string" },
      out: { type: "string", default: join(".data", "bench", "computer-use") },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  const runs = Number.parseInt(values.runs ?? "5", 10);
  if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs must be a whole number from 1.");

  const adapter = createDesktop(resolve(".data", "helpers"));
  if (!adapter) throw new Error(`There is no desktop control for ${process.platform}.`);
  const status = await adapter.status({ prompt: true });
  if (!status.ready) throw new Error(status.message);

  const tasks = values.tasks ? await loadTasks(values.tasks) : defaultTasks();
  const config = modelConfigFromEnv();
  const model = config ? createBenchModel(config) : null;
  const wanted = values.strategies ? values.strategies.split(",").map((id) => id.trim()).filter(Boolean) : null;

  const available: Record<string, () => Strategy | string> = {
    accessibility: () => accessibilityStrategy(adapter),
    "accessibility-model": () => (model ? accessibilityModelStrategy(adapter, model) : "BENCH_MODEL is not set."),
    screenshot: () => (model ? screenshotStrategy(adapter, model) : "BENCH_MODEL is not set; the screenshot baseline needs a vision model."),
  };
  const strategies: Strategy[] = [];
  const skipped: BenchReport["skipped"] = [];
  for (const id of wanted ?? Object.keys(available)) {
    const make = available[id];
    if (!make) throw new Error(`Unknown strategy "${id}". Use ${Object.keys(available).join(", ")}.`);
    const made = make();
    if (typeof made === "string") skipped.push({ id, reason: made });
    else strategies.push(made);
  }
  if (strategies.length === 0) throw new Error("No strategy can run.");

  // Start the helper and the app once, untimed, so the first measured step does not pay for it.
  await adapter.launch(tasks[0].app);
  await adapter.look({ app: tasks[0].app }).catch(() => undefined);

  const startedAt = new Date().toISOString();
  process.stdout.write(`Running ${tasks.length} tasks x ${strategies.length} strategies x ${runs} runs on ${adapter.platform}.\n`);
  const results = await runBench(adapter, strategies, tasks, {
    runs,
    onResult: (result) =>
      process.stdout.write(`  run ${result.run}  ${result.task.padEnd(16)} ${result.strategy.padEnd(20)} ${result.ok ? "ok  " : "fail"}  ${Math.round(result.totalMs)} ms${result.error ? `  ${result.error}` : ""}\n`),
  });
  await adapter.close();

  const report: BenchReport = {
    version: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    machine: machineInfo(),
    model: config ? { name: config.model, baseUrl: config.baseUrl, coords: config.coords ?? "pixels" } : null,
    runsPerTask: runs,
    strategies: strategies.map((strategy) => ({ id: strategy.id, describe: strategy.describe, usesModel: strategy.usesModel })),
    skipped,
    results,
    summary: summarize(results, strategies),
  };
  const dir = resolve(values.out!);
  await mkdir(dir, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, "-");
  const jsonPath = join(dir, `${stamp}.json`);
  const mdPath = join(dir, `${stamp}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(mdPath, markdownTable(report));
  process.stdout.write(`\n${markdownTable(report)}\nWrote ${jsonPath}\nWrote ${mdPath}\n`);
}

void main().then(
  () => process.exit(0),
  (error) => {
    console.error((error as Error).message);
    process.exit(1);
  },
);
