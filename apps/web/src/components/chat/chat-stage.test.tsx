import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatStage } from "./chat-stage";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      media: "(max-width: 720px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  Element.prototype.scrollTo = vi.fn();
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
});

const THINKING_ENGINES = {
  selected: { engine: "ollama", model: "think:8b" },
  engines: [
    {
      id: "ollama", name: "Ollama", kind: "local", baseUrl: "x", defaultBaseUrl: "x",
      hasKey: false, needsKey: false, status: "ready", error: null,
      models: [
        { name: "think:8b", sizeBytes: null, parameterSize: null, family: null, vision: false, audio: false, thinking: true, thinkingLevels: ["none", "low", "medium", "high"], embedding: false },
      ],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ChatStage mobile controls", () => {
  it("opens the shared Account settings from the mobile profile control", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "/api/thread") return Response.json({ messages: [], daySummaries: {} });
        if (url === "/api/thread/greeting") return Response.json({ message: null });
        if (url === "/api/engines") return Response.json(THINKING_ENGINES);
        if (url.startsWith("/api/memory")) return Response.json({ items: [] });
        return Response.json({ success: false });
      }),
    );

    render(
      <ChatStage
        user={{ name: "Mobile User", email: "mobile@example.com", image: null }}
        initialReasoningEffort="medium"
      />,
    );

    const profile = await screen.findByRole("button", { name: "Open settings" });
    fireEvent.click(profile);
    expect(await screen.findByRole("heading", { name: "Mobile User" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(await screen.findByRole("heading", { name: "Account" })).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Reasoning" }) as HTMLSelectElement).value).toBe(
      "medium",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /reasoning Medium/ })).toBeTruthy(),
    );
  });

  it("persists a composer reasoning choice through the account endpoint", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        if (url === "/api/thread") return Response.json({ messages: [], daySummaries: {} });
        if (url === "/api/thread/greeting") return Response.json({ message: null });
        if (url === "/api/engines") return Response.json(THINKING_ENGINES);
        if (url.startsWith("/api/memory")) return Response.json({ items: [] });
        if (url === "/api/me" && init?.method === "PATCH") {
          return Response.json({ user: { reasoningEffort: "high" } });
        }
        return Response.json({ success: false });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ChatStage
        user={{ name: "Mobile User", email: "mobile@example.com", image: null }}
        initialReasoningEffort="medium"
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /reasoning Medium/ }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "High" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/me",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ reasoningEffort: "high" }),
        }),
      ),
    );
    expect(
      screen.getByRole("button", { name: /reasoning High/ }),
    ).toBeTruthy();
  });

  it("pins a restored thread to the newest message after images load", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(1200);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "/api/thread") {
          return Response.json({
            messages: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                conversationId: "22222222-2222-4222-8222-222222222222",
                role: "assistant",
                content: "Earlier message",
                attachments: [],
                createdAt: "2026-10-21T10:00:00.000Z",
                metadata: {},
              },
              {
                id: "33333333-3333-4333-8333-333333333333",
                conversationId: "22222222-2222-4222-8222-222222222222",
                role: "assistant",
                content: "Newest message",
                attachments: [],
                createdAt: "2026-10-21T11:00:00.000Z",
                metadata: {},
              },
            ],
            daySummaries: {},
          });
        }
        if (url === "/api/thread/greeting") return Response.json({ message: null });
        if (url === "/api/engines") return Response.json(THINKING_ENGINES);
        return Response.json({ success: false });
      }),
    );

    render(
      <ChatStage
        user={{ name: "Mobile User", email: "mobile@example.com", image: null }}
        initialReasoningEffort="medium"
      />,
    );

    const thread = await screen.findByTestId("chat-thread");
    await waitFor(() => expect(thread.scrollTop).toBe(1200));

    thread.scrollTop = 0;
    const image = document.createElement("img");
    thread.appendChild(image);
    image.dispatchEvent(new Event("load"));
    await waitFor(() => expect(thread.scrollTop).toBe(1200));
  });
});

describe("ChatStage reply layout", () => {
  it("puts the plan after the text and before copy and feedback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "/api/thread") {
          return Response.json({
            messages: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                conversationId: "22222222-2222-4222-8222-222222222222",
                role: "assistant",
                content: "Here is the main answer.",
                attachments: [],
                createdAt: "2026-10-21T11:00:00.000Z",
                metadata: {
                  tools: [
                    { id: "p1", name: "plan_update", kind: "read", summary: "Plan: 1 of 2 done", status: "done", output: JSON.stringify([{ content: "Research", status: "completed" }, { content: "Write", status: "in_progress" }]) },
                    { id: "t1", name: "grep", kind: "read", summary: "Search x", status: "done", output: "ok" },
                  ],
                },
              },
            ],
            daySummaries: {},
          });
        }
        if (url === "/api/thread/greeting") return Response.json({ message: null });
        if (url === "/api/engines") return Response.json(THINKING_ENGINES);
        return Response.json({ success: false });
      }),
    );
    render(<ChatStage user={{ name: "U", email: "u@example.com", image: null }} initialReasoningEffort="medium" />);
    const text = await screen.findByText("Here is the main answer.");
    const plan = await screen.findByLabelText("Plan");
    const copy = await screen.findByLabelText("Copy reply");
    const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(text, plan)).toBe(true);
    expect(before(plan, copy)).toBe(true);
  });
});

