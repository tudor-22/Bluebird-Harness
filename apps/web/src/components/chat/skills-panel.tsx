"use client";

import type { SkillSummary } from "@bluebird/shared";
import { useEffect, useMemo, useState } from "react";

import styles from "./automation.module.css";
import { deleteSkill, installSkill, listMarket, listSkills, type MarketSkill } from "./automation-client";
import card from "./memory-panel.module.css";

const ORIGIN_LABEL: Record<MarketSkill["origin"], string> = {
  claude: "Claude Code",
  codex: "Codex",
  github: "GitHub",
  local: "This computer",
};

/** Skills: short how-tos Bluebird wrote for itself, plus a marketplace for Claude Code and Codex skills. */
export function SkillsPanel() {
  const [tab, setTab] = useState<"mine" | "market">("mine");
  const [skills, setSkills] = useState<SkillSummary[] | null>(null);
  const [market, setMarket] = useState<MarketSkill[] | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    queueMicrotask(() => void listSkills().then((result) => result.ok && setSkills(result.data.skills)));
  }, []);

  useEffect(() => {
    if (tab !== "market" || market !== null) return;
    let live = true;
    void listMarket().then((result) => {
      if (!live) return;
      if (result.ok) setMarket(result.data.skills);
      else setMarketError(result.error);
    });
    return () => {
      live = false;
    };
  }, [tab, market]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (market ?? []).filter((skill) => !q || `${skill.name} ${skill.description} ${skill.from}`.toLowerCase().includes(q));
  }, [market, query]);

  const install = (id: string) => {
    setBusy(id);
    setMessage(null);
    void installSkill(id).then((result) => {
      setBusy(null);
      if (!result.ok) return setMessage({ ok: false, text: result.error });
      setSkills(result.data.skills);
      setMarket((current) => current?.map((skill) => (result.data.installed.includes(skill.name) ? { ...skill, installed: true } : skill)) ?? current);
      setMessage({ ok: true, text: `Installed ${result.data.installed.join(", ")}.` });
      if (id === source.trim()) setSource("");
    });
  };

  return (
    <div className={card.settingsScroll}>
      <div className={styles.actions} role="tablist" aria-label="Skills">
        <button type="button" role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? styles.solid : styles.ghost} onClick={() => setTab("mine")}>
          Installed
        </button>
        <button type="button" role="tab" aria-selected={tab === "market"} className={tab === "market" ? styles.solid : styles.ghost} onClick={() => setTab("market")}>
          Marketplace
        </button>
      </div>
      {message ? <p className={message.ok ? styles.note : styles.error}>{message.text}</p> : null}

      {tab === "mine" ? (
        <>
          <section className={card.group} aria-label="Installed skills">
            {skills === null ? (
              <p className={styles.note}>Loading…</p>
            ) : skills.length === 0 ? (
              <div className={styles.item}>
                <span className={styles.meta}>
                  No skills yet. Open the Marketplace to install Claude Code and Codex skills, or let Bluebird save one when it works out a procedure worth keeping.
                </span>
              </div>
            ) : (
              skills.map((skill) => (
                <div className={styles.item} key={skill.name}>
                  <div className={styles.itemHead}>
                    <div className={styles.itemTitle}>
                      <strong>{skill.name}</strong>
                      <small>{skill.description || "No description"}</small>
                    </div>
                    <button
                      type="button"
                      className={styles.danger}
                      disabled={busy !== null}
                      onClick={() => {
                        setBusy(skill.name);
                        void deleteSkill(skill.name).then((result) => {
                          setBusy(null);
                          if (result.ok) setSkills(result.data.skills);
                        });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
          <p className={styles.note}>
            A skill is a folder with a SKILL.md file, kept beside your settings. Bluebird sees the list of names and descriptions, and loads a skill only when the task calls for it. Saving or
            changing a skill follows your access level, like any file change.
          </p>
        </>
      ) : (
        <>
          <section className={card.group} aria-label="Install from GitHub">
            <form
              className={styles.stack}
              onSubmit={(event) => {
                event.preventDefault();
                if (source.trim()) install(source.trim());
              }}
            >
              <label>
                Install from GitHub
                <input
                  className={styles.input}
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="owner/repo, owner/repo/path/to/skill, or a github.com address"
                />
              </label>
              <div className={styles.actions}>
                <button type="submit" className={styles.solid} disabled={busy !== null || !source.trim()}>
                  {busy === source.trim() ? "Installing…" : "Install"}
                </button>
              </div>
            </form>
          </section>
          <section className={card.group} aria-label="Available skills">
            <div className={styles.stack}>
              <input className={styles.input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills" aria-label="Search skills" />
            </div>
            {market === null && !marketError ? (
              <p className={styles.note}>Looking for skills…</p>
            ) : marketError ? (
              <p className={styles.error}>{marketError}</p>
            ) : shown.length === 0 ? (
              <div className={styles.item}>
                <span className={styles.meta}>No skills match.</span>
              </div>
            ) : (
              shown.map((skill) => (
                <div className={styles.item} key={skill.id}>
                  <div className={styles.itemHead}>
                    <div className={styles.itemTitle}>
                      <strong>{skill.name}</strong>
                      <small>{skill.description || "No description"}</small>
                      <small>
                        {ORIGIN_LABEL[skill.origin]} · {skill.from}
                      </small>
                    </div>
                    <button type="button" className={skill.installed ? styles.ghost : styles.solid} disabled={busy !== null} onClick={() => install(skill.id)}>
                      {busy === skill.id ? "Installing…" : skill.installed ? "Update" : "Install"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
          <p className={styles.note}>
            Claude Code and Codex use the same skill format, so skills from ~/.claude, ~/.codex and the public catalogs install as they are, scripts and reference files included. A skill is
            instructions for the model; any script it runs still follows your access level. Only install skills you trust.
          </p>
        </>
      )}
    </div>
  );
}
