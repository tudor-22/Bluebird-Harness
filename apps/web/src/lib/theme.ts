export type ThemeMode = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "bluebird-theme-mode";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "auto" || value === "light" || value === "dark";
}

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === "auto") return prefersDark ? "dark" : "light";
  return mode;
}

export function readThemeMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
}

export function saveThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Appearance still applies for this session when storage is unavailable.
  }
}

export function applyThemeMode(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  const resolved = resolveTheme(mode, prefersDark);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "dark" ? "#181818" : "#12829e");
  return resolved;
}

/** Whether the model may answer with interactive panels. On unless the person turns it off. */
export const INTERACTIVE_UI_KEY = "bluebird-interactive-ui";

export function readInteractiveUi(): boolean {
  try {
    // On unless the person has turned it off.
    return window.localStorage.getItem(INTERACTIVE_UI_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveInteractiveUi(value: boolean): void {
  try {
    window.localStorage.setItem(INTERACTIVE_UI_KEY, value ? "1" : "0");
  } catch {
    // The choice still applies for this session when storage is unavailable.
  }
}

/** Whether the thinking view starts open on each reply. Off unless the person turns it on. */
export const SHOW_THINKING_KEY = "bluebird-show-thinking";

export function readShowThinking(): boolean {
  try {
    return window.localStorage.getItem(SHOW_THINKING_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveShowThinking(value: boolean): void {
  try {
    window.localStorage.setItem(SHOW_THINKING_KEY, value ? "1" : "0");
  } catch {
    // The choice still applies for this session when storage is unavailable.
  }
}

/** Whether web search is on for new messages. Stays as the person left it. */

/** Whether the file and command tools are on for new messages. */
export const AGENT_TOOLS_KEY = "bluebird-agent-tools";

export function readAgentTools(): boolean {
  try {
    return window.localStorage.getItem(AGENT_TOOLS_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveAgentTools(value: boolean): void {
  try {
    window.localStorage.setItem(AGENT_TOOLS_KEY, value ? "1" : "0");
  } catch {
    // The choice still applies for this session when storage is unavailable.
  }
}
