"use client";

import type { AgentBackend, AgentLevel, AgentSettingsResponse } from "@bluebird/shared";
import { useCallback, useEffect, useState } from "react";

import { ACCESS_LEVELS, FULL_ACCESS_WARNING } from "./access-levels";
import { clearAgentGrants, fetchAgentSettings, saveAgentSettings } from "./agent-client";
import panel from "./agent-panel.module.css";
import { ComputerPanel } from "./computer-panel";
import styles from "./memory-panel.module.css";

/** The Workspace settings: how much the model may do on this computer, and where it starts. */
export function AgentPanel() {
  const [settings, setSettings] = useState<AgentSettingsResponse | null>(null);
  const [root, setRoot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmFull, setConfirmFull] = useState(false);
  const [backend, setBackend] = useState<AgentBackend>({ type: "local" });

  useEffect(() => {
    queueMicrotask(
      () =>
        void fetchAgentSettings().then((next) => {
          setSettings(next);
          setRoot(next?.root ?? "");
          setBackend(next?.backend ?? { type: "local" });
        }),
    );
  }, []);

  const save = useCallback(async (patch: Parameters<typeof saveAgentSettings>[0]) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await saveAgentSettings(patch);
    setBusy(false);
    if (result.ok) {
      setSettings(result.settings);
      setSaved(true);
    } else setError(result.error);
  }, []);

  if (!settings) {
    return (
      <div className={styles.settingsScroll}>
        <p className={panel.note}>Loading…</p>
      </div>
    );
  }

  const level = settings.level;
  const current = ACCESS_LEVELS.find((item) => item.value === level) ?? ACCESS_LEVELS[0];

  return (
    <div className={styles.settingsScroll}>
      <section className={styles.group} aria-label="Access">
        <div className={styles.row}>
          <div className={styles.rowText}>
            <strong>Tool access</strong>
            <small>{current.text}</small>
          </div>
          <select
            className={styles.pillSelect}
            aria-label="Tool access"
            value={level}
            disabled={busy}
            onChange={(event) => {
              const next = event.target.value as AgentLevel;
              if (next === "full") setConfirmFull(true);
              else {
                setConfirmFull(false);
                void save({ level: next });
              }
            }}
          >
            {ACCESS_LEVELS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        {confirmFull && level !== "full" ? (
          <div className={panel.warn} role="alertdialog" aria-label="Turn on full access">
            <p>
              <strong>Full access gives the model access to the entire operating system.</strong>{" "}
              {FULL_ACCESS_WARNING.replace(/^Full access gives the model access to the entire operating system\.\s*/, "")}
            </p>
            <div className={panel.warnActions}>
              <button
                type="button"
                className={panel.save}
                onClick={() => {
                  setConfirmFull(false);
                  void save({ level: "full" });
                }}
              >
                Turn on full access
              </button>
              <button type="button" className={panel.ghost} onClick={() => setConfirmFull(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>
      <ComputerPanel />
      {error ? (
        <p className={panel.error} role="alert">
          {error}
        </p>
      ) : null}

      <section className={styles.group} aria-label="Starting folder">
        <form
          className={panel.folder}
          onSubmit={(event) => {
            event.preventDefault();
            void save({ root: root.trim() });
          }}
        >
          <div className={panel.title}>
            <strong>Starting folder</strong>
            <small>
              Optional. Commands and relative file paths start here. Leave it empty to start in your home
              folder. The model can reach the rest of the computer either way.
            </small>
          </div>
          <div className={panel.folderForm}>
            <input
              value={root}
              placeholder="Home folder"
              onChange={(event) => setRoot(event.target.value)}
              aria-label="Starting folder"
              spellCheck={false}
              autoComplete="off"
            />
            <button type="submit" className={panel.save} disabled={busy || root.trim() === (settings.root ?? "")}>
              Save
            </button>
          </div>
          {saved ? (
            <span className={panel.badge} data-ready="true" role="status">
              Saved
            </span>
          ) : null}
        </form>
      </section>

      <section className={styles.group} aria-label="Where commands run">
        <form
          className={panel.folder}
          onSubmit={(event) => {
            event.preventDefault();
            void save({ backend });
          }}
        >
          <div className={panel.title}>
            <strong>Run commands on</strong>
            <small>
              Where run_command and background jobs run. Files the model edits always stay on this computer, so Docker mounts the starting
              folder, while SSH and custom wrappers run somewhere else entirely.
            </small>
          </div>
          <select
            className={styles.pillSelect}
            aria-label="Run commands on"
            value={backend.type}
            onChange={(event) => setBackend({ ...backend, type: event.target.value as AgentBackend["type"] })}
          >
            <option value="local">This computer</option>
            <option value="docker">A Docker container</option>
            <option value="ssh">Another machine over SSH</option>
            <option value="custom">A custom wrapper (cloud sandboxes)</option>
          </select>
          {backend.type === "docker" ? (
            <div className={panel.folderForm}>
              <input
                value={backend.dockerImage ?? ""}
                placeholder="Image, such as node:22"
                aria-label="Docker image"
                spellCheck={false}
                onChange={(event) => setBackend({ ...backend, dockerImage: event.target.value })}
              />
              <label className={panel.inline}>
                <input
                  type="checkbox"
                  checked={Boolean(backend.dockerNetwork)}
                  onChange={(event) => setBackend({ ...backend, dockerNetwork: event.target.checked })}
                />
                Network
              </label>
            </div>
          ) : null}
          {backend.type === "ssh" ? (
            <div className={panel.fields}>
              <input value={backend.sshTarget ?? ""} placeholder="user@host" aria-label="SSH machine" spellCheck={false} onChange={(event) => setBackend({ ...backend, sshTarget: event.target.value })} />
              <input value={backend.sshDir ?? ""} placeholder="Folder on that machine (optional)" aria-label="SSH folder" spellCheck={false} onChange={(event) => setBackend({ ...backend, sshDir: event.target.value })} />
              <input value={backend.sshIdentity ?? ""} placeholder="Key file (optional), such as ~/.ssh/id_ed25519" aria-label="SSH key file" spellCheck={false} onChange={(event) => setBackend({ ...backend, sshIdentity: event.target.value })} />
            </div>
          ) : null}
          {backend.type === "custom" ? (
            <input
              value={backend.customTemplate ?? ""}
              placeholder="daytona exec my-sandbox -- sh -c {command}"
              aria-label="Wrapper command"
              spellCheck={false}
              onChange={(event) => setBackend({ ...backend, customTemplate: event.target.value })}
            />
          ) : null}
          <div className={panel.folderForm}>
            <button
              type="submit"
              className={panel.save}
              disabled={busy || JSON.stringify(backend) === JSON.stringify(settings.backend ?? { type: "local" })}
            >
              Save
            </button>
          </div>
          {backend.type === "ssh" ? <span className={panel.badge}>Uses your SSH keys; it never asks for a password.</span> : null}
          {backend.type === "custom" ? (
            <span className={panel.badge}>{"{command}"} is replaced by the quoted command. Works with any cloud sandbox that has a command-line tool.</span>
          ) : null}
        </form>
      </section>

      <section className={styles.group} aria-label="Always allowed">
        <div className={styles.row}>
          <div className={styles.rowText}>
            <strong>Always allowed</strong>
            <small>
              {settings.grants.length > 0
                ? "Approved with Always allow this, until Bluebird restarts."
                : "Nothing yet. Choosing Always allow this on a request lists it here."}
            </small>
            {settings.grants.length > 0 ? (
              <div className={panel.grants}>
                {settings.grants.map((grant) => (
                  <code key={grant}>{grant.replace(/^cmd:/, "")}</code>
                ))}
              </div>
            ) : null}
          </div>
          {settings.grants.length > 0 ? (
            <button
              type="button"
              className={styles.pillButton}
              onClick={() => void clearAgentGrants().then((next) => next && setSettings(next))}
            >
              Forget
            </button>
          ) : null}
        </div>
      </section>

      <p className={panel.note}>
        You can also change the level beside the message box. Every reply that changed files has an Undo
        button. Credential files such as .env and SSH keys are off limits to the file tools unless you choose
        Full access. Thinking is skipped on these turns, and the model has to support function calling.
        Large models work best.
      </p>
    </div>
  );
}
