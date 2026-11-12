"use client";

import { useEffect, useState } from "react";

/** An app installed on this computer, as the message box knows it. */
export type AppInfo = { id: string; name: string };

export const iconUrl = (id: string) => `/api/apps/icon/${id}`;

let loading: Promise<AppInfo[]> | null = null;
let known: AppInfo[] = [];
const listeners = new Set<(apps: AppInfo[]) => void>();

/** Fetches the list once; every later call shares it. Icons are fetched ahead so they are there when needed. */
export function loadApps(): Promise<AppInfo[]> {
  loading ??= fetch("/api/apps/all")
    .then((response) => (response.ok ? response.json() : { apps: [] }))
    .then((data: { apps?: AppInfo[] }) => {
      known = Array.isArray(data.apps) ? data.apps : [];
      // Asking for each icon now means the browser already holds it when the menu opens.
      for (const app of known) {
        const image = new Image();
        image.decoding = "async";
        image.src = iconUrl(app.id);
      }
      for (const listener of listeners) listener(known);
      return known;
    })
    .catch(() => {
      loading = null;
      return [] as AppInfo[];
    });
  return loading;
}

/** The apps known so far (empty until the first load finishes), updating when they arrive. */
export function useApps(): AppInfo[] {
  const [apps, setApps] = useState<AppInfo[]>(known);
  useEffect(() => {
    listeners.add(setApps);
    void loadApps();
    return () => void listeners.delete(setApps);
  }, []);
  return apps;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches @Name and @"Name With Spaces", longest names first so "Visual Studio Code" wins over "Visual". */
function mentionPattern(apps: AppInfo[]): RegExp | null {
  if (apps.length === 0) return null;
  const names = [...apps].sort((a, b) => b.name.length - a.name.length).map((app) => escape(app.name));
  return new RegExp(`(?<=^|\\s)@(?:"(${names.join("|")})"|(${names.join("|")}))(?![\\w-])`, "gi");
}

const byName = (apps: AppInfo[], name: string) => apps.find((app) => app.name.toLowerCase() === name.toLowerCase());

/** The apps a piece of text points at, in order, each once. */
export function findAppMentions(text: string, apps: AppInfo[]): AppInfo[] {
  const pattern = mentionPattern(apps);
  if (!pattern) return [];
  const found: AppInfo[] = [];
  for (const match of text.matchAll(pattern)) {
    const app = byName(apps, match[1] ?? match[2]);
    if (app && !found.includes(app)) found.push(app);
  }
  return found;
}

/** Turns each app mention into a markdown link the renderer draws as an icon and a blue name. */
export function linkAppMentions(text: string, apps: AppInfo[]): string {
  const pattern = mentionPattern(apps);
  if (!pattern) return text;
  return text.replace(pattern, (whole, quoted: string | undefined, plain: string | undefined) => {
    const app = byName(apps, quoted ?? plain ?? "");
    return app ? `[${app.name}](#app-${app.id})` : whole;
  });
}
