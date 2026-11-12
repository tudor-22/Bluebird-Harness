import { parseUiSpec } from "@bluebird/shared";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UiBlock } from "./ui-block";

const spec = (blocks: unknown[]) => {
  const parsed = parseUiSpec(JSON.stringify({ blocks }));
  if (!parsed) throw new Error("spec did not parse");
  return parsed;
};

const scene = {
  type: "scene",
  id: "bike",
  title: "Bicycle",
  parts: [
    { label: "Front wheel", shape: "torus", position: [5, 0, 0], size: [2.2, 0.14], group: "Wheels", note: "Rolls on the road." },
    { label: "Top tube", shape: "tube", from: [-3, 2.6, 0], to: [2.5, 2.8, 0], radius: 0.14, group: "Frame" },
    { label: "Saddle", shape: "box", position: [-3, 3.3, 0], size: [1.6, 0.25, 0.7], group: "Rider" },
  ],
  captions: { Frame: "The frame holds everything." },
};

afterEach(() => {
  vi.doUnmock("./scene-renderer");
  vi.resetModules();
});

describe("the scene schema", () => {
  it("accepts shapes, tubes and groups", () => {
    expect(parseUiSpec(JSON.stringify({ blocks: [scene] }))).not.toBeNull();
  });

  it("takes rotations in degrees, and keeps wild numbers in range instead of dropping the scene", () => {
    const wild = {
      ...scene,
      parts: [
        { label: "Spinner", shape: "box", rotation: [90, 270, -180], position: [1e6, 0, -1e6], size: [0, 500, 1] },
        { label: "Rod", shape: "tube", from: [0, 0, 0], to: [0, 5, 0], radius: 99 },
      ],
    };
    const parsed = parseUiSpec(JSON.stringify({ blocks: [wild] }));
    expect(parsed).not.toBeNull();
    const first = (parsed!.blocks[0] as { parts: { rotation?: number[]; position?: number[]; size?: number[]; radius?: number }[] }).parts;
    expect(first[0].rotation).toEqual([90, 270, -180]);
    expect(first[0].position).toEqual([60, 0, -60]);
    expect(first[0].size).toEqual([0.02, 40, 1]);
    expect(first[1].radius).toBe(10);
  });

  it("refuses things a scene cannot draw", () => {
    const bad = (part: object) =>
      parseUiSpec(JSON.stringify({ blocks: [{ ...scene, parts: [{ label: "x", ...part }] }] }));
    expect(bad({ shape: "teapot" })).toBeNull();
    expect(bad({ position: [1, 2] })).toBeNull();
    expect(bad({ size: [] })).toBeNull();
    expect(bad({ color: "red" })).toBeNull();
    expect(parseUiSpec(JSON.stringify({ blocks: [{ ...scene, parts: [] }] }))).toBeNull();
  });
});

describe("the scene block without 3D support", () => {
  it("lists the parts and their notes instead", async () => {
    // jsdom has no WebGL, so drawing fails and the plain list appears.
    render(<UiBlock spec={spec([scene])} onSend={vi.fn()} />);
    expect(await screen.findByText(/3D view is not available/)).toBeTruthy();
    expect(screen.getByText("Front wheel")).toBeTruthy();
    expect(screen.getByText(/Rolls on the road\./)).toBeTruthy();
    expect(screen.queryByLabelText("Expansion")).toBeNull();
  });
});

describe("the scene block with 3D", () => {
  async function renderWithFakeRenderer() {
    const updates: { spread: number; group: string; picked: string | null }[] = [];
    let pick: (label: string | null) => void = () => undefined;
    const dispose = vi.fn();
    vi.doMock("./scene-renderer", () => ({
      createScene: (_host: HTMLElement, parts: unknown[], callbacks: { onPick: (label: string | null) => void }) => {
        pick = callbacks.onPick;
        expect(parts).toHaveLength(3);
        return { update: (view: (typeof updates)[number]) => updates.push(view), dispose };
      },
    }));
    vi.resetModules();
    const { UiBlock: Fresh } = await import("./ui-block");
    const view = render(<Fresh spec={spec([scene])} onSend={vi.fn()} />);
    await screen.findByText(/Drag to turn/);
    return { updates, dispose, view, pick: (label: string | null) => act(() => pick(label)) };
  }

  it("turns the chips and the slider into what the scene shows", async () => {
    const { updates } = await renderWithFakeRenderer();
    expect(screen.getByRole("img", { name: /Bicycle: Front wheel, Top tube, Saddle/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Frame" }));
    await waitFor(() => expect(updates.at(-1)).toMatchObject({ group: "Frame", picked: null }));
    expect(screen.getByText("The frame holds everything.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Expansion"), { target: { value: "70" } });
    await waitFor(() => expect(updates.at(-1)).toMatchObject({ spread: 70, group: "Frame" }));

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(updates.at(-1)).toMatchObject({ group: "" }));
  });

  it("selects a part when it is tapped and shows its note", async () => {
    const { updates, pick } = await renderWithFakeRenderer();
    pick("Front wheel");
    await waitFor(() => expect(updates.at(-1)).toMatchObject({ picked: "Front wheel" }));
    expect(screen.getByText("Rolls on the road.")).toBeTruthy();
    // Tapping the same part again lets go of it.
    pick("Front wheel");
    await waitFor(() => expect(updates.at(-1)).toMatchObject({ picked: null }));
  });

  it("cleans up the 3D view when it goes away", async () => {
    const { dispose, view } = await renderWithFakeRenderer();
    view.unmount();
    expect(dispose).toHaveBeenCalled();
  });
});
