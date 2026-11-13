import os from "node:os";
import type { DesktopAdapter } from "../../agent/desktop/adapter";
import { timing, type Strategy } from "./strategies";
import type { Step, Task } from "./tasks";

export type StepResult = {
  index: number;
  kind: Step["kind"];
  ok: boolean;
  /** Wall time of the step, model calls included. */
  ms: number;
  /** The part of `ms` spent waiting on the model. */
  modelMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  detail?: string;
};

export type TaskResult = {
  task: string;
  title: string;
  strategy: string;
  run: number;
  ok: boolean;
  /** The step that failed, when one did. Later steps are not run. */
  failedStep?: number;
  totalMs: number;
  inputTokens: number;
  outputTokens: number;
  steps: StepResult[];
  error?: string;
};

export type SummaryRow = {
  task: string;
  strategy: string;
  runs: number;
  successes: number;
  successRate: number;
  medianTaskMs: number;
  medianStepMs: number;
  /** Median over runs; null when the strategy calls no model. */
  medianInputTokens: number | null;
  medianOutputTokens: number | null;
};

export type BenchReport = {
  version: 1;
  startedAt: string;
  finishedAt: string;
  machine: { platform: string; release: string; arch: string; cpu: string; cpus: number; memoryGb: number; node: string };
  model: { name: string; baseUrl: string; coords: string } | null;
  runsPerTask: number;
  strategies: { id: string; describe: string; usesModel: boolean }[];
  skipped: { id: string; reason: string }[];
  results: TaskResult[];
  summary: SummaryRow[];
};

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Untimed steps that put the app in a known state, sent straight to the adapter. */
async function prepareTask(adapter: DesktopAdapter, task: Task): Promise<void> {
  for (const step of task.setup) {
    if (step.kind === "open") {
      await adapter.launch(task.app);
      await new Promise((resolve) => setTimeout(resolve, timing.launchMs));
    } else if (step.kind === "key") await adapter.key(step.keys, task.app);
    else if (step.kind === "type") await adapter.type(step.text, { app: task.app });
  }
  await new Promise((resolve) => setTimeout(resolve, timing.prepareMs));
}

export async function runTask(adapter: DesktopAdapter, strategy: Strategy, task: Task, run: number): Promise<TaskResult> {
  const result: TaskResult = { task: task.id, title: task.title, strategy: strategy.id, run, ok: false, totalMs: 0, inputTokens: 0, outputTokens: 0, steps: [] };
  try {
    // The open-app task measures opening from closed, so the app is quit first.
    if (task.steps[0]?.kind === "open" && task.setup.length === 0) {
      await adapter.quit(task.app).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, timing.quitMs));
    }
    await prepareTask(adapter, task);
  } catch (error) {
    result.error = `Setup failed: ${(error as Error).message}`;
    return result;
  }
  for (const [index, step] of task.steps.entries()) {
    const started = performance.now();
    let entry: StepResult;
    try {
      const outcome = await strategy.run(step, task.app);
      entry = {
        index,
        kind: step.kind,
        ok: outcome.ok,
        ms: performance.now() - started,
        modelMs: outcome.modelMs,
        inputTokens: outcome.usage?.inputTokens,
        outputTokens: outcome.usage?.outputTokens,
        detail: outcome.detail,
      };
    } catch (error) {
      entry = { index, kind: step.kind, ok: false, ms: performance.now() - started, detail: (error as Error).message.slice(0, 300) };
    }
    result.steps.push(entry);
    result.totalMs += entry.ms;
    result.inputTokens += entry.inputTokens ?? 0;
    result.outputTokens += entry.outputTokens ?? 0;
    if (!entry.ok) {
      result.failedStep = index;
      return result;
    }
  }
  result.ok = true;
  return result;
}

export function summarize(results: TaskResult[], strategies: Strategy[]): SummaryRow[] {
  const rows: SummaryRow[] = [];
  const tasks = [...new Set(results.map((result) => result.task))];
  for (const task of tasks) {
    for (const strategy of strategies) {
      const mine = results.filter((result) => result.task === task && result.strategy === strategy.id);
      if (mine.length === 0) continue;
      const successes = mine.filter((result) => result.ok).length;
      const passed = mine.filter((result) => result.ok);
      // Times are only comparable for runs that finished, so failed runs count for success only.
      const timed = passed.length ? passed : mine;
      rows.push({
        task,
        strategy: strategy.id,
        runs: mine.length,
        successes,
        successRate: successes / mine.length,
        medianTaskMs: median(timed.map((result) => result.totalMs)),
        medianStepMs: median(timed.flatMap((result) => result.steps.map((step) => step.ms))),
        medianInputTokens: strategy.usesModel ? median(mine.map((result) => result.inputTokens)) : null,
        medianOutputTokens: strategy.usesModel ? median(mine.map((result) => result.outputTokens)) : null,
      });
    }
  }
  return rows;
}

const ms = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`);

export function markdownTable(report: BenchReport): string {
  const lines = [
    `# Computer-use benchmark`,
    ``,
    `Run ${report.startedAt} on ${report.machine.platform} ${report.machine.release} (${report.machine.arch}, ${report.machine.cpu}, ${report.machine.memoryGb} GB).`,
    report.model ? `Model: \`${report.model.name}\` at ${report.model.baseUrl} (coordinates: ${report.model.coords}).` : `Model: none configured, so only the accessibility strategy ran.`,
    `Runs per task and strategy: ${report.runsPerTask}. Times are medians over successful runs.`,
    ``,
    `| Task | Strategy | Success | Median task time | Median step time | Tokens per task (in / out) |`,
    `| --- | --- | --- | --- | --- | --- |`,
  ];
  for (const row of report.summary) {
    const tokens = row.medianInputTokens === null ? "no model" : `${Math.round(row.medianInputTokens)} / ${Math.round(row.medianOutputTokens ?? 0)}`;
    lines.push(`| ${row.task} | ${row.strategy} | ${row.successes}/${row.runs} | ${ms(row.medianTaskMs)} | ${ms(row.medianStepMs)} | ${tokens} |`);
  }
  if (report.skipped.length) {
    lines.push("", ...report.skipped.map((entry) => `Skipped \`${entry.id}\`: ${entry.reason}`));
  }
  return `${lines.join("\n")}\n`;
}

export function machineInfo(): BenchReport["machine"] {
  const cpus = os.cpus();
  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpu: cpus[0]?.model ?? "unknown",
    cpus: cpus.length,
    memoryGb: Math.round(os.totalmem() / 1024 ** 3),
    node: process.version,
  };
}

/**
 * Runs every task under every strategy. Strategies take turns within each round, so a machine
 * that slows down over time affects all of them alike.
 */
export async function runBench(
  adapter: DesktopAdapter,
  strategies: Strategy[],
  tasks: Task[],
  options: { runs: number; onResult?: (result: TaskResult) => void },
): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  for (let run = 1; run <= options.runs; run += 1) {
    for (const task of tasks) {
      for (const strategy of strategies) {
        const result = await runTask(adapter, strategy, task, run);
        results.push(result);
        options.onResult?.(result);
      }
    }
  }
  return results;
}
