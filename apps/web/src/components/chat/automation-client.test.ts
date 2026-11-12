import { describe, expect, it } from "vitest";
import { parseEnv, splitCommand } from "./automation-client";

describe("tool server setup helpers", () => {
  it("splits a command line like a shell would, keeping quoted parts together", () => {
    expect(splitCommand("npx -y @modelcontextprotocol/server-filesystem ~/Documents")).toEqual({
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "~/Documents"],
    });
    expect(splitCommand(`node "/path with spaces/server.js" --flag 'a b'`)).toEqual({
      command: "node",
      args: ["/path with spaces/server.js", "--flag", "a b"],
    });
    expect(splitCommand("")).toEqual({ command: "", args: [] });
  });

  it("reads KEY=value lines and ignores the rest", () => {
    expect(parseEnv("TOKEN=abc=123\n# comment\nEMPTY\n  NAME = bluebird ")).toEqual({ TOKEN: "abc=123", NAME: "bluebird" });
  });
});
