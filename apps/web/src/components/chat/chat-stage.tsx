/* eslint-disable @next/next/no-img-element -- avatars and streamed attachments are dynamic */
"use client";

import {
  IMAGE_MAX_DIMENSION,
  audioMimeForFilename,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  parseUiSpec,
  toolsFromMetadata,
  type AgentLevel,
  type Attachment,
  type AttachmentKind,
  type Message,
  type ReasoningEffort,
  type ToolRecord,
  type UiSpec,
} from "@bluebird/shared";
import { ImageViewer, filenameFor, type ViewerItem } from "./image-viewer";
import { ToolActions, ToolTrail, trailSummary } from "./tool-cards";
import { PlanCard, latestPlan } from "./plan-card";
import {
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "./chat-stage.module.css";
import uiStyles from "./ui-block.module.css";
import { CodeBlock } from "./code-block";
import { splitFencedBlocks } from "./code-split";

/** The largest tool the web app will run, in characters of HTML. */
const APP_MAX_CHARS = 40000;
import { DayRail, type DayGroup } from "./day-rail";
import {
  FormattedText,
} from "./formatted-text";
import { AccessMenu } from "./access-menu";
import { fetchAgentSettings, saveAgentSettings } from "./agent-client";
import { MemoryPanel, type SettingsTab } from "./memory-panel";
import { fetchEngines, selectedModel, shortModelName } from "./engines-client";
import { ReasoningMenu } from "./reasoning-menu";
import { useComposerMenu } from "./composer-menu";
import { collectDropped } from "./drop-files";
import { ComposerMirror } from "./composer-mirror";
import { dropBrokenTokens, expandTokens, hasTokens, makeToken, spacesFor } from "./mention-tokens";
import { LiveStatus, liveActivityLabel, openFenceOf } from "./live-status";
import { streamingParts } from "./streaming-prose";
import { SandboxedApp } from "./sandboxed-app";
import { UiBlock } from "./ui-block";
import { ThinkingLine } from "./thinking-line";
import { ContextRing, type ContextUsage } from "./context-ring";
import { AppChipRow } from "./app-chip";
import { findAppMentions, useApps, type AppInfo } from "../../lib/apps";
import { extractDngPreview } from "../../lib/dng";
import { webImageSrc } from "../../lib/media";
import { forwardWheelToThread } from "../../lib/wheel-forward";
import {
  applyThemeMode,
  readInteractiveUi,
  readShowThinking,
  readThemeMode,
  saveInteractiveUi,
  saveShowThinking,
  saveThemeMode,
  type ThemeMode,
} from "../../lib/theme";
import {
  composeDictation,
  dictationCtor,
  dictationErrorMessage,
  type DictationRecognition,
} from "../../lib/dictation";

type ChatUser = {
  name: string | null;
  email: string;
  image: string | null;
};

type ChatStageProps = {
  user: ChatUser;
  initialReasoningEffort: ReasoningEffort;
};

type UiMessage = Message & { pending?: boolean };

/** Pictures open in the full-screen viewer, at one of a set. */
type LightboxTarget = { items: ViewerItem[]; index: number };

/** A file in the composer: shown instantly, uploaded in the background. */
type DraftAttachment = {
  key: string;
  name: string;
  size: number;
  kind: AttachmentKind;
  previewUrl: string | null;
  uploading: boolean;
  attachment: Attachment | null;
};

/** Re-renders once a second so the clock always shows the current minute. */
function useClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    const kickoff = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, []);

  return now;
}

type WeatherKind = "sun" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm";

type WeatherSnapshot = {
  temperature: number;
  high: number | null;
  low: number | null;
  condition: string;
  kind: WeatherKind;
  place: string;
};

/** WMO weather interpretation codes, as used by Open-Meteo. */
const WEATHER_LABELS: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Foggy",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

function weatherKind(code: number): WeatherKind {
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code === 45 || code === 48) return "fog";
  if (code <= 1) return "sun";
  if (code === 2) return "partly";
  return "cloud";
}

