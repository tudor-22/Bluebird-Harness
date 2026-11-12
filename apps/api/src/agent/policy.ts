import { homedir, tmpdir } from "node:os";
import { sep } from "node:path";
import type { AgentLevel } from "@bluebird/shared";
import { isHardline } from "./sandbox";
import type { Prepared } from "./tools";

export type Decision = { action: "allow" } | { action: "ask" } | { action: "deny"; reason: string };

/** "Always allow" choices made this session, such as `edit` or `cmd:npm test`. */
export type Grants = Set<string>;

/** Commands that change the system, delete things, send things away or run downloaded code. */
const RISKY: RegExp[] = [
  /\bsudo\b|\bsu\s/,
  /\b(rm|rmdir|unlink|shred|truncate)\b/,
  /-delete\b|\bfind\b.*-exec\s+rm/,
  /\b(chmod|chown|chgrp|chflags)\b/,
  /\b(kill|killall|pkill)\b/,
  /\|\s*(sudo\s+)?(sh|bash|zsh|python3?|node|ruby|perl)\b/,
  /\b(dd|diskutil|launchctl|systemsetup|networksetup|scutil|csrutil|crontab|spctl|pmset|tmutil)\b/,
  /\bdefaults\s+(write|delete)\b|\bosascript\b/,
  /\bgit\s+(push|reset\s+--hard|clean|rebase|checkout\s+--|branch\s+-D|stash\s+(drop|clear))/,
  /\b(npm|pnpm|yarn)\s+(publish|unpublish|deprecate)\b|\bnpm\s+login\b/,
  /\b(brew|pip3?|npm|pnpm|yarn|gem|cargo|apt|apt-get|dnf|yum)\s+(uninstall|remove|purge|rm)\b/,
  /\b(scp|rsync|sftp|ssh|nc|ncat|telnet)\b/,
  /\b(curl|wget)\b[^|;&]*(-X\s*(POST|PUT|DELETE|PATCH)|--data|-d\s|-F\s|--upload|-T\s)/,
  />>?\s*(\/(?!dev\/null|tmp\/|private\/tmp\/)|~\/?)/,
  /\/etc\/|\/System\/|\/Library\/|\/usr\/(local\/)?(bin|lib)\//,
  /~\/\.(ssh|aws|gnupg|zshrc|bashrc|zprofile|profile|config)\b|\$HOME\/\./,
];

/** Programs that are everyday work and cannot reach outside the working folder by themselves. */
const SAFE_COMMANDS = new Set([
  "cd", "ls", "pwd", "cat", "head", "tail", "wc", "grep", "egrep", "fgrep", "rg", "find", "sort", "uniq", "diff", "cmp",
  "tree", "file", "stat", "du", "df", "echo", "printf", "which", "whereis", "type", "date", "whoami", "uname", "hostname",
  "id", "basename", "dirname", "realpath", "readlink", "sleep", "true", "false", "test", "[", "jq", "tr", "cut", "column",
  "ps", "lsof", "mkdir", "touch", "cp", "mv", "ln", "sed", "awk", "xxd", "md5", "shasum", "sha256sum", "unzip", "zip", "tar",
  "node", "python", "python3", "pip", "pip3", "pytest", "tsc", "vitest", "jest", "eslint", "prettier", "make", "cargo", "go",
  "swift", "swiftc", "rustc", "gcc", "g++", "clang", "javac", "java", "npm", "pnpm", "yarn", "bun", "deno", "git",
]);

/** Git commands that only look or record locally. */
const SAFE_GIT = new Set([
  "status", "log", "diff", "show", "branch", "rev-parse", "ls-files", "blame", "add", "commit", "fetch", "remote", "tag",
  "describe", "shortlog", "grep", "ls-tree", "cat-file", "init", "stash", "switch", "restore", "worktree", "config",
]);

