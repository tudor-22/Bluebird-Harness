import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentBackend } from "@bluebird/shared";
import { describeBackend, invocationFor, shellQuote } from "./backend";
import { createProcessManager } from "./processes";
import { runCommand } from "./sandbox";

const originalPath = process.env.PATH;
afterEach(() => {
  process.env.PATH = originalPath;
});

/** Puts a fake `docker` and `ssh` first on the path: each records how it was called, then runs the command here. */
async function shims() {
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  const dir = await mkdtemp(join(process.cwd(), ".data", "agent-backend-"));
  const bin = join(dir, "bin");
  await mkdir(bin);
  for (const name of ["docker", "ssh"]) {
    await writeFile(join(bin, name), `#!/bin/sh\nprintf '%s\\n' "$@" > "${dir}/${name}.args"\neval "last=\\\${$#}"\nexec /bin/sh -c "$last"\n`);
    await chmod(join(bin, name), 0o755);
  }
  process.env.PATH = `${bin}:${originalPath}`;
  return { dir, args: async (name: string) => (await readFile(join(dir, `${name}.args`), "utf8")).trim().split("\n") };
}

describe("where commands run", () => {
  it("quotes a command so a shell sees it as one word", () => {
    expect(shellQuote("echo 'hi' && ls")).toBe(`'echo '\\''hi'\\'' && ls'`);
  });

  it("builds the right program and arguments for each backend", () => {
    expect(invocationFor(undefined, "ls", "/p")).toEqual({ file: "/bin/sh", args: ["-c", "ls"], cwd: "/p" });
    const docker = invocationFor({ type: "docker", dockerImage: "node:22" }, "npm test", "/p");
    expect(docker.file).toBe("docker");
    expect(docker.args).toEqual(["run", "--rm", "-i", "--init", "--network", "none", "-v", "/p:/work", "-w", "/work", "node:22", "sh", "-c", "npm test"]);
    expect(invocationFor({ type: "docker", dockerImage: "node:22", dockerNetwork: true }, "x", "/p").args).not.toContain("none");
    const ssh = invocationFor({ type: "ssh", sshTarget: "me@box", sshPort: 2222, sshIdentity: "/k", sshDir: "/srv/app" }, "git pull", "/p");
    expect(ssh.args).toEqual(["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-p", "2222", "-i", "/k", "me@box", "--", `sh -c 'cd '\\''/srv/app'\\'' && git pull'`]);
    const custom = invocationFor({ type: "custom", customTemplate: "daytona exec box -- sh -c {command}" }, "echo 'a b'", "/p");
    expect(custom.args[1]).toBe(`daytona exec box -- sh -c 'echo '\\''a b'\\'''`);
    expect(() => invocationFor({ type: "docker" }, "x", "/p")).toThrow(/Docker image/);
    expect(() => invocationFor({ type: "ssh" }, "x", "/p")).toThrow(/user@host/);
    expect(() => invocationFor({ type: "custom", customTemplate: "no placeholder" }, "x", "/p")).toThrow(/\{command\}/);
  });

  it("tells the model where its commands run", () => {
    expect(describeBackend(undefined)).toBe("");
    expect(describeBackend({ type: "docker", dockerImage: "node:22" })).toContain("Docker container (node:22)");
    expect(describeBackend({ type: "ssh", sshTarget: "me@box" })).toContain("me@box");
  });

  it("runs commands through docker, ssh and a custom wrapper", async () => {
    const { dir, args } = await shims();
    const docker: AgentBackend = { type: "docker", dockerImage: "alpine" };
    expect((await runCommand("echo from-docker", { cwd: dir, timeoutMs: 8000, backend: docker })).output).toContain("from-docker");
    expect(await args("docker")).toEqual(expect.arrayContaining(["--network", "none", `${dir}:/work`, "alpine"]));

    const ssh: AgentBackend = { type: "ssh", sshTarget: "me@box", sshDir: dir };
    const viaSsh = await runCommand("pwd", { cwd: "/ignored", timeoutMs: 8000, backend: ssh });
    expect(viaSsh.output).toContain(dir.split("/").pop());
    expect(await args("ssh")).toEqual(expect.arrayContaining(["BatchMode=yes", "me@box"]));

    const custom: AgentBackend = { type: "custom", customTemplate: "env WRAPPED=yes /bin/sh -c {command}" };
    expect((await runCommand('echo "wrapped=$WRAPPED"', { cwd: dir, timeoutMs: 8000, backend: custom })).output).toContain("wrapped=yes");
  });

  it("explains a missing program or a half-set-up backend instead of failing silently", async () => {
    process.env.PATH = "/usr/bin:/bin";
    const missing = await runCommand("ls", { cwd: "/tmp", timeoutMs: 5000, backend: { type: "ssh", sshTarget: "me@box" } });
    // Where ssh exists on the system path it is used; otherwise the message names it.
    expect(typeof missing.output).toBe("string");
    const half = await runCommand("ls", { cwd: "/tmp", timeoutMs: 5000, backend: { type: "docker" } });
    expect(half.output).toMatch(/Docker image/);
  });

  it("starts background jobs on the chosen backend too", async () => {
    const { dir } = await shims();
    const manager = createProcessManager();
    try {
      const started = manager.start("echo background-docker", { cwd: dir, backend: { type: "docker", dockerImage: "alpine" } });
      const result = await manager.read(started.id, { waitMs: 3000 });
      expect(result?.output).toContain("background-docker");
    } finally {
      manager.killAll();
    }
  });
});