/** Weather for the visitor's network location — two key-free services. */
function useWeather(): WeatherSnapshot | null {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const locationResponse = await fetch("https://ipwho.is/", {
          signal: controller.signal,
        });
        if (!locationResponse.ok) return;

        const location = (await locationResponse.json()) as {
          success?: boolean;
          latitude?: number;
          longitude?: number;
          city?: string | null;
          region?: string | null;
          country?: string | null;
        };

        if (
          location.success === false ||
          typeof location.latitude !== "number" ||
          typeof location.longitude !== "number"
        ) {
          return;
        }

        const params = new URLSearchParams({
          latitude: String(location.latitude),
          longitude: String(location.longitude),
          current: "temperature_2m,weather_code",
          daily: "temperature_2m_max,temperature_2m_min",
          forecast_days: "1",
          timezone: "auto",
        });

        const weatherResponse = await fetch(
          `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
          { signal: controller.signal },
        );
        if (!weatherResponse.ok) return;

        const data = (await weatherResponse.json()) as {
          current?: { temperature_2m?: number; weather_code?: number };
          daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
        };

        const temperature = data.current?.temperature_2m;
        const code = data.current?.weather_code;
        if (typeof temperature !== "number" || typeof code !== "number") return;

        const high = data.daily?.temperature_2m_max?.[0];
        const low = data.daily?.temperature_2m_min?.[0];
        const place =
          location.city?.trim() ||
          location.region?.trim() ||
          location.country?.trim() ||
          "Your area";

        setWeather({
          temperature: Math.round(temperature),
          high: typeof high === "number" ? Math.round(high) : null,
          low: typeof low === "number" ? Math.round(low) : null,
          condition: WEATHER_LABELS[code] ?? "Current conditions",
          kind: weatherKind(code),
          place,
        });
      } catch {
        // Offline or a blocked request — the dashboard simply keeps the clock.
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  return weather;
}

const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const monthDayFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const spokenFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Local calendar day key. Days roll over at the user's midnight, not UTC. */
function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Today, Yesterday, then a plain date. Calendar-based, so it stays correct
 * across DST changes and at the user's local midnight.
 */
function dayLabel(date: Date, now: Date): string {
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  }).format(date);
}

const fullDateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

/** Date separators between message groups, like "Thursday, October 8". */
function dividerLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  const relative = dayLabel(date, now);
  return relative === "Today" || relative === "Yesterday" ? relative : fullDateFormat.format(date);
}

type SseHandlers = Record<string, (payload: unknown) => void | Promise<void>>;

async function readSse(body: ReadableStream<Uint8Array>, handlers: SseHandlers): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (data) await handlers[event]?.(JSON.parse(data));
    }
  }
}

/** Warms the browser cache so a revealed reply does not reflow as pictures load. */
async function preloadMessageImages(content: string): Promise<void> {
  const urls = new Set<string>();
  for (const match of content.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) {
    urls.add(match[1]);
  }
  for (const match of content.matchAll(/"url"\s*:\s*"(https?:\/\/[^"]+)"/g)) {
    urls.add(match[1].replace(/\\\//g, "/"));
  }
  for (const match of content.matchAll(/"attachmentId"\s*:\s*"([^"]+)"/g)) {
    urls.add(`/api/attachments/${match[1]}`);
  }
  const pictures = [...urls].slice(0, 8);
  if (pictures.length === 0) return;
  await Promise.all(
    pictures.map(
      (url) =>
        new Promise<void>((resolve) => {
          const image = document.createElement("img");
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          image.onload = done;
          image.onerror = done;
          window.setTimeout(done, 2500);
          image.src = webImageSrc(url);
        }),
    ),
  );
}

function isDngFile(file: File): boolean {
  return /\.dng$/i.test(file.name) || /dng|x-raw/i.test(file.type);
}

function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || audioMimeForFilename(file.name) !== null;
}

function guessAttachmentKind(file: File): AttachmentKind {
  if (isDngFile(file) || file.type.startsWith("image/")) return "image";
  if (isAudioFile(file)) return "audio";
  return "document";
}

/** Downscale large photos client-side so uploads stay inside the size cap. */
async function prepareImage(file: File): Promise<File> {
  if (isDngFile(file)) {
    const preview = extractDngPreview(await file.arrayBuffer());
    if (!preview) throw new Error(`${file.name} has no readable preview inside it.`);
    return prepareImage(
      new File([preview], file.name.replace(/\.dng$/i, ".jpg"), { type: "image/jpeg" }),
    );
  }
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= MAX_ATTACHMENT_BYTES) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, 0.85),
    );
    if (!blob) return file;
    return new File([blob], file.name, { type: blob.type });
  } catch {
    return file;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function dragHasFiles(event: ReactDragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function audioContextConstructor(): typeof AudioContext | null {
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

/** A short excerpt around the match, with the match marked. */
function highlightSnippet(text: string, query: string): ReactNode {
  const flat = text.replace(/\s+/g, " ").trim();
  const index = flat.toLowerCase().indexOf(query.toLowerCase());
  if (!query || index < 0) return flat.slice(0, 160);
  const start = Math.max(0, index - 60);
  const end = Math.min(flat.length, index + query.length + 100);
  return (
    <>
      {start > 0 ? "…" : null}
      {flat.slice(start, index)}
      <mark className={styles.searchMark}>{flat.slice(index, index + query.length)}</mark>
      {flat.slice(index + query.length, end)}
      {end < flat.length ? "…" : null}
    </>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.6" />
      <path d="M15.9 15.9 20 20" />
    </svg>
  );
}

function ComposeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.2 5.2 16 3.4a2 2 0 0 1 2.8 0l1.8 1.8a2 2 0 0 1 0 2.8l-9.8 9.8-4.8 1.2 1.2-4.8 7-9Z" />
      <path d="m13 4.6 5.4 5.4" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m7 9 5 5 5-5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3.5" width="6" height="10.5" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v2.5" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5.5" />
      <path d="M6.2 11.3 12 5.5l5.8 5.8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3.5 6h13M3.5 10h13M3.5 14h9" />
    </svg>
  );
}

function ChevronRightMenuIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true">
      <rect x="6.5" y="6.5" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M13.5 6.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v7A1.5 1.5 0 0 0 5 13.5h1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ThumbIcon({ up }: { up: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      aria-hidden="true"
      style={up ? undefined : { transform: "scaleY(-1)" }}
    >
      <path d="M6.5 9V16.5H4.5V9h2Zm0 0 2.7-5.2c.4-.8 1.6-.6 1.6.3V7.5h3.6c1 0 1.7.9 1.5 1.8l-1 4.5c-.2.8-.9 1.3-1.7 1.3H6.5" />
    </svg>
  );
}

/**
 * Copy and feedback under a finished reply. Feedback is kept on this device
 * only; it is not sent to the server yet.
 */
export function MessageActions({ messageId, text }: { messageId: string; text: string }) {
  const storageKey = `bluebird:feedback:${messageId}`;
  const [rating, setRating] = useState<"up" | "down" | null>(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      return stored === "up" || stored === "down" ? stored : null;
    } catch {
      return null;
    }
  });
  const [copied, setCopied] = useState(false);

  const choose = (value: "up" | "down") => {
    const next = rating === value ? null : value;
    setRating(next);
    try {
      if (next) window.localStorage.setItem(storageKey, next);
      else window.localStorage.removeItem(storageKey);
    } catch {
      // Private mode: the choice still shows for this visit.
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused; nothing else depends on the copy.
    }
  };

  return (
    <div className={styles.messageActions} role="group" aria-label="Reply actions">
      <button type="button" className={styles.messageAction} aria-label="Copy reply" onClick={copy}>
        <CopyIcon />
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
      <button
        type="button"
        className={styles.messageAction}
        aria-label="Good reply"
        aria-pressed={rating === "up"}
        onClick={() => choose("up")}
      >
        <ThumbIcon up />
      </button>
      <button
        type="button"
        className={styles.messageAction}
        aria-label="Poor reply"
        aria-pressed={rating === "down"}
        onClick={() => choose("down")}
      >
        <ThumbIcon up={false} />
      </button>
    </div>
  );
}

function MemoryMenuIcon() {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true">
      <ellipse cx="10" cy="5" rx="6" ry="3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M4 5v5c0 1.7 2.7 3 6 3s6-1.3 6-3V5M4 10v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function TrashMenuIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4.5 6h11M8 3.5h4M6.5 6l.6 10h5.8l.6-10M8.5 9v4M11.5 9v4" />
    </svg>
  );
}


function FileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 3.5h6.5L19 9v11.5H7z" />
      <path d="M13.5 3.5V9H19" />
    </svg>
  );
}

function AudioIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 17.5V6.5l9-2v11" />
      <circle cx="6.8" cy="17.5" r="2.3" />
      <circle cx="15.8" cy="15.5" r="2.3" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l10-6.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <rect x="7" y="5.5" width="3.6" height="13" rx="1.2" />
      <rect x="13.4" y="5.5" width="3.6" height="13" rx="1.2" />
    </svg>
  );
}

function WeatherIcon({ kind }: { kind: WeatherKind }) {
  return (
    <svg
      className={styles.weatherIcon}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "sun" ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
        </>
      ) : null}
      {kind === "partly" ? (
        <>
          <path d="M12 3v2M5.2 5.2l1.4 1.4M3 12h2M19 12h2M18.8 5.2l-1.4 1.4" />
          <path d="M15.9 12.6a4 4 0 0 0-5.9-4.1" />
          <path d="M13 21H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />
        </>
      ) : null}
      {kind === "cloud" ? (
        <path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z" />
      ) : null}
      {kind === "fog" ? <path d="M6 9.5h12M4.5 13h15M7 16.5h10" /> : null}
      {kind === "rain" ? (
        <>
          <path d="M17.5 16H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z" />
          <path d="M8.5 18.6l-.6 1.5M12 18.6l-.6 1.5M15.5 18.6l-.6 1.5" />
        </>
      ) : null}
      {kind === "snow" ? (
        <>
          <path d="M17.5 16H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z" />
          <path d="M9 19.8h.01M12 19.8h.01M15 19.8h.01" />
        </>
      ) : null}
      {kind === "storm" ? (
        <>
          <path d="M17.5 16H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z" />
          <path d="M12.9 17l-2.5 3.6h2.7l-1.7 2.9" />
        </>
      ) : null}
    </svg>
  );
}

const VOICE_WAVEFORM_CACHE = new Map<string, number[]>();
const VOICE_BAR_COUNT = 36;
const DICTATION_BAR_COUNT = 64;

/** Play button plus the clip's own waveform, instead of the native player. */
function VoiceNotePlayer({ id, src }: { id: string; src: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [bars, setBars] = useState<number[] | null>(VOICE_WAVEFORM_CACHE.get(id) ?? null);
  const [nearViewport, setNearViewport] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    const node = hostRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport || bars) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(src);
        const bytes = await response.arrayBuffer();
        const Ctor = audioContextConstructor();
        if (!Ctor) throw new Error("no audio context");
        const context = new Ctor();
        const decoded = await context.decodeAudioData(bytes);
        void context.close().catch(() => undefined);
        const data = decoded.getChannelData(0);
        const bucket = Math.max(1, Math.floor(data.length / VOICE_BAR_COUNT));
        const peaks: number[] = [];
        for (let index = 0; index < VOICE_BAR_COUNT; index++) {
          const start = index * bucket;
          const end = Math.min(data.length, start + bucket);
          let peak = 0;
          for (let cursor = start; cursor < end; cursor++) {
            peak = Math.max(peak, Math.abs(data[cursor]));
          }
          peaks.push(peak);
        }
        const loudest = Math.max(...peaks, 0.0001);
        const shaped = peaks.map((peak) => Math.max(0.1, Math.min(1, peak / loudest)));
        VOICE_WAVEFORM_CACHE.set(id, shaped);
        if (!cancelled) setBars(shaped);
      } catch {
        if (!cancelled) {
          setBars(Array.from({ length: VOICE_BAR_COUNT }, () => 0.22));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bars, id, nearViewport, src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  };

  const levels = bars ?? Array.from({ length: VOICE_BAR_COUNT }, () => 0.18);

  return (
    <div className={styles.voiceNote} ref={hostRef}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value)) setDuration(value);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          if (audio.duration > 0) setProgress(audio.currentTime / audio.duration);
        }}
      />
      <button
        type="button"
        className={styles.voiceNoteButton}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        onClick={toggle}
      >
        <span className={styles.voiceNotePlay}>{playing ? <PauseIcon /> : <PlayIcon />}</span>
        <span className={styles.voiceNoteBars} aria-hidden="true">
          {levels.map((level, index) => (
            <span
              key={index}
              className={styles.voiceNoteBar}
              data-played={index / levels.length <= progress}
              style={{ height: `${Math.round(6 + level * 22)}px` }}
            />
          ))}
        </span>
        {duration !== null ? (
          <span className={styles.voiceNoteTime}>{formatDuration(duration)}</span>
        ) : null}
      </button>
    </div>
  );
}

function MessageItem({
  message,
  id,
  highlight,
  onOpenImage,
  onSendPanel,
  showThinking,
  onUndone,
}: {
  message: UiMessage;
  id: string;
  highlight: boolean;
  onOpenImage: (items: ViewerItem[], index: number) => void;
  onSendPanel: (text: string) => void;
  /** The reply's file changes were put back. */
  onUndone: (messageId: string) => void;
  /** Open the thinking view on each reply by default. */
  showThinking: boolean;
}) {
  const isUser = message.role === "user";
  // "Thinking" only while a reply is actually on its way; an interrupted or
  // failed reply that produced no text simply shows nothing.
  const streaming = message.pending === true || message.metadata?.status === "streaming";
  const voiceOnly =
    isUser &&
    message.content.trim().length === 0 &&
    message.attachments.length > 0 &&
    message.attachments.every((attachment) => attachment.kind === "audio");
  // Parse once per version of the reply. The clock in the rail re-renders the
  // stage every second, and rebuilding specs on each tick would tear down and
  // recreate maps and other stateful panels continuously.
  const { segments } = useMemo(() => {
    if (streaming) {
      // Prose, panels, pictures and finished code blocks appear as they are
      // written, in the order the model wrote them.
      return { segments: streamingParts(message.content) };
    }
    const parts = splitFencedBlocks(message.content);
    // Prose, picture rows and interactive panels keep the order the model
    // wrote them in, so a picture sits next to its paragraph.
    const nextSegments: (
      | { kind: "prose"; text: string }
      | { kind: "code"; language?: string; code: string }
      | { kind: "panel"; spec: UiSpec }
      | { kind: "app"; title: string; html: string }
    )[] = [];
    for (const part of parts) {
      if (part.kind === "prose") {
        if (part.text.trim()) nextSegments.push({ kind: "prose", text: part.text });
        continue;
      }
      if (part.kind === "code") {
        // Code stays beside the text that talks about it, not at the end.
        nextSegments.push({ kind: "code", language: part.language, code: part.code });
        continue;
      }
      if (part.kind === "app") {
        // Only a finished, size-checked tool is run; a half-written one waits.
        // A page whose closing fence was forgotten still shows if it ends properly.
        const whole = part.closed || /<\/html>\s*$/i.test(part.source.trim());
        if (whole && part.source.trim() && part.source.length <= APP_MAX_CHARS) {
          nextSegments.push({ kind: "app", title: part.title || "Tool", html: part.source });
        }
        continue;
      }
      if (!part.closed) {
        nextSegments.push({ kind: "code", language: "ui", code: part.source });
        continue;
      }
      const spec = parseUiSpec(part.source);
      if (spec) nextSegments.push({ kind: "panel", spec });
      else nextSegments.push({ kind: "code", language: "ui", code: part.source });
    }

    // If a picture also lives inside an entity card, keep it there and drop
    // the standalone copy. This also cleans older replies already stored.
    const entityPictures = new Set<string>();
    for (const segment of nextSegments) {
      if (segment.kind !== "panel") continue;
      for (const block of segment.spec.blocks) {
        if (block.type === "entity" && block.imageUrl) {
          entityPictures.add(block.imageUrl);
        }
      }
    }
    if (entityPictures.size > 0) {
      for (let index = 0; index < nextSegments.length; index += 1) {
        const segment = nextSegments[index];
        if (segment.kind !== "prose") continue;
        const cleaned = segment.text
          .replace(
            /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g,
            (match, url: string) => (entityPictures.has(url) ? "" : match),
          )
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        if (cleaned) {
          nextSegments[index] = { kind: "prose", text: cleaned };
        } else {
          nextSegments.splice(index, 1);
          index -= 1;
        }
      }
    }
    return { segments: nextSegments };
  }, [message.content, streaming]);
  // If the only thing received so far is hidden code or a panel spec, keep the
  // activity label rather than leaving an empty bubble.
  const thinking = !isUser && streaming && segments.length === 0;
  // What the reply is doing right now (building a panel, searching, thinking),
  // shown under it with a running count so a long wait never looks stalled.
  const liveLabel = useMemo(() => {
    if (isUser || !streaming) return null;
    const activity = message.metadata?.activity;
    return liveActivityLabel({
      activity: typeof activity === "string" ? activity : undefined,
      hasProse: segments.some((segment) => segment.kind === "prose"),
      openFence: openFenceOf(splitFencedBlocks(message.content)),
    });
  }, [isUser, streaming, segments, message.content, message.metadata?.activity]);
  // What the model thought and did, for the arrow beside the time it took.
  const reasoningText =
    !isUser && typeof message.metadata?.reasoning === "string" ? message.metadata.reasoning : "";
  const thinkingSeconds =
    typeof message.metadata?.thinkingSeconds === "number" ? message.metadata.thinkingSeconds : undefined;
  // When the reply began: the model's own mark if it has one, else when the message was created,
  // so the count survives the line being redrawn between tool steps.
  const createdAtMs = Date.parse(message.createdAt);
  const thinkingStartedAt =
    typeof message.metadata?.reasoningStartedAt === "number"
      ? message.metadata.reasoningStartedAt
      : Number.isFinite(createdAtMs)
        ? createdAtMs
        : undefined;
  const thinkingSteps: string[] = [];
  const [thinkingOpen, setThinkingOpen] = useState(showThinking);
  const toolRecords = useMemo(() => (isUser ? [] : toolsFromMetadata(message.metadata ?? {})), [isUser, message.metadata]);
  const latest = useMemo(() => latestPlan(toolRecords), [toolRecords]);
  // The plan stays on screen for the whole reply: a moment where its record is being rewritten
  // must not make the card blink out and back.
  const lastPlanRef = useRef<ReturnType<typeof latestPlan>>([]);
  if (latest.length > 0) lastPlanRef.current = latest;
  const plan = latest.length > 0 ? latest : streaming && !isUser ? lastPlanRef.current : [];
  const trailTools = useMemo(() => toolRecords.filter((tool) => tool.name !== "plan_update"), [toolRecords]);
  // What is happening this moment: the panel being built, or the step being run. Falls back to
  // "Working" so the line never goes blank between steps while the reply is still going.
  const runningTool = [...trailTools].reverse().find((tool) => tool.status === "running" || tool.status === "awaiting-approval");
  const statusText =
    liveLabel && liveLabel !== "Thinking"
      ? liveLabel
      : runningTool
        ? runningTool.summary.slice(0, 90)
        : streaming && (toolRecords.length > 0 || segments.some((segment) => segment.kind === "prose"))
          ? "Working"
          : undefined;
  const showThinkingLine =
    !isUser &&
    (streaming ||
      reasoningText.trim().length > 0 ||
      thinkingSteps.length > 0 ||
      toolRecords.length > 0 ||
      liveLabel === "Thinking");
  const citedTexts = segments.map((segment) => (segment.kind === "prose" ? segment.text : ""));
  // Images sit outside the bubble as their own tiles above the text; the
  // remaining attachments stay inside it.
  const images = message.attachments.filter((attachment) => attachment.kind === "image");
  const inlineAttachments = message.attachments.filter(
    (attachment) => attachment.kind !== "image",
  );
  const showBubble = inlineAttachments.length > 0 || segments.length > 0 || thinking;
  if (!showBubble) return null;
  return (
    <div
      id={id}
      className={styles.messageItem}
      data-side={isUser ? "user" : "bluebird"}
      data-pending={message.pending === true}
      data-highlight={highlight}
    >
      {images.length > 0 ? (
        <div className={styles.messageMedia}>
          {images.map((attachment) => (
            <button
              key={attachment.id}
              type="button"
              className={styles.mediaTile}
              onClick={() =>
                onOpenImage(
                  images.map((item) => ({
                    src: `/api/attachments/${item.id}`,
                    caption: item.filename,
                    filename: item.filename,
                  })),
                  images.findIndex((item) => item.id === attachment.id),
                )
              }
              aria-label={`Open image ${attachment.filename}`}
            >
              <img
                className={styles.mediaImage}
                src={`/api/attachments/${attachment.id}`}
                alt={attachment.filename}
                loading="lazy"
              />
            </button>
          ))}
        </div>
      ) : null}
      {showBubble ? (
        <article
          className={
            isUser ? styles.userMessage : thinking ? styles.thinkingMessage : styles.bluebirdMessage
          }
          data-voice-only={voiceOnly}
        >
          {showThinkingLine ? (
            <ThinkingLine
              // Stays live for the whole reply once work has begun, so the line does not flip
              // between "Working" and "Ran 2 commands" in the gaps between steps.
              live={streaming}
              // One status line only: what is being done right now replaces "Working" instead of adding a second line.
              activity={statusText}
              reasoning={reasoningText}
              steps={thinkingSteps}
              seconds={thinkingSeconds}
              startedAt={thinkingStartedAt}
              open={thinkingOpen}
              onOpenChange={setThinkingOpen}
              trail={trailTools.length > 0 ? <ToolTrail tools={trailTools} /> : undefined}
              trailLabel={trailTools.length > 0 ? trailSummary(trailTools) : undefined}
            />
          ) : null}
          {toolRecords.length > 0 ? (
            <ToolActions
              messageId={message.id}
              tools={toolRecords}
              undone={message.metadata?.undone === true}
              streaming={streaming}
              onUndone={() => onUndone(message.id)}
            />
          ) : null}
          {inlineAttachments.length > 0 ? (
            <div className={styles.attachmentGrid}>
              {inlineAttachments.map((attachment) =>
                attachment.kind === "document" ? (
                  <a
                    key={attachment.id}
                    className={styles.attachmentFile}
                    href={`/api/attachments/${attachment.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FileIcon />
                    <span className={styles.attachmentFileName}>{attachment.filename}</span>
                    <span className={styles.attachmentFileSize}>
                      {formatBytes(attachment.sizeBytes)}
                    </span>
                  </a>
                ) : (
                  <VoiceNotePlayer
                    key={attachment.id}
                    id={attachment.id}
                    src={`/api/attachments/${attachment.id}`}
                  />
                ),
              )}
            </div>
          ) : null}
          {!showThinkingLine && liveLabel && liveLabel !== "Thinking" && openFenceOf(splitFencedBlocks(message.content)) ? (
            <LiveStatus key={liveLabel} label={liveLabel} />
          ) : null}
          {segments.map((segment, index) => {
            if (segment.kind === "prose") {
              return (
                <div className={styles.messageText} key={`${id}-text-${index}`}>
                  <FormattedText
                    text={citedTexts[index]}
                    onOpenImage={onOpenImage}
                  />
                </div>
              );
            }
            if (segment.kind === "building") {
              return (
                <section className={uiStyles.appPanel} key={`${id}-building-${index}`} aria-label={segment.title}>
                  <p className={uiStyles.appTitle}>{segment.title}</p>
                  <div className={uiStyles.appBuilding} aria-hidden="true" />
                </section>
              );
            }
            if (segment.kind === "code") {
              return (
                <div className={styles.inlinePanels} key={`${id}-code-${index}`}>
                  <CodeBlock language={segment.language} code={segment.code} />
                </div>
              );
            }
            if (segment.kind === "app") {
              return (
                <div className={styles.inlinePanels} key={`${id}-app-${index}`}>
                  <SandboxedApp
                    title={segment.title}
                    html={segment.html}
                    onSend={onSendPanel}
                  />
                </div>
              );
            }
            return (
              <div className={styles.inlinePanels} key={`${id}-panel-${index}`}>
                <UiBlock
                  spec={segment.spec}
                  onSend={onSendPanel}
                  persistKey={`${id}-panel-${index}`}
                  embedded
                  onOpenImage={(url, caption) =>
                    onOpenImage([{ src: url, caption: caption ?? "", filename: filenameFor(url, caption ?? "") }], 0)
                  }
                />
              </div>
            );
          })}
          {!showThinkingLine && liveLabel && liveLabel !== "Thinking" && !openFenceOf(splitFencedBlocks(message.content)) ? (
            <LiveStatus key={liveLabel} label={liveLabel} />
          ) : null}
          {/* Always last in the reply: status line, then the text, then the plan, then copy and feedback.
              It is rendered here whatever has streamed so far, so new text never pushes it above the prose. */}
          {plan.length > 0 ? (
            <PlanCard items={plan} live={streaming && !isUser} />
          ) : null}
          {!streaming && !isUser && segments.some((segment) => segment.kind === "prose") ? (
            <MessageActions
              messageId={message.id}
              text={segments
                .flatMap((segment) => (segment.kind === "prose" ? [segment.text] : []))
                .join("\n\n")
                .replace(/\[\d{1,2}\]/g, "")
                .trim()}
            />
          ) : null}
        </article>
      ) : null}
    </div>
  );
}

