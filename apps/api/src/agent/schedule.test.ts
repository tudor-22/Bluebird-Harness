import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCheckpoint } from "./checkpoints";
import { createScheduleStore, createScheduler, nextRun, scheduleTools, type ScheduledTask } from "./schedule";
import { authorize } from "./policy";
import { prepare, type ToolContext } from "./tools";
import { createPaths } from "./workspace";

const at = (iso: string) => new Date(iso);
const local = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : null);

describe("when a schedule fires", () => {
  const from = new Date(2026, 10, 9, 10, 20, 30); // Monday 9 Nov 2026, 10:20:30 local

  it("understands phrases", () => {
    expect(local(nextRun("every 30m", from))).toBe("2026-11-09 10:50");
    expect(local(nextRun("every 2 hours", from))).toBe("2026-11-09 12:20");
    expect(local(nextRun("hourly", from))).toBe("2026-11-09 11:00");
    expect(local(nextRun("daily 08:30", from))).toBe("2026-11-10 08:30");
    expect(local(nextRun("daily 11:45", from))).toBe("2026-11-09 11:45");
    expect(local(nextRun("weekdays 09:00", new Date(2026, 10, 13, 9, 30)))).toBe("2026-11-16 09:00");
    expect(local(nextRun("weekly mon 07:00", from))).toBe("2026-11-16 07:00");
  });

  it("understands cron lines, lists, ranges and steps", () => {
    expect(local(nextRun("*/15 * * * *", from))).toBe("2026-11-09 10:30");
    expect(local(nextRun("0 9 * * 1-5", from))).toBe("2026-11-10 09:00");
    expect(local(nextRun("30 8,17 * * *", from))).toBe("2026-11-09 17:30");
    expect(local(nextRun("0 0 1 1 *", from))).toBe("2027-01-01 00:00");
    expect(local(nextRun("0 12 29 2 *", from))).toBe("2028-02-29 12:00");
    // Either the day of the month or the weekday, as cron does.
    expect(local(nextRun("0 6 13 * 5", from))).toBe("2026-11-13 06:00");
  });

  it("refuses what it cannot read", () => {
    for (const bad of ["", "whenever", "every 0m", "every 10s", "61 * * * *", "* * * *", "0 25 * * *", "*/0 * * * *", "0 0 31 2 *"]) {
      expect(nextRun(bad, from), bad).toBeNull();
    }
  });
});

async function setup() {
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  const dir = await mkdtemp(join(process.cwd(), ".data", "agent-sched-"));
  return { dir, store: createScheduleStore(join(dir, "schedules.json")) };
}

describe("the schedule store and scheduler", () => {
  it("keeps tasks across restarts and runs only what is due", async () => {
    const { dir, store } = await setup();
    const now = new Date(2026, 10, 9, 10, 0, 0);
    const due = await store.add({ userId: "u1", name: "Morning", prompt: "Say hi", schedule: "every 30m" }, new Date(now.getTime() - 31 * 60_000));
    await store.add({ userId: "u1", name: "Later", prompt: "Not yet", schedule: "daily 23:00" }, now);
    await store.add({ userId: "u2", name: "Other person", prompt: "x", schedule: "every 5m" }, new Date(now.getTime() - 6 * 60_000));
    const reopened = createScheduleStore(join(dir, "schedules.json"));
    expect((await reopened.list("u1")).map((t) => t.name)).toEqual(["Morning", "Later"]);

    const ran: string[] = [];
    const scheduler = createScheduler({
      store: reopened,
      run: async (task: ScheduledTask) => {
        ran.push(task.name);
        return { status: "complete", text: `did ${task.name}` };
      },
    });
    expect(await scheduler.tick(now)).toBe(2);
    expect(ran.sort()).toEqual(["Morning", "Other person"]);
    const after = await reopened.get(due.id);
    expect(after).toMatchObject({ lastStatus: "complete", lastResult: "did Morning" });
    expect(after!.nextRunAt!).toBeGreaterThan(Date.now() - 1000);
    // Nothing is due straight after.
    expect(await scheduler.tick(now)).toBe(0);
  });

  it("skips a run that was missed by a long time, and survives a task that throws", async () => {
    const { store } = await setup();
    const now = new Date(2026, 10, 9, 10, 0, 0);
    const old = await store.add({ userId: "u", name: "Stale", prompt: "x", schedule: "hourly" }, new Date(now.getTime() - 5 * 3_600_000));
    const bad = await store.add({ userId: "u", name: "Broken", prompt: "x", schedule: "every 10m" }, new Date(now.getTime() - 11 * 60_000));
    const scheduler = createScheduler({
      store,
      run: async (task) => {
        if (task.name === "Broken") throw new Error("model is down");
        return { status: "complete", text: "ok" };
      },
    });
    expect(await scheduler.tick(now)).toBe(1);
    expect((await store.get(old.id))!.lastRunAt).toBeUndefined();
    expect((await store.get(old.id))!.nextRunAt!).toBeGreaterThan(now.getTime());
    expect(await store.get(bad.id)).toMatchObject({ lastStatus: "failed", lastResult: "model is down" });
    expect(await scheduler.runNow(bad.id)).toBe(true);
    expect(await scheduler.runNow("missing")).toBe(false);
  });

  it("lets the model schedule a job, but only after a yes", async () => {
    const { dir, store } = await setup();
    const ctx: ToolContext = {
      jail: createPaths(dir),
      settings: { level: "auto" },
      reads: new Map(),
      checkpoint: createCheckpoint(join(dir, "cp")),
      extra: scheduleTools(store, "u1"),
    };
    const call = await prepare("schedule_task", { name: "News", prompt: "Summarise the news", schedule: "daily 08:00" }, ctx);
    expect(call.preview).toContain("Summarise the news");
    // Even in Auto, a job that keeps running by itself asks first.
    expect(authorize(call, "auto", new Set(), dir).action).toBe("ask");
    expect(authorize(call, "full", new Set(), dir).action).toBe("allow");
    expect(await call.run()).toContain("Scheduled “News”");
    expect(await (await prepare("schedule_list", {}, ctx)).run()).toContain("News");
    await expect(prepare("schedule_task", { name: "x", prompt: "y", schedule: "sometimes" }, ctx)).rejects.toThrow(/not valid/);
    const [task] = await store.list("u1");
    expect(await (await prepare("schedule_delete", { id: task.id.slice(0, 8) }, ctx)).run()).toContain("Deleted");
    expect(await store.list("u1")).toEqual([]);
    void at;
  });
});