/** Ways to run text as code, or to hide what a command does, that the allowlist cannot judge. */
const OPAQUE: RegExp[] = [
  /\$\(|`/,
  /\b(python3?|node|deno|bun|ruby|perl|php|osascript|powershell|pwsh)\s+(-[a-zA-Z]*[ecrpE]\b|--eval|--print|-Command)/,
  /\b(bash|sh|zsh|fish|dash)\s+-[a-z]*c\b|\beval\b|\bsource\b|\bexec\b/,
  /\b(base64|openssl)\b.*(-d|--decode|enc)\b|\bxargs\b|\btee\b|\bsed\b[^|;&]*\s-[a-zA-Z]*i|\bawk\b[^|;&]*system\s*\(/,
  /\bfind\b[^|;&]*-(exec|execdir|ok|fprint|fls)\b/,
  /\b(npm|pnpm|yarn|bun)\s+(dlx|exec|x|create|npx)\b|\bnpx\b/,
  />>?\s*\S*\.\.\//,
];

/** Arguments of these commands must stay relative to the working folder. */
const LOCAL_ONLY = new Set(["cp", "mv", "ln", "mkdir", "touch", "tar", "unzip", "zip"]);

function isKnownSafe(command: string): boolean {
  if (OPAQUE.some((pattern) => pattern.test(command))) return false;
  const segments = command.split(/&&|\|\||[;|&\n]/).map((part) => part.trim()).filter(Boolean);
  if (segments.length === 0) return false;
  for (const segment of segments) {
    // Redirection targets are checked by RISKY (outside paths) and OPAQUE (..); drop them here.
    const words = segment.replace(/\d*>>?\s*\S+/g, " ").split(/\s+/).filter(Boolean);
    while (words.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) words.shift();
    const first = words[0];
    if (!first) continue;
    // A script the model just wrote, run from the working folder.
    if (/^\.\/[\w./-]+$/.test(first)) continue;
    if (!SAFE_COMMANDS.has(first)) return false;
    if (first === "git" && !SAFE_GIT.has(words.find((word, index) => index > 0 && !word.startsWith("-")) ?? "")) return false;
    if (LOCAL_ONLY.has(first) && words.slice(1).some((word) => /^(\/|~)|\.\.(\/|$)/.test(word.replace(/^-+\w*=?/, "")))) return false;
  }
  return true;
}

/**
 * True for commands the Auto level does not run on its own: anything on the risky list, and
 * anything the allowlist of everyday programs does not recognise. Unknown means ask.
 */
export function isRiskyCommand(command: string): boolean {
  return RISKY.some((pattern) => pattern.test(command)) || !isKnownSafe(command);
}

/**
 * True for file changes that reach beyond everyday work: outside the home
 * folder and temporary space, or into the hidden settings of the account.
 */
export function isSensitiveWrite(target: string, start: string): boolean {
  const home = homedir();
  const inside = (base: string) => target === base || target.startsWith(base + sep);
  if (inside(start)) return false;
  if (inside(tmpdir()) || inside("/tmp") || inside("/private/tmp") || inside("/var/folders") || inside("/private/var/folders")) {
    return false;
  }
  if (!inside(home)) return true;
  const first = target.slice(home.length + 1).split(sep)[0] ?? "";
  return first.startsWith(".") || first === "Library";
}

/**
 * The one place that decides whether a call may run. Never-run commands are
 * denied at every level. Reading is free. Beyond that the level decides:
 * Always ask asks, Auto asks only for risky things, Full access never asks.
 */
export function authorize(
  call: Prepared,
  level: AgentLevel,
  grants: Grants,
  start: string,
): Decision {
  if (call.kind === "exec" && isHardline(call.preview ?? "")) {
    return { action: "deny", reason: "That command is never run: it could destroy the computer." };
  }
  if (call.kind === "read" || level === "full" || grants.has(call.scope)) return { action: "allow" };
  if (level === "auto") {
    const risky =
      call.autoSafe !== undefined
        ? !call.autoSafe
        : call.kind === "exec"
          ? isRiskyCommand(call.preview ?? "")
          : isSensitiveWrite(call.target ?? "", start);
    if (!risky) return { action: "allow" };
  }
  return { action: "ask" };
}