export function ChatStage({ user: initialUser, initialReasoningEffort }: ChatStageProps) {
  // The name and photo can be changed in Settings, and show at once.
  const [chosen, setChosen] = useState<{ name: string | null; image: string | null } | null>(null);
  const user = chosen ? { ...initialUser, ...chosen } : initialUser;
  const now = useClock();
  const weather = useWeather();
  const location = weather?.place ?? "";
  const [searchOpen, setSearchOpen] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxTarget | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [hasMessage, setHasMessage] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [dictationLevels, setDictationLevels] = useState<number[]>([]);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [threadReady, setThreadReady] = useState(false);
  const [draftAttachments, setDraftAttachments] = useState<DraftAttachment[]>([]);
  const draftsRef = useRef<DraftAttachment[]>([]);
  useEffect(() => {
    draftsRef.current = draftAttachments;
  }, [draftAttachments]);
  const uploading = draftAttachments.some((draft) => draft.uploading);
  const [streaming, setStreaming] = useState(false);
  // Messages sent while a reply is still being written wait here and go out, in order, when it finishes.
  const [queued, setQueued] = useState<{ id: string; text: string; attachments: Attachment[] }[]>([]);
  const queuedRef = useRef(queued);
  // How full the conversation is, for the ring beside the message box.
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const refreshContextUsage = useCallback(async () => {
    try {
      const response = await fetch("/api/thread/context", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as Partial<ContextUsage>;
      if (typeof data.used === "number" && typeof data.window === "number") setContextUsage(data as ContextUsage);
    } catch {
      // The ring keeps its last numbers.
    }
  }, []);
  // Count again when a reply finishes, the thread loads or changes, and the chosen model changes.
  const messageCount = messages.length;
  useEffect(() => {
    if (streaming) return;
    queueMicrotask(() => void refreshContextUsage());
  }, [streaming, messageCount, refreshContextUsage]);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("account");
  const [reasoningDefault, setReasoningDefault] =
    useState<ReasoningEffort>(initialReasoningEffort);
  const [savingReasoning, setSavingReasoning] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readThemeMode());
  // These come from the browser's storage, which the server cannot see. They start
  // at their defaults and are read right after the page loads, so the server's
  // HTML and the first browser render match.
  const [showThinking, setShowThinking] = useState<boolean>(false);
  const [interactiveUi, setInteractiveUi] = useState<boolean>(false);
  useEffect(() => {
    queueMicrotask(() => {
      setShowThinking(readShowThinking());
      setInteractiveUi(readInteractiveUi());
    });
  }, []);
  // How much the model may do with files and commands on this computer.
  const [agentLevel, setAgentLevel] = useState<AgentLevel>("auto");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [audioWarning, setAudioWarning] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [compactMobile, setCompactMobile] = useState(false);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [daySummaries, setDaySummaries] = useState<Record<string, string>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLElement>(null);
  const pinToBottomRef = useRef(true);
  /** The just-completed reply that should be brought into view from its top. */
  const revealMessageIdRef = useRef<string | null>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  /** Ids of assistant messages already accompanied by the chime. */
  const chimedIdsRef = useRef<Set<string> | null>(null);
  const chimeRef = useRef<HTMLAudioElement | null>(null);

  const openSettings = useCallback((tab: SettingsTab) => {
    setSettingsTab(tab);
    setMemoryOpen(true);
  }, []);
  const closeSettings = useCallback(() => setMemoryOpen(false), []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyThemeMode(themeMode, media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [themeMode]);

  useEffect(() => {
    queueMicrotask(
      () =>
        void fetchAgentSettings().then((settings) => {
          if (settings) setAgentLevel(settings.level);
        }),
    );
  }, [memoryOpen]);

  const changeAgentLevel = useCallback(
    async (level: AgentLevel) => {
      const result = await saveAgentSettings({ level });
      if (!result.ok) return;
      setAgentLevel(result.settings.level);
    },
    [],
  );

  const changeInteractiveUi = useCallback((value: boolean) => {
    setInteractiveUi(value);
    saveInteractiveUi(value);
  }, []);

  // A wheel turn on the blank sides of the page scrolls the conversation, so the
  // pointer does not have to sit over the messages. Anything that scrolls itself
  // under the pointer, such as a long code block, keeps its own turn.
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      const thread = threadRef.current;
      if (thread && forwardWheelToThread(event, thread)) event.preventDefault();
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  const changeShowThinking = useCallback((value: boolean) => {
    setShowThinking(value);
    saveShowThinking(value);
  }, []);

  const changeThemeMode = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
    saveThemeMode(mode);
    applyThemeMode(mode, window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  const stickThreadToBottom = useCallback(() => {
    const stick = () => {
      const thread = threadRef.current;
      if (thread && pinToBottomRef.current) thread.scrollTop = thread.scrollHeight;
    };
    stick();
    window.requestAnimationFrame(stick);
  }, []);

  const persistReasoningEffort = useCallback(
    async (next: ReasoningEffort) => {
      if (next === reasoningDefault || savingReasoning) return;
      const previous = reasoningDefault;
      setReasoningDefault(next);
      setSavingReasoning(true);
      setError(null);
      try {
        const response = await fetch("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reasoningEffort: next }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { user?: { reasoningEffort?: ReasoningEffort }; error?: string }
          | null;
        if (!response.ok || payload?.user?.reasoningEffort !== next) {
          throw new Error(payload?.error ?? "Reasoning effort could not be saved.");
        }
      } catch (saveError) {
        setReasoningDefault(previous);
        setError(
          saveError instanceof Error ? saveError.message : "Reasoning effort could not be saved.",
        );
      } finally {
        setSavingReasoning(false);
      }
    },
    [reasoningDefault, savingReasoning],
  );

  const playChime = useCallback(() => {
    try {
      if (!chimeRef.current) {
        const audio = new Audio("/media/sounds/notification_chime.mp3");
        audio.volume = 0.5;
        chimeRef.current = audio;
      }
      const audio = chimeRef.current;
      audio.currentTime = 0;
      void audio.play().catch((error) => console.debug("chime blocked", error));
    } catch (error) {
      console.debug("chime failed", error);
    }
  }, []);

  // Browsers only allow sound after an interaction; unlock quietly at the
  // first tap or keypress so later chimes are not blocked.
  useEffect(() => {
    const unlock = () => {
      if (chimeRef.current) return;
      playChime();
      const created = chimeRef.current as HTMLAudioElement | null;
      if (created) {
        created.pause();
        created.currentTime = 0;
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [playChime]);

  // Chime for each new message from the assistant. Existing history is marked on load,
  // so nothing rings for messages that were already there.
  useEffect(() => {
    if (chimedIdsRef.current === null) return;
    for (const message of messages) {
      if (message.role !== "assistant" || message.content.length === 0) continue;
      if (chimedIdsRef.current.has(message.id)) continue;
      chimedIdsRef.current.add(message.id);
      playChime();
      break;
    }
  }, [messages, playChime]);

  // One bar per day of the thread, for the right-hand jump rail.
  const dayGroups = useMemo(() => {
    const groups: DayGroup[] = [];
    const seen = new Set<string>();
    const now = new Date();
    for (const message of messages) {
      const date = new Date(message.createdAt);
      const key = localDayKey(date);
      if (seen.has(key)) continue;
      seen.add(key);
      const firstUser = messages.find(
        (item) =>
          item.role === "user" &&
          localDayKey(new Date(item.createdAt)) === key,
      );
      groups.push({
        key,
        label: dayLabel(date, now),
        snippet: (daySummaries[key] ?? firstUser?.content ?? "")
          .replace(/\s+/g, " ")
          .slice(0, 120),
      });
    }
    return groups;
  }, [daySummaries, messages]);

  const jumpToDay = useCallback((key: string) => {
    const thread = threadRef.current;
    const target = document.getElementById(`day-${key}`);
    if (!thread || !target) return;
    const top =
      target.getBoundingClientRect().top -
      thread.getBoundingClientRect().top +
      thread.scrollTop -
      128;
    thread.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    setActiveDay(key);
  }, []);

  // Search runs over the loaded thread: newest matches first.
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return messages
      .filter((message) => message.content.toLowerCase().includes(query))
      .slice(-30)
      .reverse();
  }, [messages, searchQuery]);

  const jumpToMessage = useCallback((id: string) => {
    setSearchOpen(false);
    setSearchQuery("");
    setHighlightId(id);
    window.setTimeout(() => setHighlightId(null), 2600);
    const thread = threadRef.current;
    const target = document.getElementById(`message-${id}`);
    if (!thread || !target) return;
    const top =
      target.getBoundingClientRect().top -
      thread.getBoundingClientRect().top +
      thread.scrollTop -
      140;
    thread.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, []);

  // Let the composer grow upward with the message instead of scrolling at one line.
  // The apps the message being written points at, drawn as icon chips above the text.
  const knownApps = useApps();
  const [mentionedApps, setMentionedApps] = useState<AppInfo[]>([]);
  // Apps picked from the @ menu sit in the box as chips; `boxText` mirrors the box so they can be drawn.
  const [pickedApps, setPickedApps] = useState<AppInfo[]>([]);
  const pickedAppsRef = useRef<AppInfo[]>([]);
  const [boxText, setBoxText] = useState("");
  const [boxScroll, setBoxScroll] = useState(0);
  const resizeMessage = useCallback(() => {
    const element = messageRef.current;
    if (!element) return;
    const cleaned = dropBrokenTokens(element.value);
    if (cleaned !== element.value) {
      const caret = element.selectionStart - (element.value.length - cleaned.length);
      element.value = cleaned;
      element.setSelectionRange(Math.max(0, caret), Math.max(0, caret));
    }
    setBoxText(element.value);
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
    setHasMessage(element.value.trim().length > 0);
    setBoxScroll(element.scrollTop);
    setMentionedApps((current) => {
      const next = findAppMentions(element.value, knownApps);
      return next.length === current.length && next.every((app, i) => app.id === current[i].id) ? current : next;
    });
  }, [knownApps]);

  // The / and @ pop-up above the message box.
  const [compactNote, setCompactNote] = useState<string | null>(null);
  // /compact: fold the conversation into a summary and free the context window.
  const compactConversation = useCallback(async () => {
    setCompactNote("Compacting the conversation…");
    try {
      const response = await fetch("/api/thread/compact", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; compacted?: boolean };
      setCompactNote(
        !response.ok || data.ok === false
          ? "Could not compact the conversation."
          : data.compacted
            ? "Conversation compacted. Older messages are now a summary."
            : "Nothing to compact yet.",
      );
      await refreshContextUsage();
    } catch {
      setCompactNote("Could not compact the conversation.");
    }
    window.setTimeout(() => setCompactNote(null), 5000);
  }, [refreshContextUsage]);
  const composerMenu = useComposerMenu({ messageRef, openSettings, onCompact: () => void compactConversation(),
    onPickApp: (app) => {
      const element = messageRef.current;
      pickedAppsRef.current = [...pickedAppsRef.current, app];
      setPickedApps(pickedAppsRef.current);
      return makeToken(pickedAppsRef.current.length - 1, element ? spacesFor(element, app.name) : app.name.length + 4);
    },
    onChange: resizeMessage,
  });

  // Dictation fills the composer with text; voice notes themselves are paused.
  const recognitionRef = useRef<DictationRecognition | null>(null);
  /** The reply in flight: Stop aborts it and keeps whatever has arrived. */
  const replyAbortRef = useRef<AbortController | null>(null);
  const streamedMessageIdRef = useRef<string | null>(null);
  const dictationBaseRef = useRef("");
  const dictationFinalRef = useRef("");
  const dictatingRef = useRef(false);
  const dictationStreamRef = useRef<MediaStream | null>(null);
  const dictationLevelsRef = useRef<number[]>([]);
  const dictationMeterContextRef = useRef<AudioContext | null>(null);
  const dictationMeterRafRef = useRef<number | null>(null);

  /** The live waveform: the same mic metering the voice notes used to show. */
  const stopDictationMeter = useCallback(() => {
    if (dictationMeterRafRef.current !== null) {
      cancelAnimationFrame(dictationMeterRafRef.current);
      dictationMeterRafRef.current = null;
    }
    const context = dictationMeterContextRef.current;
    dictationMeterContextRef.current = null;
    if (context) void context.close().catch(() => undefined);
    dictationStreamRef.current?.getTracks().forEach((track) => track.stop());
    dictationStreamRef.current = null;
    dictationLevelsRef.current = [];
    setDictationLevels([]);
  }, []);

  const startDictationMeter = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    // Created inside the click gesture so Safari does not leave it suspended.
    const Ctor = audioContextConstructor();
    const context = Ctor ? new Ctor() : null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      dictationStreamRef.current = stream;
      if (!context) return;
      if (context.state === "suspended") {
        await context.resume().catch(() => undefined);
      }
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let frame = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let index = 0; index < data.length; index += 1) {
          const value = (data[index] - 128) / 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / data.length);
        if (frame % 2 === 0) {
          const level = Math.min(1, Math.pow(rms * 4.2, 0.7));
          const next = [...dictationLevelsRef.current, level].slice(-DICTATION_BAR_COUNT);
          dictationLevelsRef.current = next;
          setDictationLevels(next);
        }
        frame += 1;
        dictationMeterRafRef.current = requestAnimationFrame(tick);
      };
      dictationMeterRafRef.current = requestAnimationFrame(tick);
      dictationMeterContextRef.current = context;
    } catch {
      // The meter is decorative; dictation still works without it.
      void context?.close().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    return () => {
      dictatingRef.current = false;
      recognitionRef.current?.stop();
      stopDictationMeter();
    };
  }, [stopDictationMeter]);

  const stopDictation = useCallback(() => {
    dictatingRef.current = false;
    setDictating(false);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    stopDictationMeter();
  }, [stopDictationMeter]);

  const startDictation = useCallback(() => {
    const Ctor = dictationCtor();
    const element = messageRef.current;
    if (!Ctor || !element) {
      setError(
        "Dictation is not available in this browser. Use your system shortcut: macOS press Fn twice, Windows press Win+H.",
      );
      return;
    }
    setError(null);
    const recognition = new Ctor();
    recognition.lang = navigator.language || "en-GB";
    recognition.continuous = true;
    recognition.interimResults = true;
    dictationBaseRef.current = element.value;
    dictationFinalRef.current = "";
    dictatingRef.current = true;
    recognition.onresult = (event) => {
      // Late results from a session that was stopped (for example by sending)
      // must never write back into the composer.
      if (recognitionRef.current !== recognition) return;
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          dictationFinalRef.current = `${dictationFinalRef.current} ${text}`.trim();
        } else {
          interim += text;
        }
      }
      element.value = composeDictation(
        dictationBaseRef.current,
        dictationFinalRef.current,
        interim,
      );
      resizeMessage();
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      if (event.error !== "aborted") setError(dictationErrorMessage(event.error));
      stopDictation();
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      // Browsers end the session after a pause; keep listening until stopped.
      if (dictatingRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          stopDictation();
          return;
        }
      }
      setDictating(false);
    };
    recognitionRef.current = recognition;
    setDictating(true);
    try {
      recognition.start();
    } catch {
      setError("Dictation could not start in this browser.");
      stopDictation();
      return;
    }
    void startDictationMeter();
  }, [resizeMessage, startDictationMeter, stopDictation]);

  // One continuous thread per user — loaded once, never reset.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/thread");
        if (!response.ok) return;
        const data = (await response.json()) as {
          messages: Message[];
          daySummaries?: Record<string, string>;
        };
        if (!cancelled) {
          chimedIdsRef.current = new Set(data.messages.map((message) => message.id));
          setMessages(data.messages);
          setDaySummaries(data.daySummaries ?? {});
        }

        if (!cancelled) setThreadReady(true);
      } catch {
        // The thread stays empty until the backend is reachable.
      }
    })();
    if (window.location.search) window.history.replaceState(null, "", "/chat");
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    const revealId = revealMessageIdRef.current;
    if (revealId) {
      revealMessageIdRef.current = null;
      if (pinToBottomRef.current) {
        const node = document.getElementById(`message-${revealId}`);
        if (node) {
          const threadRect = thread.getBoundingClientRect();
          const nodeRect = node.getBoundingClientRect();
          // A tall reply opens at its first line; a short one still settles at
          // the newest message.
          if (nodeRect.height > threadRect.height * 0.55) {
            const restingTop =
              Number.parseFloat(window.getComputedStyle(thread).paddingTop) || 0;
            thread.scrollTop += nodeRect.top - threadRect.top - restingTop;
            pinToBottomRef.current = false;
            return;
          }
        }
      }
    }
    if (!pinToBottomRef.current) return;
    stickThreadToBottom();
  }, [messages, streaming, stickThreadToBottom]);

  // Browser scroll restoration and late images can run after the messages
  // render. Re-pin once the initial thread is fully settled.
  useEffect(() => {
    if (!threadReady) return;
    stickThreadToBottom();
    const timer = window.setTimeout(stickThreadToBottom, 250);
    return () => window.clearTimeout(timer);
  }, [threadReady, stickThreadToBottom]);

  // Images increase the scroll height after their load event. Keep the newest
  // message visible until the user intentionally scrolls away.
  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    const onLoad = (event: Event) => {
      if (event.target instanceof HTMLImageElement) stickThreadToBottom();
    };
    thread.addEventListener("load", onLoad, true);
    return () => thread.removeEventListener("load", onLoad, true);
  }, [stickThreadToBottom]);

  // The composer grows with attachments and multi-line text. Measure it so the
  // thread always reserves room and the newest message stays visible above it.
  useEffect(() => {
    const node = composerRef.current;
    if (!node) return;
    const update = () => {
      const height = node.getBoundingClientRect().height;
      setComposerHeight((current) => (Math.abs(current - height) > 1 ? height : current));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread || !pinToBottomRef.current || composerHeight === 0) return;
    stickThreadToBottom();
  }, [composerHeight, stickThreadToBottom]);

  // Re-pin whenever the layout settles (fonts, window resize, keyboard) so the
  // newest message never rests under the composer.
  useEffect(() => {
    const stick = () => {
      stickThreadToBottom();
    };
    window.addEventListener("resize", stick);
    window.visualViewport?.addEventListener("resize", stick);
    void document.fonts.ready.then(stick).catch(() => undefined);
    return () => {
      window.removeEventListener("resize", stick);
      window.visualViewport?.removeEventListener("resize", stick);
    };
  }, [stickThreadToBottom]);

  /** Uploads one file and returns the stored attachment. */
  const uploadFile = useCallback(async (original: File): Promise<Attachment> => {
    const file = await prepareImage(original);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`${original.name} is larger than ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`);
    }
    const form = new FormData();
    form.append("file", file, file.name);
    const response = await fetch("/api/attachments", { method: "POST", body: form });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "The attachment could not be uploaded.");
    }
    return (await response.json()) as Attachment;
  }, []);

  /** Adds dropped or picked files to the composer, up to the per-message cap. */
  const addFiles = useCallback(
    async (files: File[]) => {
      setError(null);

      // Audio goes only to a model that can listen. Check the current default
      // model now and warn, rather than letting the send fail later.
      let incoming = files;
      if (files.some(isAudioFile)) {
        const model = selectedModel(await fetchEngines());
        if (!model?.model.audio) {
          const name = model ? shortModelName(model.model.name) : "The selected model";
          setAudioWarning(
            `${name} doesn't support audio input. Choose a model that can listen to audio in Settings, Engine.`,
          );
          incoming = files.filter((file) => !isAudioFile(file));
          if (incoming.length === 0) return;
        }
      }

      const room = MAX_ATTACHMENTS_PER_MESSAGE - draftAttachments.length;
      if (room <= 0) {
        setError(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`);
        return;
      }
      if (incoming.length > room) {
        setError(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`);
      }

      // Show every file straight away, then upload it behind the thumbnail.
      const accepted = incoming.slice(0, room);
      const drafts: DraftAttachment[] = accepted.map((file) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        size: file.size,
        kind: guessAttachmentKind(file),
        previewUrl: file.type.startsWith("image/") && !isDngFile(file)
          ? URL.createObjectURL(file)
          : null,
        uploading: true,
        attachment: null,
      }));
      setDraftAttachments((current) => [...current, ...drafts]);

      await Promise.all(
        accepted.map(async (file, index) => {
          const draft = drafts[index];
          // DNG previews need the embedded JPEG pulled out first.
          if (isDngFile(file)) {
            try {
              const preview = extractDngPreview(await file.arrayBuffer());
              if (preview) {
                const previewUrl = URL.createObjectURL(preview);
                setDraftAttachments((current) =>
                  current.map((item) =>
                    item.key === draft.key ? { ...item, previewUrl } : item,
                  ),
                );
              }
            } catch {
              // The upload path reports the real problem.
            }
          }
          try {
            const attachment = await uploadFile(file);
            if (!draftsRef.current.some((item) => item.key === draft.key)) {
              // Removed while uploading: do not leave it orphaned on the server.
              await fetch(`/api/attachments/${attachment.id}`, { method: "DELETE" }).catch(
                () => undefined,
              );
              return;
            }
            setDraftAttachments((current) =>
              current.map((item) =>
                item.key === draft.key ? { ...item, uploading: false, attachment } : item,
              ),
            );
          } catch (uploadError) {
            setDraftAttachments((current) =>
              current.filter((item) => item.key !== draft.key),
            );
            if (drafts[index].previewUrl) URL.revokeObjectURL(drafts[index].previewUrl as string);
            setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
          }
        }),
      );
    },
    [draftAttachments.length, uploadFile],
  );

  const uploadFiles = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      await addFiles(files);
    },
    [addFiles],
  );

  // Drag and drop anywhere in the chat adds the files to the composer.
  const [dragging, setDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const onDragEnter = useCallback((event: ReactDragEvent) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragging(true);
  }, []);

  const onDragOver = useCallback((event: ReactDragEvent) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDragLeave = useCallback((event: ReactDragEvent) => {
    if (!dragHasFiles(event)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  }, []);

  const onDrop = useCallback(
    (event: ReactDragEvent) => {
      if (!dragHasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setDragging(false);
      // Folders are read now, while the event still holds them, then added like any other file.
      void collectDropped(event.dataTransfer)
        .then((files) => addFiles(files))
        .catch(() => setError("That could not be read."));
    },
    [addFiles],
  );

  const removeDraftAttachment = useCallback(async (draft: DraftAttachment) => {
    setDraftAttachments((current) => current.filter((item) => item.key !== draft.key));
    if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    if (draft.attachment) {
      await fetch(`/api/attachments/${draft.attachment.id}`, { method: "DELETE" }).catch(
        () => undefined,
      );
    }
  }, []);

  /** Clears the thread after the confirmation dialog; reload starts a fresh one. */
  const removeThread = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch("/api/thread", { method: "DELETE" });
      if (!response.ok) {
        throw new Error("The thread could not be deleted. Please try again.");
      }
      window.location.reload();
    } catch (deleteFailure) {
      setDeleteError(
        deleteFailure instanceof Error ? deleteFailure.message : "Something went wrong.",
      );
      setDeleting(false);
    }
  }, [deleting]);

  /** Sends one turn and streams the reply: the composer and panel buttons both land here. */
  const dispatchMessage = useCallback(
    async (text: string, outgoing: Attachment[]) => {
      if (streaming) return;
      if (!text && outgoing.length === 0) return;
      setError(null);

      const attachmentIds = outgoing.map((item) => item.id);
      const optimistic: UiMessage = {
        id: `pending-${Date.now()}`,
        conversationId: "thread",
        role: "user",
        content: text,
        attachments: outgoing,
        createdAt: new Date().toISOString(),
        metadata: {},
        pending: true,
      };
      setMessages((current) => [...current, optimistic]);
      // Sending always brings the thread back to the newest message.
      pinToBottomRef.current = true;
      setStreaming(true);

      // Coalesce token deltas to one paint per frame. The prose appears while
      // it is written; code, panels and pictures wait for message.completed.
      let streamedMessageId: string | null = null;
      const controller = new AbortController();
      replyAbortRef.current = controller;
      let deltaBuffer = "";
      let deltaFrame: number | null = null;
      const flushDelta = () => {
        deltaFrame = null;
        if (!streamedMessageId || !deltaBuffer) return;
        const id = streamedMessageId;
        const text = deltaBuffer;
        deltaBuffer = "";
        setMessages((current) =>
          current.map((item) =>
            item.id === id ? { ...item, content: item.content + text } : item,
          ),
        );
      };
      const queueDelta = (messageId: string, text: string) => {
        streamedMessageId = messageId;
        streamedMessageIdRef.current = messageId;
        deltaBuffer += text;
        if (deltaFrame === null) deltaFrame = window.requestAnimationFrame(flushDelta);
      };
      const cancelDelta = () => {
        if (deltaFrame !== null) window.cancelAnimationFrame(deltaFrame);
        deltaFrame = null;
        deltaBuffer = "";
      };

      try {
        const response = await fetch("/api/thread/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            content: text || undefined,
            attachmentIds,
            client: {
              time: new Date().toISOString(),
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              location: location || undefined,
            },
            reasoningEffort: reasoningDefault,
            interactiveUi,
            agentTools: true,
          }),
        });
        if (!response.ok || !response.body) {
          throw new Error("The model could not respond. Please try again.");
        }
        await readSse(response.body, {
        "message.created": (payload) => {
          const { message } = payload as { message: Message };
          if (message.role === "assistant") {
            streamedMessageId = message.id;
            streamedMessageIdRef.current = message.id;
          }
          setMessages((current) => {
            if (message.role === "user") {
              const index = current.findIndex((item) => item.pending);
              if (index >= 0) {
                const next = [...current];
                next[index] = message;
                return next;
              }
            }
            return [...current, message];
          });
        },
        "message.delta": (payload) => {
          const { messageId, text } = payload as { messageId: string; text: string };
          queueDelta(messageId, text);
        },
        "message.reasoning": (payload) => {
          const { messageId, text } = payload as { messageId: string; text: string };
          setMessages((current) =>
            current.map((item) => {
              if (item.id !== messageId) return item;
              const previous =
                typeof item.metadata?.reasoning === "string" ? item.metadata.reasoning : "";
              return {
                ...item,
                metadata: {
                  ...item.metadata,
                  reasoning: previous + text,
                  reasoningStartedAt: item.metadata?.reasoningStartedAt ?? Date.now(),
                },
              };
            }),
          );
        },
        "tool.update": (payload) => {
          const { messageId, tool } = payload as { messageId: string; tool: ToolRecord };
          setMessages((current) =>
            current.map((item) => {
              if (item.id !== messageId) return item;
              const tools = toolsFromMetadata(item.metadata ?? {});
              const at = tools.findIndex((entry) => entry.id === tool.id);
              const next = at === -1 ? [...tools, tool] : tools.map((entry, i) => (i === at ? tool : entry));
              return { ...item, metadata: { ...item.metadata, tools: next } };
            }),
          );
        },
        "message.activity": (payload) => {
          const { messageId, activity } = payload as {
            messageId: string;
            activity: string;
          };
          setMessages((current) =>
            current.map((item) =>
              item.id === messageId
                ? { ...item, metadata: { ...item.metadata, activity } }
                : item,
            ),
          );
        },
        "message.completed": async (payload) => {
          const { message } = payload as { message: Message };
          cancelDelta();
          // The reply appears once, complete, with its pictures already
          // cached, instead of rebuilding itself delta by delta.
          if (message.role === "assistant") {
            await preloadMessageImages(message.content);
            revealMessageIdRef.current = message.id;
          }
          setMessages((current) =>
            current.map((item) => (item.id === message.id ? message : item)),
          );
        },
        error: (payload) => {
          const { error: message } = payload as { error: string };
          setError(message);
        },
        });
      } catch (sendError) {
        if (controller.signal.aborted) {
          // Stopped on purpose: keep the words that arrived (the finally block
          // flushes them) and show the reply as stopped.
          const stoppedId = streamedMessageIdRef.current;
          setMessages((current) =>
            current
              .filter((item) => !item.pending)
              .map((item) =>
                item.id === stoppedId
                  ? { ...item, metadata: { ...item.metadata, status: "interrupted" } }
                  : item,
              ),
          );
        } else {
          setMessages((current) => current.filter((item) => !item.pending));
          setError(sendError instanceof Error ? sendError.message : "Something went wrong.");
          throw sendError;
        }
      } finally {
        flushDelta();
        replyAbortRef.current = null;
        streamedMessageIdRef.current = null;
        setStreaming(false);
        setMessages((current) =>
          current.filter(
            (item) =>
              !(
                item.role === "assistant" &&
                item.metadata?.status === "streaming" &&
                item.content.length === 0
              ),
          ),
        );
        messageRef.current?.focus();
      }
    },
    [streaming, location, reasoningDefault, interactiveUi],
  );

  /** Stop replaces the microphone while the assistant is writing; the reply keeps what it has. */
  const stopReply = useCallback(() => {
    replyAbortRef.current?.abort();
  }, []);

  const sendMessage = useCallback(async (extra: Attachment[] = []) => {
    const element = messageRef.current;
    if (!element || draftAttachments.some((draft) => draft.uploading)) return;
    const text = expandTokens(element.value, pickedAppsRef.current).trim();
    const outgoing = [
      ...draftAttachments
        .map((draft) => draft.attachment)
        .filter((attachment): attachment is Attachment => attachment !== null),
      ...extra,
    ];
    if (!text && outgoing.length === 0) return;
    element.value = "";
    element.style.removeProperty("height");
    setHasMessage(false);
    setMentionedApps([]);
    pickedAppsRef.current = [];
    setPickedApps([]);
    setBoxText("");
    if (/^\/compact$/i.test(text) && outgoing.length === 0) {
      if (!streaming) void compactConversation();
      return;
    }
    for (const draft of draftAttachments) {
      if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    }
    setDraftAttachments([]);
    if (streaming) {
      // The model is still working: keep the message, in order, and send it when the reply is done.
      const next = [...queuedRef.current, { id: `queued-${Date.now()}-${queuedRef.current.length}`, text, attachments: outgoing }];
      queuedRef.current = next;
      setQueued(next);
      return;
    }
    try {
      await dispatchMessage(text, outgoing);
    } catch {
      // Give the text back so nothing the user typed is lost.
      if (element.value.trim().length === 0) {
        element.value = text;
        element.style.height = "auto";
        element.style.height = `${element.scrollHeight}px`;
        setHasMessage(true);
      }
    }
  }, [draftAttachments, streaming, dispatchMessage, compactConversation]);

  useEffect(() => {
    queuedRef.current = queued;
  }, [queued]);

  // When a reply ends, the next queued message goes out. One at a time: its own reply must finish first.
  useEffect(() => {
    if (streaming || !threadReady || queuedRef.current.length === 0) return;
    const [next, ...rest] = queuedRef.current;
    queuedRef.current = rest;
    setQueued(rest);
    void dispatchMessage(next.text, next.attachments).catch(() => undefined);
  }, [streaming, threadReady, queued, dispatchMessage]);

  const removeQueued = useCallback((id: string) => {
    const rest = queuedRef.current.filter((item) => item.id !== id);
    queuedRef.current = rest;
    setQueued(rest);
  }, []);

  /** A panel button sends the message it composed from the panel's current values. */
  const sendPanelMessage = useCallback(
    (text: string) => {
      void dispatchMessage(text.trim(), []).catch(() => undefined);
    },
    [dispatchMessage],
  );

  const onMessageKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (composerMenu.handleKey(event)) return;
      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
      event.preventDefault();
      void sendMessage();
    },
    [sendMessage, composerMenu],
  );

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    if (searchButtonRef.current?.offsetParent) {
      searchButtonRef.current.focus();
    } else {
      messageRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSearch();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeSearch, searchOpen]);

  useEffect(() => {
    if (!deleteOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) setDeleteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteOpen, deleting]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)");
    const sync = () => {
      setCompactMobile(query.matches);
      if (!query.matches) setMobileMenuOpen(false);
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return (
    <div
      className={styles.stage}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging ? (
        <div className={styles.dropOverlay} aria-hidden="true">
          <span className={styles.dropLabel}>Drop to attach</span>
        </div>
      ) : null}
      <header className={styles.topBar}>
        {compactMobile ? (
          <button
            type="button"
            className={styles.mobileMenuButton}
            aria-label="Open Bluebird menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            <MenuIcon />
            <span>Menu</span>
          </button>
        ) : (
          // The bar is three columns; this empty one keeps the Chat and Work switch in the middle.
          <span aria-hidden="true" />
        )}

        {compactMobile ? null : (
          <div className={styles.switcher} role="group" aria-label="View">
            <button type="button" className={styles.switcherChat} aria-pressed="true">
              Chat
            </button>
            <span className={styles.switcherWorkWrap} title="Coming soon">
              <button
                type="button"
                className={styles.switcherWork}
                aria-pressed="false"
                disabled
              >
                Work
              </button>
            </span>
          </div>
        )}

        <div className={styles.topRight}>
          {compactMobile ? (
            <button
              type="button"
              className={styles.mobileCompose}
              aria-label="Write a message"
              onClick={() => messageRef.current?.focus()}
            >
              <ComposeIcon />
            </button>
          ) : (
            <button
              type="button"
              className={styles.search}
              ref={searchButtonRef}
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
            >
              <SearchIcon />
            </button>
          )}
          <div className={styles.account}>
            {compactMobile ? (
              <button
                type="button"
                className={styles.mobileProfile}
                aria-label="Open settings"
                aria-haspopup="dialog"
                aria-expanded={memoryOpen}
                onClick={() => openSettings("menu")}
              >
                {user.image ? (
                  <img src={user.image} alt="" className={styles.avatarImage} referrerPolicy="no-referrer" />
                ) : (
                  <span>{(user.name ?? user.email ?? "A").slice(0, 1).toUpperCase()}</span>
                )}
              </button>
            ) : (
              <button
                type="button"
                className={styles.avatar}
                aria-label="Open settings"
                aria-haspopup="dialog"
                aria-expanded={memoryOpen}
                onClick={() => openSettings("menu")}
              >
                {user.image ? (
                  <img
                    className={styles.avatarImage}
                    src={user.image}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className={styles.avatarInitial}>
                    {(user.name ?? user.email ?? "A").slice(0, 1).toUpperCase()}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.info}>
          {now ? (
            <time
              className={styles.clock}
              dateTime={now.toISOString()}
              aria-label={spokenFormat.format(now)}
            >
              <span>{weekdayFormat.format(now)}</span>
              <span>{monthDayFormat.format(now)}</span>
              <span>{timeFormat.format(now)}</span>
            </time>
          ) : null}

          {weather ? (
            <div className={styles.weather} aria-label={`Weather in ${weather.place}`}>
              <p className={styles.weatherNow}>
                <WeatherIcon kind={weather.kind} />
                <span className={styles.weatherTemp}>{weather.temperature}°</span>
                <span className={styles.weatherCondition}>{weather.condition}</span>
              </p>
              <p className={styles.weatherMeta}>
                {weather.place}
                {weather.high !== null && weather.low !== null
                  ? ` · H:${weather.high}° L:${weather.low}°`
                  : null}
              </p>
            </div>
          ) : null}
        </div>

        <div
          className={styles.thread}
          ref={threadRef}
          data-testid="chat-thread"
          onScroll={(event) => {
            const element = event.currentTarget;
            const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
            pinToBottomRef.current = distance < 120;
          }}
          style={composerHeight ? { paddingBottom: `${composerHeight + 16}px` } : undefined}
        >
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const dayKey = localDayKey(new Date(message.createdAt));
            const showDivider =
              !previous ||
              localDayKey(new Date(previous.createdAt)) !== dayKey;
            return (
              <Fragment key={message.id}>
                {showDivider ? (
                  <p className={styles.dayDivider} id={`day-${dayKey}`}>
                    {dividerLabel(message.createdAt, new Date())}
                  </p>
                ) : null}
                <MessageItem
                  message={message}
                  id={`message-${message.id}`}
                  highlight={message.id === highlightId}
                  onOpenImage={(items, index) => setLightbox({ items, index })}
                  onSendPanel={sendPanelMessage}
                  showThinking={showThinking}
                  onUndone={(messageId) =>
                    setMessages((current) =>
                      current.map((item) =>
                        item.id === messageId ? { ...item, metadata: { ...item.metadata, undone: true } } : item,
                      ),
                    )
                  }
                />
              </Fragment>
            );
          })}
        </div>

        {compactNote ? (
          <p className={styles.notice} role="status">
            {compactNote}
          </p>
        ) : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </main>

      <div className={styles.edgeTop} aria-hidden="true" />
      <div className={styles.edgeBottom} aria-hidden="true" />

      <footer className={styles.composer} ref={composerRef}>
        {queued.length > 0 ? (
          <ul className={styles.queueList} aria-label="Queued messages">
            {queued.map((item) => (
              <li key={item.id} className={styles.queueItem}>
                <span className={styles.queueLabel}>Queued</span>
                <span className={styles.queueText}>{item.text || `${item.attachments.length} attachment${item.attachments.length === 1 ? "" : "s"}`}</span>
                <button type="button" className={styles.queueRemove} aria-label="Remove queued message" onClick={() => removeQueued(item.id)}>
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className={styles.messageBar} data-expanded={draftAttachments.length > 0}>
          {draftAttachments.length > 0 ? (
            <div className={styles.draftStrip}>
              {draftAttachments.map((draft) => (
                <div
                  key={draft.key}
                  className={styles.draftCard}
                  data-uploading={draft.uploading}
                >
                  {draft.previewUrl ? (
                    <img className={styles.draftImage} src={draft.previewUrl} alt={draft.name} />
                  ) : (
                    <div className={styles.draftFile}>
                      {draft.kind === "document" ? <FileIcon /> : <AudioIcon />}
                      <span className={styles.draftName}>{draft.name}</span>
                      <span className={styles.draftSize}>{formatBytes(draft.size)}</span>
                    </div>
                  )}
                  {draft.uploading ? (
                    <span className={styles.draftSpinner} role="status" aria-label="Uploading" />
                  ) : null}
                  <button
                    type="button"
                    className={styles.draftRemove}
                    aria-label={`Remove ${draft.name}`}
                    onClick={() => void removeDraftAttachment(draft)}
                  >
                    <CloseIcon />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {composerMenu.node}
          <AppChipRow apps={mentionedApps} />
          <div className={styles.inputRow}>
                <div className={styles.messageField}>
                <textarea
                  ref={messageRef}
                  className={
                    dictating
                      ? `${styles.messageInput} ${styles.messageInputHidden}`
                      : hasTokens(boxText)
                        ? `${styles.messageInput} ${styles.messageInputChips}`
                        : styles.messageInput
                  }
                  placeholder="Message Bluebird"
                  aria-label="Message Bluebird"
                  autoComplete="off"
                  rows={1}
                  onInput={() => {
                    resizeMessage();
                    composerMenu.refresh();
                  }}
                  onKeyUp={(event) => {
                    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
                      composerMenu.refresh();
                    }
                  }}
                  onClick={composerMenu.refresh}
                  onKeyDown={onMessageKeyDown}
                  onScroll={(event) => setBoxScroll(event.currentTarget.scrollTop)}
                />
                  {!dictating && hasTokens(boxText) ? (
                    <ComposerMirror value={boxText} apps={pickedApps} scrollTop={boxScroll} />
                  ) : null}
                </div>
                <input
                  ref={fileInputRef}
                  className={styles.fileInput}
                  type="file"
                  accept="image/*,.dng,application/pdf,audio/*,text/*,.m4a,.aac,.ogg,.opus,.flac,.aiff,.aif,.webm,.md,.csv,.tsv,.json,.jsonl,.xml,.yaml,.yml,.toml,.ini,.log,.js,.jsx,.ts,.tsx,.mjs,.py,.rb,.go,.rs,.java,.kt,.swift,.c,.h,.cpp,.cs,.php,.sh,.sql,.css,.scss,.vue,.svelte,.html"
                  multiple
                  onChange={(event) => void uploadFiles(event)}
                />
                {dictating ? (
                  <>
                    <div
                      className={`${styles.waveform} ${styles.recordingWaveform}`}
                      aria-hidden="true"
                    >
                      {Array.from({ length: DICTATION_BAR_COUNT }, (_, index) => {
                        const level =
                          dictationLevels[index - (DICTATION_BAR_COUNT - dictationLevels.length)] ?? 0;
                        return (
                          <span
                            key={index}
                            className={styles.waveBar}
                            style={{ height: `${Math.max(5, Math.round(level * 30))}px` }}
                          />
                        );
                      })}
                    </div>
                    {streaming ? (
                      <button
                        type="button"
                        className={`${styles.sendButton} ${styles.stopButton}`}
                        aria-label="Stop generating"
                        title="Stop generating"
                        onClick={stopReply}
                      >
                        <StopIcon />
                      </button>
                    ) : (
                    <button
                      type="button"
                      className={styles.sendButton}
                      aria-label="Send message"
                      disabled={uploading}
                      onClick={() => {
                        stopDictation();
                        void sendMessage();
                      }}
                    >
                      <ArrowUpIcon />
                    </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label="Add attachment"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <PlusIcon />
                    </button>
                    <ContextRing usage={contextUsage} />
                    <AccessMenu
                      level={agentLevel}
                      disabled={streaming}
                      onChange={(level) => void changeAgentLevel(level)}
                    />
                    <ReasoningMenu
                      variant="composer"
                      value={reasoningDefault}
                      disabled={streaming || savingReasoning}
                      onChange={(effort) => void persistReasoningEffort(effort)}
                      onOpenEngines={() => openSettings("engine")}
                    />
                    {streaming && !hasMessage && draftAttachments.length === 0 ? (
                      <button
                        type="button"
                        className={`${styles.sendButton} ${styles.stopButton}`}
                        aria-label="Stop generating"
                        title="Stop generating"
                        onClick={stopReply}
                      >
                        <StopIcon />
                      </button>
                    ) : hasMessage || draftAttachments.length > 0 ? (
                      <button
                        type="button"
                        className={styles.sendButton}
                        aria-label={uploading ? "Uploading attachment" : streaming ? "Queue message" : "Send message"}
                        title={streaming ? "Queue message: sent when the reply is done" : undefined}
                        disabled={uploading}
                        onClick={() => void sendMessage()}
                      >
                        <ArrowUpIcon />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label="Dictate a message"
                        title="Dictate a message"
                        onClick={startDictation}
                      >
                        <MicIcon />
                      </button>
                    )}
                  </>
                )}
          </div>
        </div>
        <p className={styles.disclaimer}>Bluebird runs AI models on this computer and can make mistakes.</p>
      </footer>

      <DayRail groups={dayGroups} activeKey={activeDay} onJump={jumpToDay} />
      <MemoryPanel
        key={`${settingsTab}-${memoryOpen ? "open" : "closed"}`}
        open={memoryOpen}
        initialTab={settingsTab}
        user={user}
        onProfileChange={setChosen}
        reasoningEffort={reasoningDefault}
        onReasoningEffortChange={setReasoningDefault}
        themeMode={themeMode}
        onThemeModeChange={changeThemeMode}
        showThinking={showThinking}
        onShowThinkingChange={changeShowThinking}
        interactiveUi={interactiveUi}
        onInteractiveUiChange={changeInteractiveUi}
        canDeleteThread={!streaming}
        onClose={closeSettings}
        onDeleteThread={() => {
          if (streaming) return;
          setMemoryOpen(false);
          setDeleteError(null);
          setDeleteOpen(true);
        }}
      />

      {compactMobile ? (
        <div
          className={styles.mobileNavLayer}
          data-open={mobileMenuOpen}
          role="dialog"
          aria-modal="true"
          aria-label="Bluebird menu"
          onClick={(event) => {
            if (event.target === event.currentTarget) setMobileMenuOpen(false);
          }}
        >
          <aside className={styles.mobileNav}>
            <div className={styles.mobileNavHead}>
              <button
                type="button"
                className={styles.mobileNavClose}
                aria-label="Close menu"
                onClick={() => setMobileMenuOpen(false)}
              >
                <CloseIcon />
              </button>
              <span className={styles.mobileNavTitle}>Menu</span>
              <span className={styles.mobileNavSpacer} aria-hidden="true" />
            </div>
            <div className={styles.mobileNavBody}>
              <p className={styles.mobileNavSection}>Conversation</p>
              <div className={styles.mobileNavGroup}>
                <button
                  type="button"
                  className={styles.mobileNavAction}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setSearchOpen(true);
                  }}
                >
                  <SearchIcon />
                  <span>Search this thread</span>
                  <ChevronRightMenuIcon className={styles.mobileNavChevron} />
                </button>
                <button
                  type="button"
                  className={styles.mobileNavAction}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openSettings("memory");
                  }}
                >
                  <MemoryMenuIcon />
                  <span>Memory</span>
                  <ChevronRightMenuIcon className={styles.mobileNavChevron} />
                </button>
                {dayGroups.length > 0 ? (
                  <button
                    type="button"
                    className={styles.mobileNavAction}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      const latest = dayGroups[dayGroups.length - 1];
                      if (latest) jumpToDay(latest.key);
                    }}
                  >
                    <span className={styles.mobileNavIconSlot}>
                      <ChevronDownIcon />
                    </span>
                    <span>Jump to latest message</span>
                  </button>
                ) : null}
              </div>

              <p className={styles.mobileNavSection}>Mode</p>
              <div className={styles.mobileNavGroup}>
                <div className={styles.mobileNavMode} role="group" aria-label="View">
                  <button type="button" aria-pressed="true">
                    Chat
                  </button>
                  <button type="button" disabled title="Work mode is coming soon">
                    Work
                  </button>
                </div>
              </div>

              <p className={styles.mobileNavSection}>Thread</p>
              <div className={styles.mobileNavGroup}>
                <button
                  type="button"
                  className={styles.mobileNavAction}
                  data-danger="true"
                  disabled={streaming}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setDeleteError(null);
                    setDeleteOpen(true);
                  }}
                >
                  <TrashMenuIcon />
                  <span>Delete thread</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {audioWarning ? (
        <div
          className={styles.confirmLayer}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="audio-warning-title"
          aria-describedby="audio-warning-description"
          onClick={(event) => {
            if (event.target === event.currentTarget) setAudioWarning(null);
          }}
        >
          <div className={styles.confirmCard}>
            <h2 className={styles.confirmTitle} id="audio-warning-title">
              This model can&apos;t listen to audio
            </h2>
            <p className={styles.confirmBody} id="audio-warning-description">
              {audioWarning}
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmCancel}
                onClick={() => {
                  setAudioWarning(null);
                  openSettings("engine");
                }}
              >
                Open Engine settings
              </button>
              <button
                type="button"
                className={styles.confirmCancel}
                autoFocus
                onClick={() => setAudioWarning(null)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteOpen ? (
        <div
          className={styles.confirmLayer}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-thread-title"
          aria-describedby="delete-thread-description"
          onClick={(event) => {
            if (event.target === event.currentTarget && !deleting) setDeleteOpen(false);
          }}
        >
          <div className={styles.confirmCard}>
            <h2 className={styles.confirmTitle} id="delete-thread-title">
              Delete this thread?
            </h2>
            <p className={styles.confirmBody} id="delete-thread-description">
              This permanently deletes every message, picture, document and memory in your
              thread. It cannot be undone.
            </p>
            {deleteError ? <p className={styles.confirmError}>{deleteError}</p> : null}
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmCancel}
                autoFocus
                disabled={deleting}
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmDelete}
                disabled={deleting}
                onClick={() => void removeThread()}
              >
                {deleting ? "Deleting..." : "Delete thread"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={styles.searchOverlay}
        data-open={searchOpen}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeSearch();
        }}
      >
        <div className={styles.searchPanel}>
          <div className={styles.searchRow}>
            <input
              ref={searchInputRef}
              className={styles.searchInput}
              type="text"
              placeholder="Search this thread..."
              aria-label="Search this thread"
              autoComplete="off"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchResults.length > 0) {
                  event.preventDefault();
                  jumpToMessage(searchResults[0].id);
                }
              }}
            />
            <button
              type="button"
              className={styles.searchClose}
              aria-label="Close search"
              onClick={closeSearch}
            >
              <CloseIcon />
            </button>
          </div>
          {searchQuery.trim().length > 0 ? (
            <div className={styles.searchResults}>
              {searchResults.length === 0 ? (
                <p className={styles.searchEmpty}>
                  No messages match “{searchQuery.trim()}”.
                </p>
              ) : (
                searchResults.map((message) => (
                  <button
                    key={message.id}
                    type="button"
                    className={styles.searchResult}
                    onClick={() => jumpToMessage(message.id)}
                  >
                    <span className={styles.searchRole}>
                      {message.role === "user" ? "You" : "Assistant"}
                    </span>
                    <span className={styles.searchSnippet}>
                      {highlightSnippet(message.content, searchQuery.trim())}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
      {lightbox ? (
        <ImageViewer
          items={lightbox.items}
          index={lightbox.index}
          onIndex={(index) => setLightbox({ items: lightbox.items, index })}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}
