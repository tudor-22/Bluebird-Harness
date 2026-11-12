"use client";

import type { SkillSummary } from "@bluebird/shared";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { useApps, iconUrl } from "../../lib/apps";
import { listSkills } from "./automation-client";
import styles from "./composer-menu.module.css";
import type { SettingsTab } from "./memory-panel";

export type MenuItem = {
  id: string;
  label: string;
  /** Quieter text after the name: a description or a folder. */
  hint?: string;
  kind: "skill" | "command" | "file" | "folder" | "app";
  /** A small picture for the row, such as an app's icon. */
  icon?: string;
  /** What goes into the message when picked. Commands that act leave it empty. */
  insert: string;
  /** For commands that open something instead of writing text. */
  run?: () => void;
  /** A command that points Bluebird at a built-in app: it is written as an icon chip, like a picked @app. */
  app?: { id: string; name: string };
};

type FileHit = { path: string; name: string; dir: string; isDir: boolean };
type Trigger = { type: "slash" | "file"; query: string; start: number; end: number };

/** Where in the label each typed letter landed, so the match can be shown in bold. */
export function matchPositions(query: string, label: string): number[] {
  const q = query.toLowerCase();
  const t = label.toLowerCase();
  if (!q) return [];
  const at = t.indexOf(q);
  if (at !== -1) return Array.from({ length: q.length }, (_, i) => at + i);
  const out: number[] = [];
  let from = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, from);
    if (found === -1) return [];
    out.push(found);
    from = found + 1;
  }
  return out;
}

function Highlighted({ query, text }: { query: string; text: string }) {
  const hits = new Set(matchPositions(query, text));
  if (hits.size === 0) return <>{text}</>;
  return (
    <>
      {Array.from(text).map((ch, i) => (hits.has(i) ? <b key={i}>{ch}</b> : ch))}
    </>
  );
}

/** What the text before the caret is asking for: a slash command at the start, or an @file anywhere. */
export function findTrigger(value: string, caret: number): Trigger | null {
  const before = value.slice(0, caret);
  const slash = /^\/([a-z0-9:_-]*)$/i.exec(before);
  if (slash) return { type: "slash", query: slash[1], start: 0, end: caret };
  const file = /(?:^|\s)@([^\s@]*)$/.exec(before);
  if (file) {
    const start = before.length - file[1].length - 1;
    return { type: "file", query: file[1], start, end: caret };
  }
  return null;
}

function scoreText(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  const at = t.indexOf(q);
  if (at !== -1) return 1000 - at;
  let from = 0;
  let score = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, from);
    if (found === -1) return 0;
    score += 2;
    from = found + 1;
  }
  return score;
}

const BUILT_INS = (openSettings: (tab: SettingsTab) => void, onCompact?: () => void): MenuItem[] => [
  { id: "cmd-compact", label: "compact", hint: "Summarize the conversation to free up context", kind: "command", insert: "", run: onCompact },
  { id: "cmd-skills", label: "skills", hint: "Manage your skills", kind: "command", insert: "", run: () => openSettings("skills") },
  { id: "cmd-swarm", label: "swarm", hint: "A team of up to 4 specialised agents working together", kind: "command", insert: "/swarm " },
  { id: "cmd-research", label: "research", hint: "Deep web research in the background (up to 30 tool calls)", kind: "command", insert: "/research " },
  { id: "cmd-marketplace", label: "marketplace", hint: "Install Claude Code and Codex skills", kind: "command", insert: "", run: () => openSettings("skills") },
  { id: "cmd-cron", label: "cron", hint: "Schedule a task with a cron line", kind: "command", insert: "", run: () => openSettings("schedules") },
  { id: "cmd-new-skill", label: "new-skill", hint: "Have Bluebird write a new skill", kind: "command", insert: "Create a skill that " },
  { id: "cmd-browser", label: "browser", hint: "Use Bluebird's own browser", kind: "command", insert: "", icon: iconUrl("bluebird-browser"), app: { id: "bluebird-browser", name: "Browser" } },
  { id: "cmd-desktop", label: "desktop", hint: "Operate apps on this computer", kind: "command", insert: "On this computer, " },
  { id: "cmd-schedule", label: "schedule", hint: "Run something on a schedule", kind: "command", insert: "Schedule a task: ", run: undefined },
  { id: "cmd-schedules", label: "schedules", hint: "Manage scheduled tasks", kind: "command", insert: "", run: () => openSettings("schedules") },
  { id: "cmd-memory", label: "memory", hint: "See what Bluebird remembers", kind: "command", insert: "", run: () => openSettings("memory") },
  { id: "cmd-connections", label: "connections", hint: "Tool servers and chat apps", kind: "command", insert: "", run: () => openSettings("connections") },
  { id: "cmd-engine", label: "engine", hint: "Choose models and engines", kind: "command", insert: "", run: () => openSettings("engine") },
];

