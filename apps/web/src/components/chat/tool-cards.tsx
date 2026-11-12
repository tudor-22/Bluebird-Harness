"use client";

import type { ToolDecision, ToolRecord } from "@bluebird/shared";
import { useEffect, useRef, useState } from "react";

import { decideTool, undoMessage } from "./agent-client";
import styles from "./tool-cards.module.css";

const PAST: Record<string, string> = {
  Read: "Read",
  List: "Listed",
  Find: "Searched for",
  Search: "Searched for",
  Edit: "Edited",
  Create: "Created",
  Replace: "Replaced",
  Run: "Ran",
};

/** "Edited README.md" once done, "Edit README.md" while it is still to happen. */
function rowLabel(tool: ToolRecord): { verb: string; target: string } {
  const [first, ...rest] = tool.summary.split(" ");
  const done = tool.status === "done";
  return { verb: done ? (PAST[first] ?? first) : first, target: rest.join(" ") };
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** One line for the whole trail, such as "Edited 2 files, ran a command". */
export function trailSummary(tools: ToolRecord[]): string {
  tools = tools.filter((tool) => tool.name !== "plan_update");
  const count = (names: string[]) => tools.filter((t) => names.includes(t.name) && t.status !== "rejected").length;
  const edits = count(["write_file", "edit_file"]);
  const runs = count(["run_command"]);
  const reads = count(["read_file"]);
  const looks = count(["list_dir", "find_files", "grep"]);
  const parts: string[] = [];
  if (edits) parts.push(`edited ${edits} ${plural(edits, "file", "files")}`);
  if (runs) parts.push(runs === 1 ? "ran a command" : `ran ${runs} commands`);
  if (reads) parts.push(`read ${reads} ${plural(reads, "file", "files")}`);
  if (looks) parts.push(looks === 1 ? "looked around" : `looked around ${looks} times`);
  if (parts.length === 0) return "Worked";
  const text = parts.join(", ");
  return text[0].toUpperCase() + text.slice(1);
}

function Diff({ text }: { text: string }) {
  return (
    <pre className={styles.diff} tabIndex={0}>
      {text.split("\n").map((line, index) => (
        <span
          key={index}
          data-kind={line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : line.startsWith("@@") ? "hunk" : "ctx"}
        >
          {line}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

function Details({ tool }: { tool: ToolRecord }) {
  return (
    <div className={styles.body}>
      {tool.preview ? (
        tool.kind === "exec" ? <pre className={styles.command}>$ {tool.preview}</pre> : <Diff text={tool.preview} />
      ) : null}
      {tool.output && tool.kind !== "write" ? <pre className={styles.output}>{tool.output}</pre> : null}
      {tool.output && tool.kind === "write" && tool.status !== "done" ? <p className={styles.note}>{tool.output}</p> : null}
    </div>
  );
}

function Row({ tool }: { tool: ToolRecord }) {
  const [open, setOpen] = useState(false);
  const { verb, target } = rowLabel(tool);
  const hasDetails = Boolean(tool.preview || tool.output);
  return (
    <li className={styles.row} data-status={tool.status}>
      <button
        type="button"
        className={styles.rowHead}
        aria-expanded={hasDetails ? open : undefined}
        disabled={!hasDetails}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.verb}>{verb}</span>
        <span className={styles.target}>{target}</span>
        {tool.status === "error" || tool.status === "denied" || tool.status === "rejected" ? (
          <span className={styles.flag}>{tool.status === "rejected" ? "declined" : "failed"}</span>
        ) : null}
        {hasDetails ? (
          <svg className={styles.chev} viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
            <path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </button>
      {open ? <Details tool={tool} /> : null}
    </li>
  );
}

/** The steps taken, one quiet row each, shown inside the thinking toggle. */
export function ToolTrail({ tools }: { tools: ToolRecord[] }) {
  const shown = tools.filter((tool) => tool.status !== "awaiting-approval" && tool.name !== "plan_update");
  if (shown.length === 0) return null;
  return (
    <ul className={styles.trail} aria-label="Steps taken">
      {shown.map((tool) => (
        <Row key={tool.id} tool={tool} />
      ))}
    </ul>
  );
}

function Approval({ tool }: { tool: ToolRecord }) {
  const [answered, setAnswered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  async function answer(decision: ToolDecision) {
    setAnswered(true);
    if (!(await decideTool(tool.id, decision))) setAnswered(false);
  }
  return (
    <div ref={ref} className={styles.approval} role="group" aria-label={`Approve: ${tool.summary}`}>
      <p className={styles.approvalTitle}>{tool.summary}</p>
      <Details tool={tool} />
      <div className={styles.actions}>
        <button type="button" className={styles.allow} disabled={answered} onClick={() => void answer("once")}>
          Allow once
        </button>
        <button type="button" className={styles.ghost} disabled={answered} onClick={() => void answer("always")}>
          Always allow this
        </button>
        <button type="button" className={styles.ghost} disabled={answered} onClick={() => void answer("reject")}>
          Decline
        </button>
      </div>
    </div>
  );
}

/** What always stays in view: calls waiting for an answer, and the undo for a finished reply. */
export function ToolActions({
  messageId,
  tools,
  undone,
  streaming,
  onUndone,
}: {
  messageId: string;
  tools: ToolRecord[];
  undone: boolean;
  streaming: boolean;
  onUndone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const waiting = tools.filter((tool) => tool.status === "awaiting-approval");
  const changed = tools.some((tool) => tool.kind === "write" && tool.status === "done");

  async function undo() {
    setBusy(true);
    const restored = await undoMessage(messageId);
    setBusy(false);
    if (restored === null) setNote("Could not undo the changes.");
    else {
      setNote(null);
      onUndone();
    }
  }

  if (waiting.length === 0 && !(changed && !streaming)) return null;
  return (
    <div className={styles.stack}>
      {waiting.map((tool) => (
        <Approval key={tool.id} tool={tool} />
      ))}
      {changed && !streaming ? (
        <div className={styles.undoRow}>
          {undone ? (
            <span className={styles.note}>Changes undone.</span>
          ) : (
            <button type="button" className={styles.ghost} disabled={busy} onClick={() => void undo()}>
              Undo changes
            </button>
          )}
          {note ? <span className={styles.error}>{note}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
