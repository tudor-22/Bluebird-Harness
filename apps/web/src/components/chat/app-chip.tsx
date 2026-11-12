"use client";

import { iconUrl, type AppInfo } from "../../lib/apps";
import styles from "./app-chip.module.css";

/** An app named in a message: its icon, then its name in blue. */
export function AppChip({ app }: { app: Pick<AppInfo, "id" | "name"> }) {
  return (
    <span className={styles.chip} data-app={app.name}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a small local icon */}
      <img className={styles.icon} src={iconUrl(app.id)} alt="" width={18} height={18} />
      {app.name}
    </span>
  );
}

/** The apps the message being written points at, shown above the text as it is typed. */
export function AppChipRow({ apps }: { apps: AppInfo[] }) {
  if (apps.length === 0) return null;
  return (
    <div className={styles.row} aria-label="Apps in this message">
      {apps.map((app) => (
        <AppChip key={app.id} app={app} />
      ))}
    </div>
  );
}