/**
 * The pop-up above the message box: `/` lists commands and skills, `@` lists
 * files and folders. It reads the text box on every keystroke, so it works
 * with the existing uncontrolled field.
 */
export function useComposerMenu({
  messageRef,
  openSettings,
  onCompact,
  onPickApp,
  onChange,
}: {
  messageRef: RefObject<HTMLTextAreaElement | null>;
  openSettings: (tab: SettingsTab) => void;
  /** Turns a picked app into what goes in the box; without it the app is written as @Name. */
  onPickApp?: (app: { id: string; name: string }) => string;
  /** Runs the /compact command. */
  onCompact?: () => void;
  /** Called after the menu itself edits the text, so size and send state refresh. */
  onChange: () => void;
}): {
  node: ReactNode;
  /** Call from the field's onInput and onClick/onKeyUp so the menu follows the caret. */
  refresh: () => void;
  /** Call first from onKeyDown. True means the menu used the key. */
  handleKey: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => boolean;
} {
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  // The highlighted row belongs to one list; a new list starts again at the top.
  const [picked, setPicked] = useState({ key: "", at: 0 });
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [files, setFiles] = useState<FileHit[]>([]);
  const allApps = useApps();
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const triggerKey = trigger ? `${trigger.type}:${trigger.start}:${trigger.query}` : null;

  const refresh = useCallback(() => {
    const element = messageRef.current;
    if (!element) return;
    setTrigger(findTrigger(element.value, element.selectionStart ?? element.value.length));
  }, [messageRef]);

  // Skills are fetched when the slash menu first opens.
  const slashOpen = trigger?.type === "slash";
  useEffect(() => {
    if (!slashOpen) return;
    let live = true;
    void listSkills().then((result) => {
      if (live && result.ok) setSkills(result.data.skills);
    });
    return () => {
      live = false;
    };
  }, [slashOpen]);

  // Files are searched as the name is typed.
  const fileQuery = trigger?.type === "file" ? trigger.query : null;
  useEffect(() => {
    if (fileQuery === null) return;
    const id = ++requestRef.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/files/search?q=${encodeURIComponent(fileQuery)}`)
        .then((response) => (response.ok ? response.json() : { files: [] }))
        .then((data: { files?: FileHit[] }) => {
          if (requestRef.current === id) setFiles(data.files ?? []);
        })
        .catch(() => {
          if (requestRef.current === id) setFiles([]);
        })
        .finally(() => {
          if (requestRef.current === id) setLoading(false);
        });
    }, fileQuery ? 90 : 0);
    return () => window.clearTimeout(timer);
  }, [fileQuery]);

  const items = useMemo<MenuItem[]>(() => {
    if (!trigger) return [];
    if (trigger.type === "slash") {
      const all: MenuItem[] = [
        ...skills.map((skill) => ({
          id: `skill-${skill.name}`,
          label: skill.name,
          hint: skill.learned ? `${skill.description || "Learned skill"} · learned` : skill.description || undefined,
          kind: "skill" as const,
          insert: `/${skill.name}`,
        })),
        ...BUILT_INS(openSettings, onCompact).map((item) => ({ ...item, insert: item.insert || "" })),
      ];
      return all
        .map((item) => ({ item, score: scoreText(trigger.query, item.label) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map((entry) => entry.item);
    }
    // Apps come first: pointing Bluebird at an app is what most people reach for with @.
    // They are filtered here, from the list already loaded, so they appear as the first letter is typed.
    const appItems: MenuItem[] = allApps
      .map((entry) => ({ entry, score: scoreText(trigger.query, entry.name) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.name.length - b.entry.name.length)
      .slice(0, trigger.query ? 6 : 4)
      .map(({ entry }) => ({
        id: `app-${entry.id}`,
        label: entry.name,
        kind: "app" as const,
        icon: iconUrl(entry.id),
        insert: /\s/.test(entry.name) ? `@"${entry.name}"` : `@${entry.name}`,
      }));
    const fileItems = files.map((file) => ({
      id: `file-${file.path}`,
      label: file.name,
      hint: file.dir === "." ? undefined : file.dir,
      kind: file.isDir ? ("folder" as const) : ("file" as const),
      insert: /\s/.test(file.path) ? `@"${file.path}"` : `@${file.path}`,
    }));
    return [...appItems, ...fileItems];
  }, [trigger, skills, files, allApps, openSettings, onCompact]);

  const open = Boolean(trigger) && dismissed !== triggerKey && (items.length > 0 || loading);

  const listKey = `${triggerKey}:${items.length}`;
  const index = picked.key === listKey ? picked.at : 0;
  const setIndex = useCallback(
    (next: number | ((current: number) => number)) =>
      setPicked((current) => {
        const at = current.key === listKey ? current.at : 0;
        return { key: listKey, at: typeof next === "function" ? next(at) : next };
      }),
    [listKey],
  );

  const pick = useCallback(
    (item: MenuItem) => {
      const element = messageRef.current;
      if (!element || !trigger) return;
      const value = element.value;
      const before = value.slice(0, trigger.start);
      const after = value.slice(trigger.end);
      // A command that opens something leaves no text behind.
      const insert =
        item.app && onPickApp
          ? onPickApp(item.app)
          : item.kind === "app" && onPickApp && item.id.startsWith("app-")
            ? onPickApp({ id: item.id.slice(4), name: item.label })
            : item.insert;
      const text = insert ? `${insert}${item.kind === "command" && !item.app && insert.endsWith(" ") ? "" : " "}` : "";
      element.value = `${before}${text}${after}`;
      const caret = before.length + text.length;
      element.setSelectionRange(caret, caret);
      element.focus();
      setTrigger(null);
      onChange();
      item.run?.();
    },
    [messageRef, trigger, onChange, onPickApp],
  );

  const handleKey = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (!open || event.nativeEvent.isComposing) return false;
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissed(triggerKey);
        return true;
      }
      if (items.length === 0) return false;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setIndex((current) => (current + step + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        if (event.key === "Enter" && event.shiftKey) return false;
        event.preventDefault();
        pick(items[Math.min(index, items.length - 1)]);
        return true;
      }
      return false;
    },
    [open, items, index, pick, triggerKey],
  );

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index, open]);

  const node = open ? (
    <div className={styles.menu} role="listbox" aria-label={trigger?.type === "slash" ? "Commands and skills" : "Files"} ref={listRef}>
      {items.length === 0 ? (
        <p className={styles.empty}>Searching…</p>
      ) : (
        items.map((item, i) => (
          <button
            type="button"
            role="option"
            aria-selected={i === index}
            key={item.id}
            className={styles.item}
            data-active={i === index}
            // Keep the caret in the field: picking must not blur it.
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setIndex(i)}
            onClick={() => pick(item)}
          >
            {item.icon ? (
              // eslint-disable-next-line @next/next/no-img-element -- a small local icon
              <img className={styles.icon} src={item.icon} alt="" width={20} height={20} loading="lazy" />
            ) : null}
            <span className={styles.label}>
              <Highlighted query={trigger?.query ?? ""} text={item.label} />
            </span>
            {item.hint ? <span className={styles.hint}>{item.hint}</span> : null}
            <span className={styles.kind}>
              {item.kind === "skill" ? "skill" : item.kind === "folder" ? "folder" : item.kind === "app" ? "app" : ""}
            </span>
          </button>
        ))
      )}
    </div>
  ) : null;

  return { node, refresh, handleKey };
}
