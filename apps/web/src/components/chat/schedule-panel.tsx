"use client";

import type { ScheduledTaskInfo } from "@bluebird/shared";
import { useCallback, useEffect, useState } from "react";

import styles from "./automation.module.css";
import { createSchedule, deleteSchedule, listSchedules, runSchedule, updateSchedule } from "./automation-client";
import card from "./memory-panel.module.css";

const PRESETS = [
  { label: "Every 30 minutes", value: "every 30m" },
  { label: "Every hour", value: "hourly" },
  { label: "Every day at 08:30", value: "daily 08:30" },
  { label: "Weekdays at 09:00", value: "weekdays 09:00" },
  { label: "Every Monday at 07:00", value: "weekly mon 07:00" },
];

const when = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";

/** Scheduled tasks: jobs Bluebird does by itself, with the result in the thread and any connected chat app. */
export function SchedulePanel() {
  const [tasks, setTasks] = useState<ScheduledTaskInfo[] | null>(null);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [schedule, setSchedule] = useState("daily 08:30");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const result = await listSchedules();
    if (result.ok) setTasks(result.data.tasks);
  }, []);
  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  const apply = async (action: ReturnType<typeof listSchedules>) => {
    setBusy(true);
    const result = await action;
    setBusy(false);
    if (result.ok) {
      setError(null);
      setTasks(result.data.tasks);
    } else setError(result.error);
    return result.ok;
  };

  return (
    <div className={card.settingsScroll}>
      <section className={card.group} aria-label="Scheduled tasks">
        {tasks === null ? (
          <p className={styles.note}>Loading…</p>
        ) : tasks.length === 0 ? (
          <div className={styles.item}>
            <span className={styles.meta}>Nothing scheduled yet. Add one below, or ask Bluebird to schedule something in the chat.</span>
          </div>
        ) : (
          tasks.map((task) => (
            <div className={styles.item} key={task.id}>
              <div className={styles.itemHead}>
                <div className={styles.itemTitle}>
                  <strong>{task.name}</strong>
                  <small>
                    {task.schedule} · next {task.enabled ? when(task.nextRunAt) : "paused"} · last {when(task.lastRunAt)}
                    {task.lastStatus ? ` (${task.lastStatus})` : ""}
                  </small>
                </div>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={task.enabled}
                    disabled={busy}
                    aria-label={`${task.name} on`}
                    onChange={(event) => void apply(updateSchedule(task.id, { enabled: event.target.checked }))}
                  />
                  On
                </label>
              </div>
              <p className={styles.meta}>{task.prompt}</p>
              {task.lastResult ? <pre className={styles.result}>{task.lastResult}</pre> : null}
              <div className={styles.actions}>
                <button type="button" className={styles.ghost} disabled={busy} onClick={() => void runSchedule(task.id).then(() => setTimeout(() => void refresh(), 4000))}>
                  Run now
                </button>
                <button type="button" className={styles.danger} disabled={busy} onClick={() => void apply(deleteSchedule(task.id))}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <section className={card.group} aria-label="New scheduled task">
        <form
          className={styles.stack}
          onSubmit={(event) => {
            event.preventDefault();
            void apply(createSchedule({ name, prompt, schedule })).then((ok) => {
              if (ok) {
                setName("");
                setPrompt("");
              }
            });
          }}
        >
          <label>
            Name
            <input className={styles.input} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Morning summary" />
          </label>
          <label>
            What should it do each time?
            <textarea
              className={styles.area}
              value={prompt}
              maxLength={4000}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Check my project for failing tests and tell me what broke."
            />
          </label>
          <label>
            When
            <input className={styles.input} list="schedule-presets" value={schedule} onChange={(event) => setSchedule(event.target.value)} placeholder="daily 08:30" />
            <datalist id="schedule-presets">
              {PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </datalist>
          </label>
          <div className={styles.actions}>
            <button type="submit" className={styles.solid} disabled={busy || !name.trim() || !prompt.trim() || !schedule.trim()}>
              Add task
            </button>
          </div>
        </form>
      </section>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <p className={styles.note}>
        Use a phrase such as &ldquo;every 2h&rdquo;, &ldquo;daily 08:30&rdquo;, &ldquo;weekdays 09:00&rdquo;, or a cron line such as
        0 9 * * 1-5. Tasks run while Bluebird is running, using your access level: at Always ask, anything that needs a yes is
        declined because nobody is there to give it; at Auto, everyday actions go ahead. Results appear in the thread and in any
        connected chat app.
      </p>
    </div>
  );
}
