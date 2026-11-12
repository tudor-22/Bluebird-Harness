import { execFile } from "node:child_process";
import type { AgentBackend } from "@bluebird/shared";

/** Wraps a string so a shell reads it back as exactly that one word. */
export const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

export type Invocation = { file: string; args: string[]; cwd: string | undefined };

/** The real program and arguments that run a command on the chosen backend. */
export function invocationFor(backend: AgentBackend | undefined, command: string, cwd: string): Invocation {
  switch (backend?.type) {
    case "docker": {
      if (!backend.dockerImage) throw new Error("Choose a Docker image in Settings, Workspace.");
      return {
        file: "docker",
        args: [
          "run", "--rm", "-i", "--init",
          ...(backend.dockerNetwork ? [] : ["--network", "none"]),
          "-v", `${cwd}:/work`, "-w", "/work",
          backend.dockerImage, "sh", "-c", command,
        ],
        cwd: undefined,
      };
    }
    case "ssh": {
      if (!backend.sshTarget) throw new Error("Set the machine to connect to (user@host) in Settings, Workspace.");
      const remote = backend.sshDir ? `cd ${shellQuote(backend.sshDir)} && ${command}` : command;
      return {
        file: "ssh",
        args: [
          "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
          ...(backend.sshPort ? ["-p", String(backend.sshPort)] : []),
          ...(backend.sshIdentity ? ["-i", backend.sshIdentity.replace(/^~(?=\/)/, process.env.HOME ?? "~")] : []),
          backend.sshTarget, "--", `sh -c ${shellQuote(remote)}`,
        ],
        cwd: undefined,
      };
    }
    case "custom": {
      const template = backend.customTemplate ?? "";
      if (!template.includes("{command}")) throw new Error("The wrapper must contain {command}, where the command goes.");
      return {
        file: "/bin/sh",
        args: ["-c", template.split("{command}").join(shellQuote(command)).split("{cwd}").join(shellQuote(cwd))],
        cwd,
      };
    }
    default:
      return { file: "/bin/sh", args: ["-c", command], cwd };
  }
}

/** Whether a program can be found, so a missing Docker or SSH is reported plainly. */
export function hasProgram(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("/bin/sh", ["-c", `command -v ${name}`], (error) => resolve(!error));
  });
}

/** What the model is told about where its commands run. */
export function describeBackend(backend: AgentBackend | undefined): string {
  switch (backend?.type) {
    case "docker":
      return `run_command runs inside a fresh Docker container (${backend.dockerImage}) with the starting folder mounted at /work${backend.dockerNetwork ? "" : " and no network"}; nothing outside that folder or installed in a previous command is there.`;
    case "ssh":
      return `run_command runs on another machine over SSH (${backend.sshTarget}), not on this computer. The file tools still work on this computer's files.`;
    case "custom":
      return "run_command runs through a wrapper the person set up, so it runs somewhere other than this computer. The file tools still work on this computer's files.";
    default:
      return "";
  }
}
