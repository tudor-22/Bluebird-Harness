"use client";

import type { Memory, MemoryType, ReasoningEffort } from "@bluebird/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { EnginePanel } from "./engine-panel";
import { AgentPanel } from "./agent-panel";
import { ConnectionsPanel } from "./connections-panel";
import { SchedulePanel } from "./schedule-panel";
import { SkillsPanel } from "./skills-panel";
import { ProfilePanel, type Profile } from "./profile-panel";
import styles from "./memory-panel.module.css";
import type { ThemeMode } from "../../lib/theme";

const MEMORY_TYPES: MemoryType[] = [
  "preference",
  "fact",
  "project",
  "goal",
  "relationship",
  "event",
  "habit",
  "instruction",
  "technical_context",
  "professional_context",
  "temporal",
];

function typeLabel(type: MemoryType): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m12.7 12.7 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const ICON_PATHS: Record<string, string[]> = {
  memory: ["M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z"],
  history: ["M12 7.5V12l3 2", "M3.5 12a8.5 8.5 0 1 0 2.6-6.1", "M3.5 4.5v4h4"],
  profile: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4.5 20c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5"],
  account: ["M12 4.5a4 4 0 0 0 0 0", "M5 8.5h14v10H5Z", "M9 8.5V6.5h6v2"],
  accountOld: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4.5 20c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5"],
  appearance: ["M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.8 0-1.6-1.5-1.6-1.5-3 0-1 .8-1.7 1.8-1.7H17a3.5 3.5 0 0 0 3.5-3.5C20.5 6.7 16.7 3.5 12 3.5Z", "M7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01"],
  engine: ["M8 8h8v8H8Z", "M10 3.5V8M14 3.5V8M10 16v4.5M14 16v4.5M3.5 10H8M3.5 14H8M16 10h4.5M16 14h4.5"],
  workspace: ["M3.5 7.5A2 2 0 0 1 5.500 5.500H9l2 2.500h7.500a2 2 0 0 1 2 2V17.500a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"],
  schedules: ["M12 7.5V12l3 2", "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z"],
  skills: ["M5 5.5h10a2 2 0 0 1 2 2V19H7a2 2 0 0 1-2-2Z", "M9 9.5h5M9 13h5"],
  connections: ["M9.500 14.500 14.500 9.500", "M10.500 6.500l1-1a3.500 3.500 0 0 1 5 5l-1 1", "M13.500 17.500l-1 1a3.500 3.500 0 0 1-5-5l1-1"],
  data: ["M12 3.500 5 6v5.500c0 4.200 2.800 7.500 7 9 4.200-1.500 7-4.800 7-9V6Z", "M9.500 12l2 2 3.500-4"],
};

function RowIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(ICON_PATHS[name] ?? []).map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path d="m6 3.500 4.500 4.500L6 12.500" stroke="currentColor" strokeWidth="1.800" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 10H4.5M8.5 5.5 4 10l4.5 4.5" />
    </svg>
  );
}

export type SettingsTab =
  | "menu"
  | "profile"
  | "memory"
  | "history"
  | "account"
  | "appearance"
  | "engine"
  | "workspace"
  | "schedules"
  | "skills"
  | "connections"
  | "data";

export type SettingsUser = {
  name: string | null;
  email: string;
  image: string | null;
};