describe("ChatStage stop control", () => {
  it("swaps the microphone for Stop while a reply is streaming, and keeps what arrived", async () => {
    const encoder = new TextEncoder();
    let aborted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/thread") return Response.json({ messages: [], daySummaries: {} });
        if (url === "/api/thread/greeting") return Response.json({ message: null });
        if (url === "/api/engines") return Response.json(THINKING_ENGINES);
        if (url.startsWith("/api/memory")) return Response.json({ items: [] });
        if (url === "/api/thread/messages") {
          const signal = init?.signal;
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'event: message.created\ndata: {"message":{"id":"a1","conversationId":"thread","role":"assistant","content":"","attachments":[],"createdAt":"2026-10-22T10:00:00.000Z","metadata":{"status":"streaming"}}}\n\n',
                ),
              );
              controller.enqueue(
                encoder.encode('event: message.delta\ndata: {"messageId":"a1","text":"A star forms"}\n\n'),
              );
              signal?.addEventListener("abort", () => {
                aborted = true;
                controller.error(new DOMException("Aborted", "AbortError"));
              });
            },
          });
          return new Response(body, { headers: { "content-type": "text/event-stream" } });
        }
        return Response.json({ success: false });
      }),
    );

    render(
      <ChatStage
        user={{ name: "Mobile User", email: "mobile@example.com", image: null }}
        initialReasoningEffort="medium"
      />,
    );

    const composer = await screen.findByLabelText("Message Bluebird");
    expect(screen.getByRole("button", { name: "Dictate a message" })).toBeTruthy();
    fireEvent.input(composer, { target: { value: "How does a star form?" } });
    fireEvent.click(await screen.findByRole("button", { name: "Send message" }));

    fireEvent.click(await screen.findByRole("button", { name: "Stop generating" }));
    await waitFor(() => expect(aborted).toBe(true));
    expect(await screen.findByText("A star forms")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dictate a message" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Stop generating" })).toBeNull();
  });
});


describe("ChatStage message queue", () => {
  it("queues a message sent while the model is working and sends it when the reply ends", async () => {
    const encoder = new TextEncoder();
    const bodies: string[] = [];
    const release: { finish?: () => void } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/thread") return Response.json({ messages: [], daySummaries: {} });
        if (url === "/api/thread/greeting") return Response.json({ message: null });
        if (url === "/api/engines") return Response.json(THINKING_ENGINES);
        if (url.startsWith("/api/memory")) return Response.json({ items: [] });
        if (url === "/api/thread/messages" && init?.method === "POST") {
          bodies.push(String(init.body));
          const first = bodies.length === 1;
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  `event: message.created\ndata: {"message":{"id":"a${bodies.length}","conversationId":"thread","role":"assistant","content":"","attachments":[],"createdAt":"2026-10-22T10:00:00.000Z","metadata":{"status":"streaming"}}}\n\n`,
                ),
              );
              if (first) release.finish = () => controller.close();
              else controller.close();
            },
          });
          return new Response(body, { headers: { "content-type": "text/event-stream" } });
        }
        return Response.json({ success: false });
      }),
    );
    render(<ChatStage user={{ name: "U", email: "u@example.com", image: null }} initialReasoningEffort="medium" />);
    const composer = (await screen.findByLabelText("Message Bluebird")) as HTMLTextAreaElement;
    fireEvent.input(composer, { target: { value: "first" } });
    fireEvent.click(await screen.findByRole("button", { name: "Send message" }));
    await screen.findByRole("button", { name: "Stop generating" });

    fireEvent.input(composer, { target: { value: "second" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    const list = await screen.findByLabelText("Queued messages");
    expect(list.textContent).toContain("second");
    expect(bodies).toHaveLength(1);

    release.finish?.();
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toContain("second");
    await waitFor(() => expect(screen.queryByLabelText("Queued messages")).toBeNull());
  });
});

describe("ChatStage audio attachments", () => {
  function stubEngines(audio: boolean) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "/api/thread") return Response.json({ messages: [], daySummaries: {} });
        if (url === "/api/engines") {
          return Response.json({
            selected: { engine: "ollama", model: "tiny:1b" },
            engines: [
              {
                id: "ollama", name: "Ollama", kind: "local", baseUrl: "x", defaultBaseUrl: "x",
                hasKey: false, needsKey: false, status: "ready", error: null,
                models: [
                  { name: "tiny:1b", sizeBytes: null, parameterSize: null, family: null, vision: false, audio, thinking: false, embedding: false },
                ],
              },
            ],
          });
        }
        if (url === "/api/attachments") {
          return Response.json({ id: "9b2c1f4e-8d6a-4b1e-9c3a-5d7e2f1a4b6c", kind: "audio", mime: "audio/mp4", filename: "memo.m4a", sizeBytes: 3, createdAt: new Date().toISOString() });
        }
        if (url.startsWith("/api/memory")) return Response.json({ items: [] });
        return Response.json({ success: false });
      }),
    );
  }

  function attach(container: HTMLElement) {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["abc"], "memo.m4a", { type: "" });
    fireEvent.change(input, { target: { files: [file] } });
  }

  it("warns and does not attach audio when the model cannot listen", async () => {
    stubEngines(false);
    const { container } = render(
      <ChatStage user={{ name: "U", email: "u@example.com", image: null }} initialReasoningEffort="medium" />,
    );
    await screen.findByLabelText("Message Bluebird");
    attach(container);

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toMatch(/doesn't support audio input/);
    expect(screen.queryByText("memo.m4a")).toBeNull();
  });

  it("attaches audio when the model can listen", async () => {
    stubEngines(true);
    const { container } = render(
      <ChatStage user={{ name: "U", email: "u@example.com", image: null }} initialReasoningEffort="medium" />,
    );
    await screen.findByLabelText("Message Bluebird");
    attach(container);

    expect(await screen.findByText("memo.m4a")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
