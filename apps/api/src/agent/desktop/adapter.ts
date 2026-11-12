/**
 * What Bluebird needs from an operating system to see and use its apps. Each
 * platform supplies one: macOS through the accessibility API, and others as
 * they are added. The tools only ever talk to this interface.
 */

export type AppInfo = { name: string; bundle: string; pid: number; frontmost: boolean; hidden: boolean };
export type WindowInfo = { index: number; title: string; x?: number; y?: number; width?: number; height?: number };

export type LookOptions = {
  app: string;
  window?: number;
  /** Look only inside this mark from the last outline. */
  within?: number;
  actionsOnly?: boolean;
  /** Include the app's menu bar. */
  menus?: boolean;
  maxNodes?: number;
};

export type Look = { app: string; outline: string; marks: number; truncated: boolean };

export type DesktopAdapter = {
  readonly platform: string;
  /** Whether the app running Bluebird may read other apps, and what to do if not. */
  status(options?: { prompt?: boolean }): Promise<{ ready: boolean; message: string }>;
  apps(): Promise<AppInfo[]>;
  windows(app: string): Promise<WindowInfo[]>;
  look(options: LookOptions): Promise<Look>;
  /** Use the element's own action (press, pick, show menu) without moving the mouse. */
  act(mark: number, action?: string): Promise<void>;
  click(target: { mark?: number; x?: number; y?: number }, options?: { double?: boolean; right?: boolean }): Promise<void>;
  setValue(mark: number, text: string): Promise<string>;
  type(text: string, target?: { mark?: number; app?: string }): Promise<void>;
  key(keys: string, app?: string): Promise<void>;
  scroll(options: { mark?: number; dx?: number; dy?: number }): Promise<void>;
  read(mark: number): Promise<Record<string, string>>;
  launch(app: string): Promise<{ launched: boolean }>;
  activate(app: string): Promise<void>;
  quit(app: string, force?: boolean): Promise<void>;
  /** A picture of an app's main window, or the whole screen. */
  screenshot(app?: string): Promise<{ base64: string; mime: string }>;
  clipboardGet(): Promise<string>;
  clipboardSet(text: string): Promise<void>;
  close(): Promise<void>;
};