export function MemoryPanel({
  open,
  onClose,
  user,
  onDeleteThread,
  canDeleteThread = true,
  initialTab = "account",
  reasoningEffort = "medium",
  onReasoningEffortChange = () => undefined,
  themeMode = "auto",
  onThemeModeChange = () => undefined,
  showThinking = false,
  onShowThinkingChange = () => undefined,
  interactiveUi = false,
  onInteractiveUiChange = () => undefined,
  onProfileChange = () => undefined,
}: {
  open: boolean;
  onClose: () => void;
  user: SettingsUser;
  onDeleteThread: () => void;
  canDeleteThread?: boolean;
  initialTab?: SettingsTab;
  reasoningEffort?: ReasoningEffort;
  onReasoningEffortChange?: (effort: ReasoningEffort) => void;
  themeMode?: ThemeMode;
  onThemeModeChange?: (mode: ThemeMode) => void;
  showThinking?: boolean;
  onShowThinkingChange?: (value: boolean) => void;
  interactiveUi?: boolean;
  onInteractiveUiChange?: (value: boolean) => void;
  /** The name or photo was changed. */
  onProfileChange?: (profile: Profile) => void;
}) {
  const [items, setItems] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [draftType, setDraftType] = useState<MemoryType>("fact");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [savingReasoning, setSavingReasoning] = useState(false);
  const [reasoningError, setReasoningError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/memory?includeInvalidated=1", { cache: "no-store" });
      if (!response.ok) throw new Error("Memory could not be loaded.");
      const payload = (await response.json()) as { items: Memory[] };
      setItems(payload.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Memory could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => void load());
    queueMicrotask(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [load, open]);

  const startEditing = (memory: Memory) => {
    setEditingId(memory.id);
    setDraftContent(memory.content);
    setDraftType(memory.type);
    setError(null);
  };

  const save = async (id: string) => {
    const content = draftContent.trim();
    if (!content || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/memory/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, type: draftType }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (Memory & { error?: string })
        | null;
      if (!response.ok || !payload || payload.error) {
        throw new Error(payload?.error ?? "Memory could not be updated.");
      }
      setItems((current) =>
        current.map((memory) => (memory.id === id ? (payload as Memory) : memory)),
      );
      setEditingId(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Memory could not be updated.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (memory: Memory) => {
    if (deletingId) return;
    setDeletingId(memory.id);
    setError(null);
    try {
      const response = await fetch(`/api/memory/${encodeURIComponent(memory.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Memory could not be deleted.");
      setItems((current) => current.filter((item) => item.id !== memory.id));
      setConfirmDeleteId(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Memory could not be deleted.");
    } finally {
      setDeletingId(null);
    }
  };

  const saveReasoningEffort = async (effort: ReasoningEffort) => {
    if (effort === reasoningEffort || savingReasoning) return;
    setSavingReasoning(true);
    setReasoningError(null);
    try {
      const response = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reasoningEffort: effort }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { user?: { reasoningEffort?: ReasoningEffort }; error?: string }
        | null;
      if (!response.ok || payload?.user?.reasoningEffort !== effort) {
        throw new Error(payload?.error ?? "Reasoning effort could not be updated.");
      }
      onReasoningEffortChange(effort);
    } catch (saveError) {
      setReasoningError(
        saveError instanceof Error ? saveError.message : "Reasoning effort could not be updated.",
      );
    } finally {
      setSavingReasoning(false);
    }
  };

  if (!open) return null;
  const activeCount = items.filter((memory) => memory.status === "active").length;
  const historyCount = items.filter((memory) => memory.status === "invalidated").length;
  const needle = query.trim().toLocaleLowerCase("en-GB");
  const visible =
    activeTab === "memory" || activeTab === "history"
      ? items
          .filter((memory) =>
            memory.status === (activeTab === "memory" ? "active" : "invalidated"),
          )
          .filter(
            (memory) =>
              !needle ||
              memory.content.toLocaleLowerCase("en-GB").includes(needle) ||
              memory.type.toLocaleLowerCase("en-GB").includes(needle),
          )
      : [];
  const tabTitle =
    activeTab === "menu"
      ? "Settings"
      : activeTab === "profile"
      ? "Profile"
      : activeTab === "memory"
      ? "Memory"
      : activeTab === "history"
        ? "Past memories"
        : activeTab === "account"
          ? "Account"
          : activeTab === "appearance"
            ? "Appearance"
            : activeTab === "engine"
              ? "Engine"
              : activeTab === "workspace"
                  ? "Workspace"
                  : activeTab === "schedules"
                    ? "Scheduled tasks"
                    : activeTab === "skills"
                      ? "Skills"
                      : activeTab === "connections"
                        ? "Connections"
                  : "Data controls";

  return (
    <div
      className={styles.layer}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className={styles.panel} ref={panelRef}>
        {activeTab === "menu" ? (
          <div className={styles.sheet}>
            <header className={styles.menuHead}>
              <button
                type="button"
                className={styles.menuWhoButton}
                aria-label="Edit profile"
                onClick={() => setActiveTab("profile")}
              >
                <span className={styles.menuAvatar} aria-hidden="true">
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.image} alt="" />
                  ) : (
                    (user.name ?? user.email).trim().charAt(0).toUpperCase() || "B"
                  )}
                </span>
                <span className={styles.menuWho}>
                  <h2>{user.name ?? "Bluebird"}</h2>
                  <p>{user.email}</p>
                </span>
              </button>
              <button
                type="button"
                className={styles.roundButton}
                ref={closeRef}
                aria-label="Close settings"
                onClick={onClose}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                  <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </header>
            {(
              [
                [
                  { tab: "memory", label: "Memory", note: String(activeCount) },
                  { tab: "history", label: "Past memories", note: String(historyCount), off: historyCount === 0 },
                ],
                [
                  { tab: "profile", label: "Profile" },
                  { tab: "account", label: "Account" },
                  { tab: "appearance", label: "Appearance" },
                  { tab: "engine", label: "Engine" },
                  { tab: "workspace", label: "Workspace" },
                  { tab: "schedules", label: "Scheduled tasks" },
                  { tab: "skills", label: "Skills" },
                  { tab: "connections", label: "Connections" },
                ],
                [{ tab: "data", label: "Data controls" }],
              ] as { tab: SettingsTab; label: string; note?: string; off?: boolean }[][]
            ).map((group, index) => (
              <div className={styles.glass} key={index}>
                {group.map((item) => (
                  <button
                    key={item.tab}
                    type="button"
                    className={styles.menuRow}
                    disabled={item.off}
                    onClick={() => setActiveTab(item.tab)}
                  >
                    <RowIcon name={item.tab} />
                    <span className={styles.menuLabel}>{item.label}</span>
                    {item.note ? <small>{item.note}</small> : null}
                    <ChevronRight />
                  </button>
                ))}
              </div>
            ))}
            <button type="button" className={styles.exitRow} onClick={onClose}>
              <BackIcon />
              <span>Back to app</span>
            </button>
          </div>
        ) : (
        <section
          className={styles.contentPane}
          id="settings-panel"
          role="region"
          aria-label={tabTitle}
        >
          <header className={styles.pageHead}>
            <button
              type="button"
              className={styles.roundButton}
              ref={closeRef}
              aria-label="Back to settings"
              onClick={() => setActiveTab("menu")}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                <path d="m10 3.500-4.500 4.500L10 12.500" stroke="currentColor" strokeWidth="1.800" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <h2>{tabTitle}</h2>
          </header>
          {activeTab === "memory" || activeTab === "history" ? (
            <label className={styles.search}>
              <SearchIcon />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search memory"
                aria-label="Search memory"
              />
            </label>
          ) : null}

          {activeTab === "profile" ? (
            <ProfilePanel
              profile={{ name: user.name, image: user.image }}
              email={user.email}
              onChange={onProfileChange}
            />
          ) : activeTab === "memory" || activeTab === "history" ? (
            <>
              {error ? <p className={styles.error} role="alert">{error}</p> : null}
              {loading && items.length === 0 ? (
                <p className={styles.state}>Loading memory…</p>
              ) : null}
              {!loading && visible.length === 0 ? (
                <p className={styles.state}>
                  {needle
                    ? "No memories match that search."
                    : activeTab === "memory"
                      ? "Nothing remembered yet."
                      : "No past memories yet."}
                </p>
              ) : null}

              <div className={styles.list}>
                {visible.map((memory) => {
            const editing = editingId === memory.id;
            return (
              <article
                key={memory.id}
                className={styles.item}
                data-status={memory.status}
              >
                <div className={styles.itemHead}>
                  <span className={styles.type}>{typeLabel(memory.type)}</span>
                  {memory.status === "invalidated" ? (
                    <span className={styles.invalidated}>Previous</span>
                  ) : null}
                </div>

                {editing ? (
                  <div className={styles.editForm}>
                    <textarea
                      value={draftContent}
                      rows={4}
                      maxLength={800}
                      aria-label="Memory content"
                      onChange={(event) => setDraftContent(event.target.value)}
                    />
                    <select
                      value={draftType}
                      aria-label="Memory type"
                      onChange={(event) => setDraftType(event.target.value as MemoryType)}
                    >
                      {MEMORY_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {typeLabel(type)}
                        </option>
                      ))}
                    </select>
                    <div className={styles.editActions}>
                      <button type="button" onClick={() => setEditingId(null)} disabled={saving}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.save}
                        onClick={() => void save(memory.id)}
                        disabled={saving || !draftContent.trim()}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className={styles.content}>{memory.content}</p>
                    <div className={styles.meta}>
                      <span>{Math.round(memory.importance * 100)}% important</span>
                      <span>{Math.round(memory.confidence * 100)}% confident</span>
                      {memory.validUntil ? (
                        <span>Until {formatDate(memory.validUntil)}</span>
                      ) : null}
                    </div>
                    {memory.status === "active" ? (
                      <div className={styles.actions}>
                        {confirmDeleteId === memory.id ? (
                          <>
                            <span className={styles.confirmText}>Delete this memory?</span>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={deletingId === memory.id}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className={styles.delete}
                              onClick={() => void remove(memory)}
                              disabled={deletingId === memory.id}
                            >
                              {deletingId === memory.id ? "Deleting…" : "Delete memory"}
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => startEditing(memory)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className={styles.delete}
                              onClick={() => setConfirmDeleteId(memory.id)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </>
                )}
              </article>
            );
                })}
              </div>
            </>
          ) : activeTab === "account" ? (
            <div className={styles.settingsScroll}>
              <section className={styles.group} aria-label="Profile">
                <div className={styles.row}>
                  <div className={styles.rowText}>
                    <strong>{user.name ?? "Local user"}</strong>
                    <small>{user.email}</small>
                  </div>
                  <span className={styles.accountAvatar} aria-hidden="true">
                    {(user.name ?? user.email ?? "A").slice(0, 1).toUpperCase()}
                  </span>
                </div>
              </section>
              <section className={styles.group} aria-label="Memory and reasoning">
                <div className={styles.row}>
                  <div className={styles.rowText}>
                    <strong>Long-term memory</strong>
                    <small>Bluebird keeps what matters across your thread.</small>
                  </div>
                  <span className={styles.value}>On</span>
                </div>
                <div className={styles.row}>
                  <div className={styles.rowText}>
                    <strong>Reasoning</strong>
                    <small>How much a model thinks before a substantial reply. Each model uses the nearest level its provider supports.</small>
                  </div>
                  <select
                    className={styles.pillSelect}
                    aria-label="Reasoning"
                    value={reasoningEffort}
                    disabled={savingReasoning}
                    onChange={(event) =>
                      void saveReasoningEffort(event.target.value as ReasoningEffort)
                    }
                  >
                    <option value="none">None</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </section>
              {savingReasoning ? (
                <p className={styles.settingStatus} role="status">
                  Saving reasoning level…
                </p>
              ) : null}
              {reasoningError ? (
                <p className={styles.settingError} role="alert">
                  {reasoningError}
                </p>
              ) : null}
            </div>
          ) : activeTab === "engine" ? (
            <EnginePanel />
          ) : activeTab === "workspace" ? (
            <AgentPanel />
          ) : activeTab === "schedules" ? (
            <SchedulePanel />
          ) : activeTab === "skills" ? (
            <SkillsPanel />
          ) : activeTab === "connections" ? (
            <ConnectionsPanel />
          ) : activeTab === "appearance" ? (
            <div className={styles.settingsScroll}>
              <section className={styles.group} aria-label="Appearance">
                <div className={styles.row}>
                  <div className={styles.rowText}>
                    <strong>Theme</strong>
                    <small>Auto follows your device setting.</small>
                  </div>
                  <select
                    className={styles.pillSelect}
                    aria-label="Theme"
                    value={themeMode}
                    onChange={(event) => onThemeModeChange(event.target.value as ThemeMode)}
                  >
                    <option value="auto">Auto</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
              </section>
              <section className={styles.group} aria-label="Interactive visuals">
                <div className={styles.row}>
                  <div className={styles.rowText}>
                    <strong>Interactive visuals</strong>
                    <small>
                      Let the model answer with charts, sliders, calculators, forms and small tools
                      when they help. Works best with larger models; small ones do better with it off.
                    </small>
                  </div>
                  <select
                    className={styles.pillSelect}
                    aria-label="Interactive visuals"
                    value={interactiveUi ? "on" : "off"}
                    onChange={(event) => onInteractiveUiChange(event.target.value === "on")}
                  >
                    <option value="off">Off</option>
                    <option value="on">On</option>
                  </select>
                </div>
              </section>
              <section className={styles.group} aria-label="Thinking">
                <div className={styles.row}>
                  <div className={styles.rowText}>
                    <strong>Show thinking</strong>
                    <small>
                      Open each reply&apos;s thinking by default. You can always open or close it with
                      the arrow beside the time.
                    </small>
                  </div>
                  <select
                    className={styles.pillSelect}
                    aria-label="Show thinking"
                    value={showThinking ? "on" : "off"}
                    onChange={(event) => onShowThinkingChange(event.target.value === "on")}
                  >
                    <option value="off">Off</option>
                    <option value="on">On</option>
                  </select>
                </div>
              </section>
            </div>
          ) : (
            <div className={styles.settingsScroll}>
              <section className={styles.group} aria-label="Conversation data">
                <div className={styles.row}>
                  <div className={styles.rowText}>
                    <strong>Delete thread</strong>
                    <small>Removes every message, attachment, summary and memory in this thread.</small>
                  </div>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={onDeleteThread}
                    disabled={!canDeleteThread}
                    title={canDeleteThread ? undefined : "Wait for the current reply to finish."}
                  >
                    Delete
                  </button>
                </div>
              </section>
            </div>
          )}
        </section>
        )}
      </aside>
    </div>
  );
}
