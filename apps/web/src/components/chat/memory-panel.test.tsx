import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryPanel } from "./memory-panel";

const active = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "preference" as const,
  content: "Prefers short, direct answers.",
  importance: 0.8,
  confidence: 0.95,
  status: "active" as const,
  validFrom: "2026-10-19T10:00:00.000Z",
  validUntil: null,
  createdAt: "2026-10-19T10:00:00.000Z",
  updatedAt: "2026-10-19T10:00:00.000Z",
};

const invalidated = {
  ...active,
  id: "22222222-2222-4222-8222-222222222222",
  type: "project" as const,
  content: "Was working on the old platform design.",
  status: "invalidated" as const,
  validUntil: "2026-10-19T11:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MemoryPanel", () => {
  it("loads active memories and reveals history on request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ items: [active, invalidated] })),
    );
    render(
      <MemoryPanel
        open
        initialTab="memory"
        user={{ name: "Justin", email: "justin@example.com", image: null }}
        onClose={() => undefined}
        onDeleteThread={() => undefined}
      />,
    );

    expect(await screen.findByText(active.content)).toBeTruthy();
    expect(screen.queryByText(invalidated.content)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to settings" }));
    fireEvent.click(screen.getByRole("button", { name: /Past memories/ }));
    expect(screen.getByText(invalidated.content)).toBeTruthy();
  });

  it("does not reload when the parent supplies a new close callback", async () => {
    const fetchMock = vi.fn(async () => Response.json({ items: [active] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = { name: "Justin", email: "justin@example.com", image: null };
    const { rerender } = render(
      <MemoryPanel
        open
        initialTab="memory"
        user={user}
        onClose={() => undefined}
        onDeleteThread={() => undefined}
      />,
    );
    expect(await screen.findByText(active.content)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryPanel
        open
        initialTab="memory"
        user={user}
        onClose={() => undefined}
        onDeleteThread={() => undefined}
      />,
    );
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("corrects a memory through the BFF", async () => {
    const updated = { ...active, content: "Prefers concise answers.", type: "instruction" as const };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [active] }))
      .mockResolvedValueOnce(Response.json(updated));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MemoryPanel
        open
        initialTab="memory"
        user={{ name: "Justin", email: "justin@example.com", image: null }}
        onClose={() => undefined}
        onDeleteThread={() => undefined}
      />,
    );

    const item = (await screen.findByText(active.content)).closest("article");
    if (!item) throw new Error("memory item missing");
    fireEvent.click(within(item).getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Memory content" }), {
      target: { value: updated.content },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Memory type" }), {
      target: { value: "instruction" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(updated.content)).toBeTruthy();
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/memory/${active.id}`,
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("deletes a memory after confirmation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [active] }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MemoryPanel
        open
        initialTab="memory"
        user={{ name: "Justin", email: "justin@example.com", image: null }}
        onClose={() => undefined}
        onDeleteThread={() => undefined}
      />,
    );

    const item = (await screen.findByText(active.content)).closest("article");
    if (!item) throw new Error("memory item missing");
    fireEvent.click(within(item).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(item).getByRole("button", { name: "Delete memory" }));

    await waitFor(() => expect(screen.queryByText(active.content)).toBeNull());
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/memory/${active.id}`, {
      method: "DELETE",
    });
  });

  it("opens account and data tabs with their account actions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ items: [active] })),
    );
    const deleteThread = vi.fn();
    render(
      <MemoryPanel
        open
        user={{ name: "Justin", email: "justin@example.com", image: null }}
        onClose={() => undefined}
        onDeleteThread={deleteThread}
      />,
    );

    expect(await screen.findByText("justin@example.com")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to settings" }));
    fireEvent.click(screen.getByRole("button", { name: /Data controls/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteThread).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("saves the persistent reasoning default from Account", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(
        Response.json({
          user: {
            id: "google-justin",
            email: "justin@example.com",
            name: "Justin",
            picture: null,
            reasoningEffort: "high",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const changed = vi.fn();
    render(
      <MemoryPanel
        open
        user={{ name: "Justin", email: "justin@example.com", image: null }}
        reasoningEffort="medium"
        onReasoningEffortChange={changed}
        onClose={() => undefined}
        onDeleteThread={() => undefined}
      />,
    );

    fireEvent.change(await screen.findByRole("combobox", { name: "Reasoning" }), {
      target: { value: "high" },
    });
    await waitFor(() => expect(changed).toHaveBeenCalledWith("high"));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reasoningEffort: "high" }),
    });
  });

  it("changes appearance from the Appearance tab", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ items: [] })),
    );
    const changed = vi.fn();
    render(
      <MemoryPanel
        open
        initialTab="appearance"
        user={{ name: "Justin", email: "justin@example.com", image: null }}
        themeMode="light"
        onThemeModeChange={changed}
        onClose={() => undefined}
        onDeleteThread={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "Appearance" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), {
      target: { value: "dark" },
    });
    expect(changed).toHaveBeenCalledWith("dark");
  });
});
