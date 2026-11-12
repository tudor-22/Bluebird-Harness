import { dirname, join, resolve } from "node:path";
import { createApprovalBroker, type ApprovalBroker } from "./approvals";
import { readStored, writeStored } from "../model/settings-store";
import type { ComputerStatus } from "@bluebird/shared";
import { browserSupported, browserTools, createBrowser, needsBrowserDownload, type BrowserController } from "./browser";
import { chromeTarget, installBrowser } from "./web/provision";
import { createDesktop, desktopTools } from "./desktop";
import { createMcpHub, type McpHub, type McpServerConfig } from "./mcp";
import { createProcessManager, type ProcessManager } from "./processes";
import { createScheduleStore, scheduleTools, type ScheduleStore } from "./schedule";
import { planTools } from "./plan";
import { createMarketplace, type Marketplace } from "./marketplace";
import { createSkillStore, skillTools, type SkillStore } from "./skills";
import type { ExtraTool } from "./tools";
import type { Grants } from "./policy";
import { createAgentSettingsStore, type AgentSettingsStore } from "./settings";

/** Everything the tools share while the server runs. */
export type AgentRuntime = {
  settings: AgentSettingsStore;
  approvals: ApprovalBroker;
  /** "Always allow" choices made since the server started. */
  grants: Grants;
  /** What each conversation has read, so edits can check the file has not changed. */
  reads: Map<string, Map<string, number>>;
  /** Saved how-tos. */
  skills: SkillStore;
  /** Claude Code, Codex and GitHub skills that can be installed. */
  market: Marketplace;
  /** Recurring jobs. */
  schedules: ScheduleStore;
  /** The browser the model drives, started on first use. */
  browser: BrowserController;
  /** Whether the browser and app control are ready, and one-click ways to get them ready. */
  computer: {
    status(): Promise<ComputerStatus>;
    setupBrowser(): Promise<void>;
    allowDesktop(): Promise<ComputerStatus>;
  };
  /** Outside tool servers. */
  mcp: McpHub;
  /** The saved outside tool servers. */
  mcpServers(): Promise<McpServerConfig[]>;
  saveMcpServers(servers: McpServerConfig[]): Promise<void>;
  /** Everything beyond the built-in tools: saved skills and connected servers. */
  extraTools(userId: string): Promise<ExtraTool[]>;
  /** Commands left running in the background. */
  processes: ProcessManager;
  /** Where app icons are kept once made. */
  iconDir: string;
  /** Where a reply's undo snapshots are kept. */
  checkpointDir(messageId: string): string;
};

export function createAgentRuntime(configuredFile: string): AgentRuntime {
  // Everything derived from this path must be absolute: write rules and undo compare absolute paths.
  const settingsFile = resolve(configuredFile);
  const base = join(dirname(settingsFile), "checkpoints");
  const schedules = createScheduleStore(join(dirname(settingsFile), "schedules.json"));
  const skills = createSkillStore(join(dirname(settingsFile), "skills"));
  const mcp = createMcpHub();
  const browserDir = join(dirname(settingsFile), "browser");
  const browser = createBrowser({ managedDir: browserDir });
  const desktop = createDesktop(join(dirname(settingsFile), "helpers"));
  const computerStatus = async (promptDesktop = false): Promise<ComputerStatus> => {
    const browserState: ComputerStatus["browser"] = !browserSupported()
      ? { state: "unsupported", detail: "There is no browser download for this kind of computer. Install Chrome, Edge or Brave." }
      : (await needsBrowserDownload(browserDir))
        ? { state: "needs-download", detail: "Bluebird will download its own browser (about 200 MB) the first time it needs one." }
        : { state: "ready", detail: "A browser is ready." };
    let desktopState: ComputerStatus["desktop"];
    if (!desktop) desktopState = { platform: process.platform, state: "unsupported", detail: "Controlling apps is not available on this computer." };
    else {
      try {
        const status = await desktop.status({ prompt: promptDesktop });
        desktopState = { platform: desktop.platform, state: status.ready ? "ready" : "needs-permission", detail: status.message };
      } catch (error) {
        desktopState = { platform: desktop.platform, state: "unavailable", detail: (error as Error).message };
      }
    }
    return { browser: browserState, desktop: desktopState };
  };
  return {
    computer: {
      status: () => computerStatus(false),
      async setupBrowser() {
        if (chromeTarget()) await installBrowser(browserDir);
      },
      allowDesktop: () => computerStatus(true),
    },
    settings: createAgentSettingsStore(settingsFile),
    approvals: createApprovalBroker(),
    grants: new Set<string>(),
    reads: new Map(),
    processes: createProcessManager(),
    skills,
    market: createMarketplace(skills),
    schedules,
    browser,
    mcp,
    async mcpServers() {
      return ((await readStored(settingsFile)).mcp?.servers ?? []) as McpServerConfig[];
    },
    async saveMcpServers(servers) {
      await writeStored(settingsFile, { ...(await readStored(settingsFile)), mcp: { servers } });
    },
    async extraTools(userId) {
      const servers = (((await readStored(settingsFile)).mcp?.servers ?? []) as McpServerConfig[]);
      return [
        ...planTools(),
        ...skillTools(skills),
        ...scheduleTools(schedules, userId),
        // Only offered when this computer has a browser to drive, or a screen to use.
        ...(browserSupported() ? browserTools(browser, { managedDir: browserDir }) : []),
        ...(desktop ? desktopTools(desktop) : []),
        ...(await mcp.tools(servers)),
      ];
    },
    iconDir: join(dirname(settingsFile), "app-icons"),
    checkpointDir: (messageId) => join(base, messageId.replace(/[^a-zA-Z0-9-]/g, "")),
  };
}
