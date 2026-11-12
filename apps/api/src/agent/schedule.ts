import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ExtraTool } from "./tools";
import { ToolError } from "./workspace";

export type ScheduledTask = {
  id: string;
  userId: string;
  name: string;
  /** What to do each time, written as an instruction. */
  prompt: string;
  /** A cron line ("0 9 * * 1-5") or a phrase ("every 2h", "daily 08:30"). */
  schedule: string;
  enabled: boolean;
  nextRunAt: number | null;
  lastRunAt?: number;
  lastStatus?: "complete" | "failed" | "interrupted";
  lastResult?: string;
};

// ---------------------------------------------------------------------------
// When a schedule next fires
// ---------------------------------------------------------------------------

function parseField(field: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const [range, stepText] = part.split("/");
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) return null;
    let from = min;
    let to = max;
    if (range !== "*") {
      const [a, b] = range.split("-");
      from = Number(a);
      to = b === undefined ? (stepText === undefined ? from : max) : Number(b);
      if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
    }
    if (from < min || to > max || from > to) return null;
    for (let value = from; value <= to; value += step) out.add(value);
  }
  return out;
}

const DAYS: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** Turns a phrase into a cron line, or null when it is not a phrase we know. */
function fromPhrase(text: string): string | null {
  const t = text.trim().toLowerCase();
  let m: RegExpExecArray | null;
  if (t === "hourly" || t === "@hourly") return "0 * * * *";
  if (t === "daily" || t === "@daily") return "0 9 * * *";
  if ((m = /^(daily|every day)(?: at)? (\d{1,2}):(\d{2})$/.exec(t))) return `${Number(m[3])} ${Number(m[2])} * * *`;
  if ((m = /^weekdays(?: at)? (\d{1,2}):(\d{2})$/.exec(t))) return `${Number(m[2])} ${Number(m[1])} * * 1-5`;
  if ((m = /^(?:weekly|every) (sun|mon|tue|wed|thu|fri|sat)[a-z]*(?: at)? (\d{1,2}):(\d{2})$/.exec(t))) {
    return `${Number(m[3])} ${Number(m[2])} * * ${DAYS[m[1]]}`;
  }
  return null;
}

function everyMs(text: string): number | null {
  const m = /^every (\d+)\s*(m|min|mins|minutes?|h|hrs?|hours?|d|days?)$/.exec(text.trim().toLowerCase());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2][0];
  const ms = n * (unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000);
  return n >= 1 && ms >= 60_000 ? ms : null;
}

