"use client";

import type { EngineInfo, EnginesResponse } from "@bluebird/shared";
import { useCallback, useEffect, useState } from "react";

import { chooseModel, fetchEngines, readyEngines, shortModelName } from "./engines-client";
import styles from "./memory-panel.module.css";

function statusText(engine: EngineInfo): string {
  switch (engine.status) {
    case "ready":
      return `Connected, ${engine.models.length} ${engine.models.length === 1 ? "model" : "models"}`;
    case "no-models":
      return "Connected, no chat models";
    case "needs-key":
      return "Needs an API key";
    case "unreachable":
      return engine.kind === "local" ? "Not running" : "Not reachable";
    default:
      return engine.error ?? "Could not connect";
  }
}

function EngineRow({
  engine,
  onSaved,
}: {
  engine: EngineInfo;
  onSaved: (next: EnginesResponse) => void;
}) {
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState(engine.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showsKey = engine.needsKey || engine.kind === "custom" || engine.id === "vllm";

  async function save(patch: { baseUrl?: string; apiKey?: string }) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/engines/${encodeURIComponent(engine.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await response.json()) as Partial<EnginesResponse> & { error?: string };
      if (!response.ok || !Array.isArray(data.engines)) {
        throw new Error(data.error ?? "Could not save.");
      }
      onSaved(data as EnginesResponse);
      setApiKey("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.engineItem} data-status={engine.status}>
      <div className={styles.row}>
        <div className={styles.rowText}>
          <strong>{engine.name}</strong>
          <small>
            <span className={styles.statusDot} data-status={engine.status} aria-hidden="true" />
            {statusText(engine)}
          </small>
        </div>
        <button
          type="button"
          className={styles.pillButton}
          aria-expanded={open}
          aria-label={`${open ? "Close" : "Set up"} ${engine.name}`}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Close" : engine.status === "ready" ? "Edit" : "Set up"}
        </button>
      </div>
      {open ? (
        <form
          className={styles.engineForm}
          onSubmit={(event) => {
            event.preventDefault();
            void save({
              baseUrl: baseUrl.trim() === engine.defaultBaseUrl ? "" : baseUrl,
              ...(apiKey.trim() ? { apiKey } : {}),
            });
          }}
        >
          <label>
            <span>Address</span>
            <input
              className={styles.textInput}
              value={baseUrl}
              placeholder={engine.kind === "custom" ? "https://your-server.example/v1" : engine.defaultBaseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              aria-label={`${engine.name} address`}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {showsKey ? (
            <label>
              <span>API key{engine.hasKey ? " (saved)" : engine.needsKey ? "" : " (optional)"}</span>
              <input
                className={styles.textInput}
                type="password"
                value={apiKey}
                placeholder={engine.hasKey ? "Leave blank to keep the saved key" : "Paste your key"}
                onChange={(event) => setApiKey(event.target.value)}
                aria-label={`${engine.name} API key`}
                autoComplete="off"
              />
            </label>
          ) : null}
          {engine.error && engine.status !== "ready" ? (
            <p className={styles.settingError} role="alert">
              {engine.error}
            </p>
          ) : null}
          {error ? (
            <p className={styles.settingError} role="alert">
              {error}
            </p>
          ) : null}
          <div className={styles.engineActions}>
            <button type="submit" className={styles.pillButton} disabled={busy}>
              {busy ? "Saving…" : "Save and connect"}
            </button>
            {engine.hasKey ? (
              <button
                type="button"
                className={styles.pillButton}
                disabled={busy}
                onClick={() => void save({ apiKey: "" })}
              >
                Remove key
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}

/** The Engine settings: which engines are connected and which model is the default. */
export function EnginePanel() {
  const [data, setData] = useState<EnginesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await fetchEngines();
    if (next) {
      setData(next);
      setError(null);
    } else {
      setError("Engines could not be loaded.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  const available = readyEngines(data);
  const value = data?.selected ? `${data.selected.engine}::${data.selected.model}` : "";

  async function choose(next: string) {
    const [engine, ...rest] = next.split("::");
    const result = await chooseModel(engine, rest.join("::"));
    if (result) setData(result);
    else setError("That model is not available right now.");
  }

  return (
    <div className={styles.settingsScroll}>
      <section className={styles.group} aria-label="Default model">
        <div className={styles.row}>
          <div className={styles.rowText}>
            <strong>Default model</strong>
            <small>
              {available.length > 0
                ? "Used for every new message. Only models that are available now are listed."
                : "Connect an engine below and its models will appear here."}
            </small>
          </div>
          <select
            className={styles.pillSelect}
            aria-label="Default model"
            value={value}
            disabled={available.length === 0}
            onChange={(event) => void choose(event.target.value)}
          >
            {available.length === 0 ? <option value="">No models</option> : null}
            {available.map((engine) => (
              <optgroup key={engine.id} label={engine.name}>
                {engine.models.map((model) => (
                  <option key={`${engine.id}/${model.name}`} value={`${engine.id}::${model.name}`}>
                    {shortModelName(model.name)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </section>

      {error ? (
        <p className={styles.settingError} role="alert">
          {error}
        </p>
      ) : null}

      <section className={styles.group} aria-label="Engines">
        {loading && !data ? <p className={styles.state}>Looking for engines…</p> : null}
        {(data?.engines ?? []).map((engine) => (
          <EngineRow key={engine.id} engine={engine} onSaved={setData} />
        ))}
      </section>
      <p className={styles.settingStatus}>
        Local engines are found automatically. Hosted engines send your messages to that
        provider, so they only work once you add a key.
      </p>
    </div>
  );
}
