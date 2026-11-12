import { parseUiSpec } from "@bluebird/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildExport } from "../../lib/export-file";
import { UiBlock } from "./ui-block";

const spec = (blocks: unknown[]) => {
  const parsed = parseUiSpec(JSON.stringify({ blocks }));
  if (!parsed) throw new Error("spec did not parse");
  return parsed;
};

describe("diagram", () => {
  const diagram = {
    type: "diagram",
    id: "bike",
    title: "How a bike fits together",
    parts: [
      { label: "Frame", group: "Frame", x: 50, y: 30, note: "Holds everything together." },
      { label: "Front wheel", group: "Wheels", x: 20, y: 38 },
      { label: "Rear wheel", group: "Wheels", x: 80, y: 38 },
      { label: "Brake", group: "Brakes", x: 22, y: 20 },
    ],
    links: [{ from: "Frame", to: "Front wheel", label: "fork" }],
    captions: { Wheels: "Both wheels roll on the same axle line." },
  };

  it("lets the reader focus a group, spread the parts and open a part's note", () => {
    render(<UiBlock spec={spec([diagram])} onSend={vi.fn()} />);

    expect(screen.getByRole("img", { name: "How a bike fits together" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Wheels" }));
    expect(screen.getByText("Both wheels roll on the same axle line.")).toBeTruthy();
    // Parts outside the chosen group are dimmed, not removed.
    const frame = screen.getByRole("button", { name: /^Frame: / });
    expect(frame.getAttribute("data-active")).toBe("false");
    expect(screen.getByRole("button", { name: "Front wheel" }).getAttribute("data-active")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.click(screen.getByRole("button", { name: /^Frame: / }));
    expect(screen.getByText("Holds everything together.")).toBeTruthy();

    const slider = screen.getByLabelText("Expansion") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "80" } });
    expect(slider.value).toBe("80");
  });

  it("can drop the expansion slider", () => {
    render(<UiBlock spec={spec([{ ...diagram, spread: false }])} onSend={vi.fn()} />);
    expect(screen.queryByLabelText("Expansion")).toBeNull();
  });

  it("rejects a diagram with a single part", () => {
    expect(parseUiSpec(JSON.stringify({ blocks: [{ ...diagram, parts: [diagram.parts[0]] }] }))).toBeNull();
  });
});

describe("gantt", () => {
  it("draws a bar per task and shows detail on tap, for numbers and for dates", () => {
    const { unmount } = render(
      <UiBlock
        spec={spec([
          {
            type: "gantt",
            unit: "week",
            tasks: [
              { label: "Design", start: 0, end: 2, group: "Plan", progress: 100 },
              { label: "Build", start: 2, end: 6, group: "Make", progress: 40, note: "Two engineers." },
            ],
          },
        ])}
        onSend={vi.fn()}
      />,
    );
    const build = screen.getByRole("button", { name: /Build: 2 to 6, 40% done/ });
    fireEvent.click(build);
    expect(screen.getByText(/Two engineers\./)).toBeTruthy();
    expect(screen.getByText("Axis in weeks")).toBeTruthy();
    unmount();

    render(
      <UiBlock
        spec={spec([
          { type: "gantt", tasks: [{ label: "Launch", start: "2026-11-02", end: "2026-11-20" }] },
        ])}
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Launch: 2 Nov to 20 Nov/ })).toBeTruthy();
  });
});

describe("export", () => {
  const table = { type: "table", columns: ["Item", "Cost"], rows: [["Tea, loose", "3"], ["=SUM(A1)", "4"]] };

  it("builds a CSV of a table and defuses spreadsheet formulas", () => {
    const parsed = spec([table, { type: "export", label: "Save", filename: "costs.csv", format: "csv", table: 0 }]);
    const tables = parsed.blocks.filter((block) => block.type === "table");
    const node = parsed.blocks[1];
    if (node.type !== "export" || tables[0].type !== "table") throw new Error("shape");
    const file = buildExport(node, [tables[0]], {});
    expect(file?.filename).toBe("costs.csv");
    expect(file?.content).toBe('Item,Cost\n"Tea, loose",3\n\'=SUM(A1),4');
  });

  it("fills values into text exports and refuses an empty one", () => {
    const parsed = spec([
      { type: "number", id: "total", label: "Total", value: 12 },
      { type: "export", label: "Save", filename: "note", format: "md", text: "Total: {total}" },
    ]);
    const node = parsed.blocks[1];
    if (node.type !== "export") throw new Error("shape");
    expect(buildExport(node, [], { total: 12 })?.content).toBe("Total: 12");
    expect(buildExport({ ...node, text: undefined }, [], {})).toBeNull();
  });

  it("downloads the file when the button is pressed", () => {
    const create = vi.fn(() => "blob:test");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    render(
      <UiBlock
        spec={spec([table, { type: "export", label: "Save as CSV", filename: "costs", format: "csv", table: 0 }])}
        onSend={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save as CSV" }));
    expect(create).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("rejects an unsafe filename", () => {
    expect(
      parseUiSpec(JSON.stringify({ blocks: [{ type: "export", label: "x", filename: "../etc/passwd", text: "x" }] })),
    ).toBeNull();
  });
});

describe("chart hover detail", () => {
  it("reads out the exact value under the pointer for bars and lines", () => {
    const { unmount } = render(
      <UiBlock
        spec={spec([{ type: "chart", kind: "bar", labels: ["Mon", "Tue"], values: [12, 1500] }])}
        onSend={vi.fn()}
      />,
    );
    fireEvent.mouseEnter(screen.getByLabelText("Tue: 1,500"));
    expect(screen.getByText("Tue: 1,500")).toBeTruthy();
    unmount();

    render(
      <UiBlock
        spec={spec([{ type: "chart", kind: "line", labels: ["Q1", "Q2", "Q3"], values: [3, 9, 6] }])}
        onSend={vi.fn()}
      />,
    );
    fireEvent.focus(screen.getByLabelText("Q2: 9"));
    expect(screen.getByText("Q2: 9")).toBeTruthy();
  });
});

describe("fancier diagrams and mind maps", () => {
  it("lays out an auto diagram from its links and offers Play flow", () => {
    render(
      <UiBlock
        spec={spec([
          {
            type: "diagram",
            id: "flow",
            layout: "auto",
            parts: [
              { label: "Start", shape: "pill", icon: "🙂" },
              { label: "Check", shape: "diamond", note: "Decides." },
              { label: "Store", shape: "database" },
            ],
            links: [
              { from: "Start", to: "Check", label: "go" },
              { from: "Check", to: "Store", style: "dashed" },
            ],
          },
        ])}
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Check: Decides/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Play flow/ })).toBeTruthy();
  });

  it("draws a mind map and opens a branch's note", () => {
    render(
      <UiBlock
        spec={spec([
          {
            type: "mindmap",
            id: "map",
            root: "Energy",
            nodes: [
              { label: "Solar", note: "Light to power." },
              { label: "Panels", parent: "Solar" },
              { label: "Wind" },
            ],
          },
        ])}
        onSend={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Solar/ }));
    expect(screen.getAllByText("Light to power.").length).toBeGreaterThan(0);
  });
});
