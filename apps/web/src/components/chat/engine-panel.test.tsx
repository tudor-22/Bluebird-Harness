import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EnginePanel } from "./engine-panel";

const base = { defaultBaseUrl: "", hasKey: false, error: null, sizeBytes: null };
const model = (name: string) => ({
  name, sizeBytes: null, parameterSize: null, family: null, vision: false, thinking: false, embedding: false,
});

function response(overrides: { mistralReady?: boolean } = {}) {
  return {
    selected: { engine: "ollama", model: "llama3.2:3b" },
    engines: [
      { ...base, id: "ollama", name: "Ollama", kind: "local", baseUrl: "http://127.0.0.1:11434", defaultBaseUrl: "http://127.0.0.1:11434", needsKey: false, status: "ready", models: [model("llama3.2:3b")] },
      { ...base, id: "llamacpp", name: "llama.cpp", kind: "local", baseUrl: "http://127.0.0.1:8080/v1", defaultBaseUrl: "http://127.0.0.1:8080/v1", needsKey: false, status: "unreachable", models: [] },
      {
        ...base, id: "mistral", name: "Mistral API", kind: "cloud", baseUrl: "https://api.mistral.ai/v1",
        defaultBaseUrl: "https://api.mistral.ai/v1", needsKey: true,
        hasKey: Boolean(overrides.mistralReady), status: overrides.mistralReady ? "ready" : "needs-key",
        models: overrides.mistralReady ? [model("gpt-4o-mini")] : [],
      },
      { ...base, id: "custom", name: "Custom API", kind: "custom", baseUrl: "", needsKey: false, status: "unreachable", error: "Enter the address of your API.", models: [] },
    ],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("EnginePanel", () => {
  it("lists every engine with its status and only available models in the default dropdown", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(response())));
    render(<EnginePanel />);

    expect(await screen.findByText("Connected, 1 model")).toBeTruthy();
    expect(screen.getByText("llama.cpp")).toBeTruthy();
    expect(screen.getByText("Not running")).toBeTruthy();
    expect(screen.getByText("Needs an API key")).toBeTruthy();
    expect(screen.getByText("Custom API")).toBeTruthy();

    const select = screen.getByRole("combobox", { name: "Default model" });
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["llama3.2:3b"]);
  });

  it("saves a key and shows the models that appear", async () => {
    let ready = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT" && url === "/api/engines/mistral") {
        ready = true;
        return Response.json(response({ mistralReady: true }));
      }
      return Response.json(response({ mistralReady: ready }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<EnginePanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Set up Mistral API" }));
    fireEvent.change(screen.getByLabelText("Mistral API API key"), { target: { value: "sk-abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and connect" }));

    await waitFor(() => expect(screen.getByText("gpt-4o-mini")).toBeTruthy());
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(String(put[1]?.body))).toEqual({ baseUrl: "", apiKey: "sk-abc" });
  });

  it("shows why saving failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "PUT"
          ? Response.json({ ok: false, error: "The address must be a full URL." }, { status: 400 })
          : Response.json(response()),
      ),
    );
    render(<EnginePanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up Custom API" }));
    fireEvent.change(screen.getByLabelText("Custom API address"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and connect" }));
    expect(await screen.findByText("The address must be a full URL.")).toBeTruthy();
  });
});