/** The first time after `after` that the schedule fires, or null if it is not a valid schedule. */
export function nextRun(schedule: string, after: Date): Date | null {
  const interval = everyMs(schedule);
  if (interval) return new Date(after.getTime() + interval);
  const line = fromPhrase(schedule) ?? schedule.trim();
  const fields = line.split(/\s+/);
  if (fields.length !== 5) return null;
  const minutes = parseField(fields[0], 0, 59);
  const hours = parseField(fields[1], 0, 23);
  const days = parseField(fields[2], 1, 31);
  const months = parseField(fields[3], 1, 12);
  const weekdays = parseField(fields[4], 0, 7);
  if (!minutes || !hours || !days || !months || !weekdays) return null;
  if (weekdays.has(7)) weekdays.add(0);
  const anyDay = fields[2] === "*";
  const anyWeekday = fields[4] === "*";

  const at = new Date(after.getTime());
  at.setSeconds(0, 0);
  at.setMinutes(at.getMinutes() + 1);
  const limit = after.getTime() + 5 * 366 * 86_400_000;
  while (at.getTime() < limit) {
    if (!months.has(at.getMonth() + 1)) {
      at.setMonth(at.getMonth() + 1, 1);
      at.setHours(0, 0, 0, 0);
      continue;
    }
    const dayOk =
      anyDay && anyWeekday
        ? true
        : anyDay
          ? weekdays.has(at.getDay())
          : anyWeekday
            ? days.has(at.getDate())
            : days.has(at.getDate()) || weekdays.has(at.getDay());
    if (!dayOk) {
      at.setDate(at.getDate() + 1);
      at.setHours(0, 0, 0, 0);
      continue;
    }
    if (!hours.has(at.getHours())) {
      at.setHours(at.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!minutes.has(at.getMinutes())) {
      at.setMinutes(at.getMinutes() + 1, 0, 0);
      continue;
    }
    return at;
  }
  return null;
}

export const SCHEDULE_HELP =
  'Use a phrase such as "every 30m", "every 2h", "hourly", "daily 08:30", "weekdays 09:00" or "weekly mon 07:00", or a cron line such as "0 9 * * 1-5".';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export type ScheduleStore = {
  list(userId?: string): Promise<ScheduledTask[]>;
  get(id: string): Promise<ScheduledTask | null>;
  add(input: { userId: string; name: string; prompt: string; schedule: string }, now?: Date): Promise<ScheduledTask>;
  update(id: string, patch: Partial<ScheduledTask>): Promise<ScheduledTask | null>;
  remove(id: string): Promise<boolean>;
};

export function createScheduleStore(file: string): ScheduleStore {
  let queue: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<ScheduledTask[]> => {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"));
      return Array.isArray(parsed) ? (parsed as ScheduledTask[]) : [];
    } catch {
      return [];
    }
  };
  const write = async (tasks: ScheduledTask[]) => {
    await mkdir(dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    await writeFile(temp, JSON.stringify(tasks, null, 2), { mode: 0o600 });
    await rename(temp, file);
  };
  // Changes happen one at a time, so two saves never overwrite each other.
  const change = <T>(fn: (tasks: ScheduledTask[]) => Promise<T> | T): Promise<T> => {
    const result = queue.then(async () => {
      const tasks = await read();
      const value = await fn(tasks);
      await write(tasks);
      return value;
    });
    queue = result.catch(() => undefined);
    return result;
  };
  return {
    async list(userId) {
      await queue;
      const tasks = await read();
      return userId ? tasks.filter((task) => task.userId === userId) : tasks;
    },
    async get(id) {
      await queue;
      return (await read()).find((task) => task.id === id) ?? null;
    },
    add(input, now = new Date()) {
      const next = nextRun(input.schedule, now);
      if (!next) return Promise.reject(new ToolError(`That schedule is not valid. ${SCHEDULE_HELP}`));
      return change((tasks) => {
        if (tasks.filter((task) => task.userId === input.userId).length >= 30) {
          throw new ToolError("There are already 30 scheduled tasks. Delete one first.");
        }
        const task: ScheduledTask = { id: randomUUID(), ...input, enabled: true, nextRunAt: next.getTime() };
        tasks.push(task);
        return task;
      });
    },
    update(id, patch) {
      return change((tasks) => {
        const task = tasks.find((item) => item.id === id);
        if (!task) return null;
        Object.assign(task, patch);
        return { ...task };
      });
    },
    remove(id) {
      return change((tasks) => {
        const at = tasks.findIndex((task) => task.id === id);
        if (at === -1) return false;
        tasks.splice(at, 1);
        return true;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Running them
// ---------------------------------------------------------------------------

export type ScheduleRunner = (task: ScheduledTask) => Promise<{ status: "complete" | "failed" | "interrupted"; text: string }>;

export type Scheduler = {
  start(): void;
  stop(): void;
  /** Runs one task now, whatever its schedule says. */
  runNow(id: string): Promise<boolean>;
  /** Looks for due tasks once. Exposed so tests can drive the clock. */
  tick(now?: Date): Promise<number>;
};

/** A task that was due while the app was off is run once on startup only if it is this recent. */
const CATCH_UP_MS = 60 * 60_000;

export function createScheduler(options: {
  store: ScheduleStore;
  run: ScheduleRunner;
  intervalMs?: number;
}): Scheduler {
  const running = new Set<string>();
  let timer: NodeJS.Timeout | null = null;

  async function execute(task: ScheduledTask, now: Date) {
    if (running.has(task.id)) return;
    running.add(task.id);
    try {
      const result = await options.run(task).catch((error: Error) => ({ status: "failed" as const, text: error.message }));
      const next = nextRun(task.schedule, new Date());
      await options.store.update(task.id, {
        lastRunAt: now.getTime(),
        lastStatus: result.status,
        lastResult: result.text.slice(0, 2000),
        nextRunAt: next ? next.getTime() : null,
        enabled: next ? task.enabled : false,
      });
    } finally {
      running.delete(task.id);
    }
  }

  const scheduler: Scheduler = {
    async tick(now = new Date()) {
      let started = 0;
      for (const task of await options.store.list()) {
        if (!task.enabled || task.nextRunAt === null || task.nextRunAt > now.getTime()) continue;
        if (now.getTime() - task.nextRunAt > CATCH_UP_MS) {
          // Missed by a long way: skip to the next time instead of running late.
          const next = nextRun(task.schedule, now);
          await options.store.update(task.id, { nextRunAt: next ? next.getTime() : null });
          continue;
        }
        started++;
        await execute(task, now);
      }
      return started;
    },
    async runNow(id) {
      const task = await options.store.get(id);
      if (!task) return false;
      await execute(task, new Date());
      return true;
    },
    start() {
      if (timer) return;
      timer = setInterval(() => void scheduler.tick().catch(() => undefined), options.intervalMs ?? 20_000);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
  return scheduler;
}

// ---------------------------------------------------------------------------
// Tools the model uses to manage schedules
// ---------------------------------------------------------------------------

export function scheduleTools(store: ScheduleStore, userId: string): ExtraTool[] {
  const object = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });
  const text = (value: unknown, label: string, max: number) => {
    if (typeof value !== "string" || !value.trim()) throw new ToolError(`"${label}" is required.`);
    return value.trim().slice(0, max);
  };
  return [
    {
      kind: "write",
      spec: {
        name: "schedule_task",
        description: `Schedule a job to run by itself on a timetable, with its result delivered to the thread and any connected chat app. The prompt is what you will be told to do each time, so write it as a complete instruction. ${SCHEDULE_HELP}`,
        parameters: object(
          {
            name: { type: "string", description: "A short name." },
            prompt: { type: "string", description: "The instruction to carry out each time." },
            schedule: { type: "string", description: "When to run." },
          },
          ["name", "prompt", "schedule"],
        ),
      },
      prepare(args) {
        const name = text(args.name, "name", 80);
        const prompt = text(args.prompt, "prompt", 4000);
        const schedule = text(args.schedule, "schedule", 60);
        const first = nextRun(schedule, new Date());
        if (!first) throw new ToolError(`That schedule is not valid. ${SCHEDULE_HELP}`);
        return {
          name: "schedule_task",
          kind: "write",
          summary: `Schedule “${name}” (${schedule})`,
          preview: `${schedule}\nFirst run: ${first.toLocaleString("en-GB")}\n\n${prompt}`,
          scope: "schedule",
          // A job that keeps running by itself always gets a yes first.
          autoSafe: false,
          async run() {
            const task = await store.add({ userId, name, prompt, schedule });
            return `Scheduled “${name}” (id ${task.id.slice(0, 8)}). Next run: ${new Date(task.nextRunAt ?? 0).toLocaleString("en-GB")}.`;
          },
        };
      },
    },
    {
      kind: "read",
      spec: { name: "schedule_list", description: "List the scheduled tasks.", parameters: object({}, []) },
      prepare() {
        return {
          name: "schedule_list",
          kind: "read",
          summary: "List scheduled tasks",
          scope: "read",
          async run() {
            const tasks = await store.list(userId);
            if (tasks.length === 0) return "No scheduled tasks.";
            return tasks
              .map((t) => `${t.id.slice(0, 8)}  ${t.enabled ? "on " : "off"}  ${t.schedule}  ${t.name}${t.lastStatus ? `  (last: ${t.lastStatus})` : ""}`)
              .join("\n");
          },
        };
      },
    },
    {
      kind: "write",
      spec: {
        name: "schedule_delete",
        description: "Delete a scheduled task by the id schedule_list shows.",
        parameters: object({ id: { type: "string" } }, ["id"]),
      },
      prepare(args) {
        const id = text(args.id, "id", 40);
        return {
          name: "schedule_delete",
          kind: "write",
          summary: `Delete scheduled task ${id}`,
          scope: "schedule",
          autoSafe: false,
          async run() {
            const match = (await store.list(userId)).find((t) => t.id === id || t.id.startsWith(id));
            if (!match) throw new ToolError(`No scheduled task "${id}".`);
            await store.remove(match.id);
            return `Deleted “${match.name}”.`;
          },
        };
      },
    },
  ];
}
