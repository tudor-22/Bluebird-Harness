import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** A problem the model can read and recover from, such as a missing file. */
export class ToolError extends Error {}

const SECRET_DIRS = new Set([".ssh", ".aws", ".gnupg", ".kube", ".docker"]);

/** Files that hold secrets are not read or written by the file tools, except with Full access. */
export function isSecretPath(path: string): boolean {
  const parts = path.split(sep);
  if (parts.some((part) => SECRET_DIRS.has(part))) return true;
  const name = basename(path);
  if (name === ".env" || (name.startsWith(".env.") && name !== ".env.example")) return true;
  return /^(id_rsa|id_ed25519|id_ecdsa)(\.pub)?$/.test(name) || /\.(pem|key|p12|pfx)$/.test(name);
}

/** Writing into git internals or the app's own folders can run code later. */
export function isProtectedWrite(path: string): boolean {
  const parts = path.split(sep);
  return parts.includes(".git") || parts.includes(".bluebird") || parts.includes(".claude");
}

export type Paths = {
  /** Where relative paths start, and where commands run by default. */
  root: string;
  /** The real, absolute path for a path the model gave. Throws for protected ones. */
  resolve(path: string, options?: { write?: boolean }): string;
  /** A path as the person should read it: relative to the start folder, or ~/…, or absolute. */
  display(absolute: string): string;
};

/**
 * Finds files anywhere on the computer, like a shell would. Relative paths
 * start in `rootPath`, `~` is the home folder, and links are followed. Unless
 * `unrestricted`, credential files and git internals stay off limits.
 */
export function createPaths(rootPath: string, options: { unrestricted?: boolean } = {}): Paths {
  if (!isAbsolute(rootPath) || !existsSync(rootPath)) {
    throw new ToolError("The starting folder does not exist.");
  }
  const root = realpathSync(rootPath);
  const home = homedir();

  return {
    root,
    resolve(path, resolveOptions = {}) {
      if (!path || path.includes("\0")) throw new ToolError("A path is required.");
      const wanted = resolve(root, path.replace(/^~(?=$|\/)/, home));
      // Resolve the nearest folder that exists, then put the rest back.
      let existing = wanted;
      const rest: string[] = [];
      while (!existsSync(existing)) {
        const parent = dirname(existing);
        if (parent === existing) break;
        rest.unshift(basename(existing));
        existing = parent;
      }
      const real = join(realpathSync(existing), ...rest);
      if (!options.unrestricted) {
        if (isSecretPath(real)) {
          throw new ToolError(`"${path}" may hold secrets and is not available to the file tools.`);
        }
        if (resolveOptions.write && isProtectedWrite(real)) {
          throw new ToolError(`"${path}" is protected: the file tools may not write inside .git, .bluebird or .claude.`);
        }
      }
      return real;
    },
    display(absolute) {
      const rel = relative(root, absolute);
      if (!rel.startsWith("..") && !isAbsolute(rel)) return rel === "" ? "." : rel;
      return absolute.startsWith(home + sep) ? `~${absolute.slice(home.length)}` : absolute;
    },
  };
}
