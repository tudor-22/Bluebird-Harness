import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOllamaRegistry } from "./registry";

afterEach(() => vi.unstubAllGlobals());

function stubOllama(models: Record<string, string[]>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/tags")) {
        return Response.json({
          models: Object.keys(models).map((name) => ({
            name,
            size: 100,
            details: { family: "x", parameter_size: "7B" },
          })),
        });
      }
      if (url.endsWith("/api/show")) {
        const { model } = JSON.parse(String(init?.body)) as { model: string };
        return Response.json({ capabilities: models[model] });
      }
      return new Response("nope", { status: 404 });
    }),
  );
}

async function settingsPath(contents?: object): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bluebird-"));
  const file = join(dir, "settings.json");
  if (contents) await writeFile(file, JSON.stringify(contents));
  return file;
}

describe("the Ollama model registry", () => {
  it("auto-detects models and picks the first chat model", async () => {
    stubOllama({
      "bge-m3:latest": ["embedding"],
      "qwen3:8b": ["completion", "thinking"],
      "llava:7b": ["completion", "vision"],
    });
    const registry = createOllamaRegistry({
      baseUrl: "http://ollama.test",
      settingsFile: await settingsPath(),
    });
    const snapshot = await registry.snapshot();
    expect(snapshot.reachable).toBe(true);
    expect(snapshot.selected).toBe("qwen3:8b");
    expect(snapshot.models.find((m) => m.name === "bge-m3:latest")?.embedding).toBe(true);
    expect(snapshot.models.find((m) => m.name === "qwen3:8b")?.thinking).toBe(true);
    expect(snapshot.models.find((m) => m.name === "llava:7b")?.vision).toBe(true);
  });

  it("remembers a chosen model and ignores a missing one", async () => {
    stubOllama({ "a:1b": ["completion"], "b:1b": ["completion"] });
    const file = await settingsPath();
    const registry = createOllamaRegistry({ baseUrl: "http://ollama.test", settingsFile: file });
    await registry.select("b:1b");
    expect((await registry.snapshot()).selected).toBe("b:1b");
    await expect(registry.select("missing:1b")).rejects.toThrow(/not an installed/);

    const gone = createOllamaRegistry({
      baseUrl: "http://ollama.test",
      settingsFile: await settingsPath({ model: "removed:1b" }),
    });
    expect((await gone.snapshot()).selected).toBe("a:1b");
  });

  it("reports an unreachable server instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))));
    const registry = createOllamaRegistry({
      baseUrl: "http://ollama.test",
      settingsFile: await settingsPath(),
    });
    expect(await registry.snapshot()).toMatchObject({ reachable: false, models: [], selected: null });
  });
});
