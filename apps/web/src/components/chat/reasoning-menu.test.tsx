import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReasoningMenu } from "./reasoning-menu";

const model = (name: string, extra: object = {}) => ({
  name,
  thinkingLevels: [],
  sizeBytes: null,
  parameterSize: null,
  family: null,
  vision: false,
  thinking: false,
  embedding: false,
  ...extra,
});

const enginesResponse = {
  selected: { engine: "ollama", model: "qwen3:8b" },
  engines: [
    {
      id: "ollama", name: "Ollama", kind: "local", baseUrl: "http://127.0.0.1:11434",
      defaultBaseUrl: "http://127.0.0.1:11434", hasKey: false, needsKey: false, status: "ready", error: null,
      models: [model("qwen3:8b", { thinking: true, thinkingLevels: ["none", "low", "medium", "high"] }), model("llava:7b", { vision: true })],
    },
    {
      id: "lmstudio", name: "LM Studio", kind: "local", baseUrl: "http://127.0.0.1:1234/v1",
      defaultBaseUrl: "http://127.0.0.1:1234/v1", hasKey: false, needsKey: false, status: "ready", error: null,
      models: [model("phi-4")],
    },
    {
      id: "mistral", name: "Mistral API", kind: "cloud", baseUrl: "https://api.mistral.ai/v1",
      defaultBaseUrl: "https://api.mistral.ai/v1", hasKey: false, needsKey: true, status: "needs-key", error: null,
      models: [],
    },
  ],
};

function stubFetch() {
  const calls: { url: string; method: string; body?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined });
      if (init?.method === "PUT") {
        const { engine, model: name } = JSON.parse(String(init.body)) as { engine: string; model: string };
        return Response.json({ ...enginesResponse, selected: { engine, model: name } });
      }
      return Response.json(enginesResponse);
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("ReasoningMenu", () => {
  it("shows only the model chosen in settings and offers no model list", async () => {
    stubFetch();
    render(<ReasoningMenu variant="composer" value="medium" onChange={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /qwen3:8b, reasoning Medium/ }));
    const dialog = screen.getByRole("dialog", { name: "Model settings" });
    expect(within(dialog).getByText("qwen3:8b")).toBeTruthy();
    // Other models and engines are not offered here; that choice lives in Settings.
    expect(within(dialog).queryByText("phi-4")).toBeNull();
    expect(within(dialog).queryByText("LM Studio")).toBeNull();
    expect(within(dialog).queryByRole("radio", { name: /llava/ })).toBeNull();
    // Only the thinking level can be changed.
    expect(within(dialog).getAllByRole("radio").map((r) => r.textContent)).toEqual([
      "None", "Low", "Medium", "High",
    ]);
  });

  it("offers None among the thinking levels for a thinking model", async () => {
    stubFetch();
    const changed = vi.fn();
    render(<ReasoningMenu variant="composer" value="medium" onChange={changed} />);

    fireEvent.click(await screen.findByRole("button", { name: /qwen3:8b/ }));
    fireEvent.click(screen.getByRole("radio", { name: "None" }));

    expect(changed).toHaveBeenCalledWith("none");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  function stubSelected(levels: string[], name = "m:1b") {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          selected: { engine: "ollama", model: name },
          engines: [
            {
              ...enginesResponse.engines[0],
              models: [model(name, { thinking: levels.length > 0, thinkingLevels: levels })],
            },
          ],
        }),
      ),
    );
  }

  it("offers only On and None for a model with a thinking switch", async () => {
    stubSelected(["none", "medium"]);
    render(<ReasoningMenu variant="composer" value="high" onChange={vi.fn()} />);
    // The saved default is High, which this model rounds to its On setting.
    fireEvent.click(await screen.findByRole("button", { name: /m:1b, reasoning On/ }));
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["None", "On"]);
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
  });

  it("does not offer None for a model that always thinks", async () => {
    stubSelected(["low", "medium", "high"], "o3-mini");
    render(<ReasoningMenu variant="composer" value="none" onChange={vi.fn()} />);
    // None rounds up to the lowest level the model allows.
    fireEvent.click(await screen.findByRole("button", { name: /o3-mini, reasoning Low/ }));
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Low", "Medium", "High"]);
  });

  it("hides the thinking choice when the model cannot be adjusted", async () => {
    stubSelected([], "deepseek-reasoner");
    render(<ReasoningMenu variant="composer" value="medium" onChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /deepseek-reasoner/ }));
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByText(/can't be adjusted/)).toBeTruthy();
  });

  it("points to Engine settings when nothing is available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ selected: null, engines: [] })),
    );
    const open = vi.fn();
    render(<ReasoningMenu variant="composer" value="medium" onChange={vi.fn()} onOpenEngines={open} />);

    fireEvent.click(await screen.findByRole("button", { name: /No model/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Connect an engine" }));
    expect(open).toHaveBeenCalledOnce();
  });

  it("exposes the account setting as an accessible radio group", () => {
    const changed = vi.fn();
    render(<ReasoningMenu variant="account" value="low" onChange={changed} />);

    expect(screen.getByRole("radio", { name: "Low" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "None" }));
    expect(changed).toHaveBeenCalledWith("none");
  });
});
