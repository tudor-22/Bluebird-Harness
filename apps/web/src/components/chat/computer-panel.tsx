"use client";

import type { ComputerStatus } from "@bluebird/shared";
import { useCallback, useEffect, useState } from "react";

import panel from "./agent-panel.module.css";
import styles from "./memory-panel.module.css";

async function load(url: string, method: "GET" | "POST"): Promise<{ ok: true; status: ComputerStatus } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, { method, cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as Partial<ComputerStatus> & { error?: string };
    if (!response.ok || !data.browser) return { ok: false, error: data.error ?? "That did not work." };
    return { ok: true, status: data as ComputerStatus };
  } catch {
    return { ok: false, error: "Could not reach Bluebird." };
  }
}

const SYSTEM_NAME: Record<string, string> = { darwin: "Mac", macos: "Mac", win32: "Windows", windows: "Windows", linux: "Linux" };

/** Whether Bluebird can use a browser and control apps, with a button for each thing that needs doing. */
export function ComputerPanel() {
  const [status, setStatus] = useState<ComputerStatus | null>(null);
  const [busy, setBusy] = useState<"browser" | "desktop" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => void load("/api/computer", "GET").then((result) => result.ok && setStatus(result.status)));
  }, []);

  const run = useCallback(async (which: "browser" | "desktop") => {
    setBusy(which);
    setError(null);
    const result = await load(`/api/computer/${which}`, "POST");
    setBusy(null);
    if (result.ok) setStatus(result.status);
    else setError(result.error);
  }, []);

  if (!status) return null;
  const { browser, desktop } = status;
  const system = SYSTEM_NAME[desktop.platform] ?? "computer";

  return (
    <section className={styles.group} aria-label="Browser and apps">
      <div className={styles.row}>
        <div className={styles.rowText}>
          <strong>Web browser</strong>
          <small>{browser.state === "ready" ? "Ready. Bluebird can open and use web pages for you." : browser.detail}</small>
        </div>
        {browser.state === "needs-download" ? (
          <button type="button" className={panel.save} disabled={busy !== null} onClick={() => void run("browser")}>
            {busy === "browser" ? "Setting up…" : "Set up now"}
          </button>
        ) : null}
      </div>
      <div className={styles.row}>
        <div className={styles.rowText}>
          <strong>Apps on this {system}</strong>
          <small>{desktop.state === "ready" ? "Ready. Bluebird can look at your apps and use them when you ask." : desktop.detail}</small>
        </div>
        {desktop.state === "needs-permission" ? (
          <button type="button" className={panel.save} disabled={busy !== null} onClick={() => void run("desktop")}>
            {busy === "desktop" ? "Checking…" : "Allow"}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className={panel.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
