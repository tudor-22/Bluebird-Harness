import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  computeExpression,
  initialUiState,
  parseUiSpec,
  resolveUiTemplate,
  wrapLooseUiSpec,
  type UiSpec,
} from "@bluebird/shared";

import { UiBlock } from "./ui-block";
import { webImageSrc } from "../../lib/media";

function specFrom(value: unknown): UiSpec {
  const spec = parseUiSpec(JSON.stringify(value));
  if (!spec) throw new Error("spec did not parse");
  return spec;
}

const calculator = specFrom({
  title: "Team plan",
  blocks: [
    { type: "slider", id: "seats", label: "Seats", min: 1, max: 50, step: 1, value: 8 },
    {
      type: "stat",
      label: "Monthly price",
      compute: "seats * 29",
      prefix: "$",
      suffix: "/mo",
    },
    { type: "button", label: "Plan it", message: "Plan for {seats} seats" },
  ],
});

describe("parseUiSpec", () => {
  it("parses a valid spec", () => {
    expect(calculator.title).toBe("Team plan");
    expect(calculator.blocks).toHaveLength(3);
  });

  it("wraps a single top-level block returned without a blocks array", () => {
    const spec = parseUiSpec(
      JSON.stringify({
        title: "Rome walk",
        type: "map",
        markers: [{ label: "Colosseum", q: "Colosseum, Rome" }],
      }),
    );
    expect(spec?.blocks[0]?.type).toBe("map");
  });

  it("rejects malformed JSON and unknown block types", () => {
    expect(parseUiSpec("{not json")).toBeNull();
    expect(parseUiSpec('{"blocks":[{"type":"iframe","src":"https://x"}]}')).toBeNull();
  });

  it("repairs trailing commas and stray prose around the object", () => {
    const trailing = parseUiSpec('{"blocks":[{"type":"text","text":"Hi"},]}');
    expect(trailing?.blocks).toHaveLength(1);
    const wrapped = parseUiSpec('Here you go: {"blocks":[{"type":"text","text":"Hi"}]}');
    expect(wrapped?.blocks).toHaveLength(1);
  });

  it("accepts snake_case ids inside compute expressions", () => {
    const spec = parseUiSpec(
      '{"blocks":[{"type":"number","id":"home_price","label":"Price","step":10000,"value":450000},' +
        '{"type":"stat","label":"Deposit","compute":"home_price * 20 / 100"}]}',
    );
    expect(spec?.blocks).toHaveLength(2);
  });

  it("accepts steppers, copy actions and image references", () => {
    const spec = parseUiSpec(
      JSON.stringify({
        blocks: [
          { type: "stepper", id: "guests", label: "Guests", value: 4 },
          { type: "copy", label: "Copy", text: "hello" },
          { type: "image", attachmentId: "0e6f0c62-3f5e-4a1c-9d3a-2b7c9f123456" },
        ],
      }),
    );
    expect(spec?.blocks).toHaveLength(3);
    expect(
      parseUiSpec('{"blocks":[{"type":"image","attachmentId":"not-a-uuid"}]}'),
    ).toBeNull();
    expect(
      parseUiSpec('{"blocks":[{"type":"image","url":"https://example.com/photo.jpg"}]}'),
    ).not.toBeNull();
    expect(parseUiSpec('{"blocks":[{"type":"image","caption":"nothing"}]}')).toBeNull();
  });

  it("accepts digit-leading ids and long checklists", () => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      id: index === 9 ? "404" : `item_${index}`,
      label: `Item ${index}`,
    }));
    const spec = parseUiSpec(JSON.stringify({ blocks: [{ type: "checklist", items }] }));
    expect(spec?.blocks).toHaveLength(1);
    expect(resolveUiTemplate("fix the {404} page", { "404": "missing" })).toBe(
      "fix the missing page",
    );
  });

  it("normalises ragged tables and mismatched charts instead of rejecting", () => {
    const ragged = parseUiSpec(
      '{"blocks":[{"type":"table","columns":["A","B"],"rows":[["one"],["one","two","three"]]}]}',
    );
    expect(ragged?.blocks).toHaveLength(1);
    const chart = parseUiSpec(
      '{"blocks":[{"type":"chart","kind":"bar","labels":["Jan","Feb"],"values":[3]}]}',
    );
    expect(chart?.blocks).toHaveLength(1);
  });

  it("reflows a table the model flattened into one row", () => {
    const spec = parseUiSpec(
      '{"blocks":[{"type":"table","columns":["A","B"],"rows":[["one","two","three","four"]]}]}',
    );
    const table = spec?.blocks[0];
    expect(table?.type).toBe("table");
    if (table?.type === "table") expect(table.rows).toHaveLength(2);
  });

  it("repairs a table closed with the wrong bracket type", () => {
    const spec = parseUiSpec(
      '{"blocks":[{"type":"table","columns":["A","B"],"rows":[["one","two","three","four"]}',
    );
    const table = spec?.blocks[0];
    expect(table?.type).toBe("table");
    if (table?.type === "table") expect(table.rows).toHaveLength(2);
  });

  it("renders markdown links inside table cells", () => {
    const spec = specFrom({
      blocks: [
        {
          type: "table",
          columns: ["Story", "Source"],
          rows: [["Chip news", "[CNBC](https://www.cnbc.com/technology)"]],
        },
      ],
    });
    const { container } = render(<UiBlock spec={spec} onSend={() => undefined} />);
    const link = container.querySelector("td a");
    expect(link?.getAttribute("href")).toBe("https://www.cnbc.com/technology");
    expect(link?.textContent).toBe("CNBC");
  });

  it("accepts a gallery row of images", () => {
    const spec = parseUiSpec(
      '{"blocks":[{"type":"row","columns":2,"blocks":[' +
        '{"type":"image","url":"https://example.com/a.jpg","caption":"A"},' +
        '{"type":"image","url":"https://example.com/b.jpg","caption":"B"}]}]}',
    );
    const row = spec?.blocks[0];
    expect(row?.type).toBe("row");
    if (row?.type === "row") expect(row.blocks).toHaveLength(2);
  });

  it("marks a gallery row for the mobile card treatment", () => {
    const spec = specFrom({
      blocks: [
        {
          type: "row",
          columns: 2,
          blocks: [
            { type: "image", url: "https://example.com/a.jpg", caption: "A" },
            { type: "image", url: "https://example.com/b.jpg", caption: "B" },
          ],
        },
      ],
    });
    const { container } = render(<UiBlock spec={spec} onSend={() => undefined} />);
    expect(container.querySelector('[data-image-row="true"]')).not.toBeNull();
  });

  it("groups consecutive image blocks into one card strip", () => {
    const spec = specFrom({
      blocks: [
        { type: "image", url: "https://example.com/a.jpg", caption: "A" },
        { type: "image", url: "https://example.com/b.jpg", caption: "B" },
        { type: "image", url: "https://example.com/c.jpg", caption: "C" },
      ],
    });
    const { container } = render(<UiBlock spec={spec} onSend={() => undefined} />);

    const strip = container.querySelector('[data-image-row="true"]');
    expect(strip).not.toBeNull();
    expect(strip?.querySelectorAll("img")).toHaveLength(3);
  });

  it("opens a picture in the preview layer when tapped", () => {
    const spec = specFrom({
      blocks: [
        { type: "image", url: "https://example.com/positano.jpg", caption: "Positano" },
      ],
    });
    const open = vi.fn();
    render(<UiBlock spec={spec} onSend={() => undefined} onOpenImage={open} />);

    fireEvent.click(screen.getByRole("button", { name: "Open image: Positano" }));
    expect(open).toHaveBeenCalledWith(
      webImageSrc("https://example.com/positano.jpg"),
      "Positano",
    );
  });

  it("accepts and renders an entity card with a tag and source", () => {
    const spec = specFrom({
      blocks: [
        {
          type: "entity",
          title: "Blue parrotfish hybrid",
          imageUrl: "https://example.com/parrotfish.jpg",
          tag: "Not suitable for 100 L",
          tone: "bad",
          text: "It grows larger than the tank can support.",
          sourceLabel: "Tropical Fish",
          sourceUrl: "https://example.com/parrotfish",
        },
      ],
    });
    render(<UiBlock spec={spec} onSend={() => undefined} />);

    expect(screen.getByText("Blue parrotfish hybrid")).toBeTruthy();
    expect(screen.getByText("Not suitable for 100 L")).toBeTruthy();
    const source = screen.getByRole("link", { name: /Tropical Fish/ });
    expect(source.getAttribute("href")).toBe("https://example.com/parrotfish");
  });

  it("explains when map coordinates are unavailable instead of showing a blank map", () => {
    const spec = specFrom({
      blocks: [
        {
          type: "map",
          markers: [{ label: "Colosseum", q: "Colosseum, Rome" }],
        },
      ],
    });
    render(<UiBlock spec={spec} onSend={() => undefined} />);

    expect(screen.getByText(/Map locations are unavailable/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Expand" })).toBeNull();
  });

  it("renders a stacked breakdown with values and percentages", () => {
    const spec = specFrom({
      blocks: [
        {
          type: "breakdown",
          label: "GDP composition",
          prefix: "$",
          suffix: "B",
          items: [
            { label: "Consumption", value: 600 },
            { label: "Investment", value: 200 },
            { label: "Government", value: 170 },
            { label: "Net exports", value: 30 },
          ],
        },
      ],
    });
    render(<UiBlock spec={spec} onSend={() => undefined} />);

    expect(screen.getByRole("img", { name: /Consumption \$600B/ })).toBeTruthy();
    expect(screen.getByText("60%")).toBeTruthy();
    expect(screen.getByText("20%")).toBeTruthy();
  });

  it("updates breakdown segments from interactive inputs", () => {
    const spec = specFrom({
      blocks: [
        { type: "slider", id: "consumer", label: "Consumer", min: 0, max: 1000, value: 600 },
        { type: "slider", id: "investment", label: "Investment", min: 0, max: 1000, value: 400 },
        {
          type: "breakdown",
          label: "GDP",
          items: [
            { label: "Consumption", compute: "consumer" },
            { label: "Investment", compute: "investment" },
          ],
        },
      ],
    });
    render(<UiBlock spec={spec} onSend={() => undefined} />);

    expect(screen.getByRole("img", { name: /Consumption 600/ })).toBeTruthy();
    fireEvent.change(screen.getByRole("slider", { name: "Consumer" }), {
      target: { value: "800" },
    });
    expect(screen.getByRole("img", { name: /Consumption 800/ })).toBeTruthy();
    expect(screen.getByText("67%")).toBeTruthy();
  });

  it("repairs a stray empty entry before a closing brace", () => {
    const spec = parseUiSpec(
      '{"blocks":[{"type":"table","columns":["A"],"rows":[["x"]],""},{"type":"text","text":"Two"}]}',
    );
    expect(spec?.blocks).toHaveLength(2);
  });

  it("salvages the valid blocks of a cut-off spec", () => {
    const spec = parseUiSpec(
      '{"title":"Trip","blocks":[{"type":"text","text":"One"},{"type":"table","columns":["A"],"rows":[["x"]]},{"type":"text","te',
    );
    expect(spec?.blocks.map((block) => block.type)).toEqual(["text", "table"]);
  });

  it("repairs a spec that is missing its final closers", () => {
    const body =
      '{"title":"Trip","blocks":[{"type":"timeline","items":[{"title":"Rome"}]},' +
      '{"type":"table","columns":["City"],"rows":[["Rome"]';
    const spec = parseUiSpec(`${body}]}`); // model dropped "]}" before the fence
    expect(spec?.blocks).toHaveLength(2);
  });

  it("wraps a bare spec paragraph in a ui fence", () => {
    const text = 'Here you go:\n\n{"blocks":[{"type":"text","text":"Hi"}]}\n\nEnjoy.';
    expect(wrapLooseUiSpec(text)).toBe(
      'Here you go:\n\n```ui\n{"blocks":[{"type":"text","text":"Hi"}]}\n```\n\nEnjoy.',
    );
  });

  it("leaves plain JSON and existing fences alone", () => {
    expect(wrapLooseUiSpec('{"name":"tudor"}')).toBe('{"name":"tudor"}');
    expect(wrapLooseUiSpec("```ui\n{}\n```")).toBe("```ui\n{}\n```");
  });
});

describe("computeExpression", () => {
  it("follows arithmetic precedence", () => {
    expect(computeExpression("seats * 29", { seats: 8 })).toBe(232);
    expect(computeExpression("(seats + 2) * 3", { seats: 8 })).toBe(30);
    expect(computeExpression("-seats / 2", { seats: 8 })).toBe(-4);
    expect(computeExpression("p * (1 + r / 100) ^ t", { p: 1000, r: 5, t: 3 })).toBeCloseTo(
      1157.63,
      2,
    );
  });

  it("returns null on anything uneven", () => {
    expect(computeExpression("seats *", { seats: 8 })).toBeNull();
    expect(computeExpression("total + 1", { seats: 8 })).toBeNull();
    expect(computeExpression("", {})).toBeNull();
  });
});

describe("resolveUiTemplate", () => {
  it("fills known ids and leaves unknown ones alone", () => {
    expect(resolveUiTemplate("Plan for {seats} seats", { seats: 8 })).toBe("Plan for 8 seats");
    expect(resolveUiTemplate("{gift} details", { gift: true })).toBe("on details");
    expect(resolveUiTemplate("{missing} stays", { seats: 1 })).toBe("{missing} stays");
  });
});

describe("initialUiState", () => {
  it("clamps values and defaults selects to a real option", () => {
    const state = initialUiState(
      specFrom({
        blocks: [
          { type: "slider", id: "seats", label: "Seats", min: 1, max: 10, value: 99 },
          {
            type: "select",
            id: "plan",
            label: "Plan",
            options: [{ value: "basic", label: "Basic" }],
            value: "missing",
          },
        ],
      }),
    );
    expect(state.seats).toBe(10);
    expect(state.plan).toBe("basic");
  });
});

describe("UiBlock", () => {
  it("renders a computed stat from the slider's value", () => {
    render(<UiBlock spec={calculator} onSend={() => undefined} />);
    expect(screen.getByText("Team plan")).toBeTruthy();
    expect(screen.getByText("$232/mo")).toBeTruthy();
  });

  it("resolves computed stats that feed later stats and charts", () => {
    const spec = specFrom({
      blocks: [
        { type: "slider", id: "deposit", label: "Deposit", min: 5, max: 30, value: 10 },
        { type: "slider", id: "rate", label: "Rate", min: 1, max: 10, value: 5 },
        {
          type: "stat",
          id: "loan",
          label: "Loan",
          compute: "100000 * (1 - deposit / 100)",
          prefix: "£",
        },
        {
          type: "stat",
          id: "interest",
          label: "Interest",
          compute: "loan * rate / 100",
          prefix: "£",
        },
        { type: "chart", kind: "bar", labels: ["Interest"], values: ["interest"] },
      ],
    });
    const { container } = render(<UiBlock spec={spec} onSend={() => undefined} />);

    expect(screen.getByText("£90,000")).toBeTruthy();
    expect(screen.getByText("£4,500")).toBeTruthy();
    expect(container.querySelector('[title^="Interest:"]')).not.toBeNull();

    fireEvent.change(screen.getByRole("slider", { name: "Deposit" }), {
      target: { value: "20" },
    });
    expect(screen.getByText("£80,000")).toBeTruthy();
    expect(screen.getByText("£4,000")).toBeTruthy();
  });

  it("updates derived values without calling the model", () => {
    render(<UiBlock spec={calculator} onSend={() => undefined} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "10" } });
    expect(screen.getByText("$290/mo")).toBeTruthy();
  });

  it("sends the button message with the current values", () => {
    const onSend = vi.fn();
    render(<UiBlock spec={calculator} onSend={onSend} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan it" }));
    expect(onSend).toHaveBeenCalledWith("Plan for 12 seats");
  });

  it("ticks checklist items locally", () => {
    const spec = specFrom({
      blocks: [{ type: "checklist", items: [{ id: "prep", label: "Prep the lamb" }] }],
    });
    render(<UiBlock spec={spec} onSend={() => undefined} />);
    const box = screen.getByRole("checkbox", { name: "Prep the lamb" }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(box.checked).toBe(true);
  });

  it("restores input and checklist state after a reload", async () => {
    window.localStorage.clear();
    const spec = specFrom({
      blocks: [
        { type: "slider", id: "seats", label: "Seats", min: 1, max: 10, value: 4 },
        {
          type: "checklist",
          items: [{ id: "prep", label: "Prep the lamb" }],
        },
      ],
    });
    const first = render(
      <UiBlock spec={spec} onSend={() => undefined} persistKey="message-a-panel-0" />,
    );
    fireEvent.change(screen.getByRole("slider"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Prep the lamb" }));
    await waitFor(() =>
      expect(window.localStorage.getItem("bluebird:ui:message-a-panel-0")).toContain("7"),
    );
    first.unmount();

    render(
      <UiBlock spec={spec} onSend={() => undefined} persistKey="message-a-panel-0" />,
    );
    await waitFor(() =>
      expect(
        (screen.getByRole("checkbox", { name: "Prep the lamb" }) as HTMLInputElement)
          .checked,
      ).toBe(true),
    );
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("7");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(
      (screen.getByRole("checkbox", { name: "Prep the lamb" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("4");
  });

  it("steps a counter and updates derived values", () => {
    const spec = specFrom({
      blocks: [
        { type: "stepper", id: "guests", label: "Guests", min: 1, max: 10, value: 4 },
        { type: "stat", label: "Portions", compute: "guests * 1.5" },
      ],
    });
    render(<UiBlock spec={spec} onSend={() => undefined} />);
    expect(screen.getByText("6")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Increase Guests" }));
    expect(screen.getByText("7.5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Decrease Guests" }));
    expect(screen.getByText("6")).toBeTruthy();
  });

  it("copies the resolved text from a copy action", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const spec = specFrom({
      blocks: [
        { type: "stepper", id: "guests", label: "Guests", min: 1, value: 4 },
        { type: "copy", label: "Copy list", text: "Shopping for {guests} guests" },
      ],
    });
    render(<UiBlock spec={spec} onSend={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Increase Guests" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy list" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Shopping for 5 guests"));
    expect(screen.getByText("Copied")).toBeTruthy();
  });

  it("renders an image from the thread by attachment id", () => {
    const spec = specFrom({
      blocks: [
        {
          type: "image",
          attachmentId: "0e6f0c62-3f5e-4a1c-9d3a-2b7c9f123456",
          caption: "The receipt",
        },
      ],
    });
    const { container } = render(<UiBlock spec={spec} onSend={() => undefined} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(
      "/api/attachments/0e6f0c62-3f5e-4a1c-9d3a-2b7c9f123456",
    );
    expect(screen.getByText("The receipt")).toBeTruthy();
  });

  it("renders a timeline of stops", () => {
    const spec = specFrom({
      blocks: [
        {
          type: "timeline",
          items: [
            { time: "9:30", title: "Coffee at The Coffee Club" },
            { title: "Arthur's Seat", note: "Two and a half hours" },
          ],
        },
      ],
    });
    render(<UiBlock spec={spec} onSend={() => undefined} />);
    expect(screen.getByText("Coffee at The Coffee Club")).toBeTruthy();
    expect(screen.getByText("Two and a half hours")).toBeTruthy();
  });

  it("accepts a map block with place queries", () => {
    const spec = parseUiSpec(
      '{"blocks":[{"type":"map","markers":[{"label":"Sagrada","q":"Sagrada Familia, Barcelona"},' +
        '{"label":"Park Guell","lat":41.4145,"lng":2.1527}]}]}',
    );
    expect(spec?.blocks).toHaveLength(1);
    expect(spec?.blocks[0].type).toBe("map");
  });

  it("accepts route metadata, marker imagery and up to fifteen stops", () => {
    const markers = Array.from({ length: 15 }, (_, index) => ({
      label: `Stop ${index + 1}`,
      lat: 51.5 + index / 100,
      lng: -0.1 + index / 100,
      icon: "📍",
      image: `https://example.com/stop-${index + 1}.jpg`,
    }));
    const spec = specFrom({
      blocks: [{ type: "map", title: "Road trip", route: true, markers }],
    });
    const map = spec.blocks[0];
    expect(map.type).toBe("map");
    if (map.type === "map") {
      expect(map.markers).toHaveLength(15);
      expect(map.markers[0].icon).toBe("📍");
      expect(map.markers[0].image).toBe("https://example.com/stop-1.jpg");
    }
  });

  it("drops map markers with neither a place nor coordinates", () => {
    const spec = parseUiSpec('{"blocks":[{"type":"map","markers":[{"label":"Nowhere"}]}]}');
    expect(spec).toBeNull();
  });
});

describe("form block", () => {
  const form = specFrom({
    blocks: [
      {
        type: "form",
        label: "Work out my split",
        message: "Split {total} between {people} people, paying {note}",
        fields: [
          { id: "total", label: "Bill total", kind: "number", value: 80 },
          { id: "people", label: "People", kind: "number", value: 4 },
          { id: "note", label: "Anything to add", kind: "text", placeholder: "Optional" },
        ],
      },
    ],
  });

  it("starts with the field values from the spec", () => {
    expect(initialUiState(form)).toEqual({ total: 80, people: 4, note: "" });
  });

  it("sends one message with the typed values when submitted", () => {
    const onSend = vi.fn();
    render(<UiBlock spec={form} onSend={onSend} />);

    fireEvent.change(screen.getByLabelText("Anything to add"), { target: { value: "tip" } });
    fireEvent.click(screen.getByRole("button", { name: "Work out my split" }));

    expect(onSend).toHaveBeenCalledWith("Split 80 between 4 people, paying tip");
  });

  it("does not submit while a text field is empty", () => {
    const onSend = vi.fn();
    render(<UiBlock spec={form} onSend={onSend} />);

    const button = screen.getByRole("button", { name: "Work out my split" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe("steps block", () => {
  const steps = specFrom({
    blocks: [
      {
        type: "steps",
        id: "walk",
        items: [
          { title: "Mix", text: "Combine the flour and water." },
          { title: "Rest", text: "Leave it for an hour." },
          { title: "Bake", text: "Bake at 200 degrees." },
        ],
      },
    ],
  });

  it("pages through the steps without sending a message", () => {
    const onSend = vi.fn();
    render(<UiBlock spec={steps} onSend={onSend} />);

    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Step 3 of 3")).toBeTruthy();
    expect(screen.getByText("Bake at 200 degrees.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe("quiz block", () => {
  const quiz = specFrom({
    blocks: [
      {
        type: "quiz",
        id: "gd",
        questions: [
          {
            question: "Which way does the gradient point?",
            options: ["Downhill", "Uphill", "Sideways"],
            answer: 1,
            explanation: "The gradient points **uphill**.",
          },
          {
            question: "What does the learning rate control?",
            options: ["Step size", "Colour"],
            answer: 0,
          },
        ],
      },
    ],
  });

  it("shows the answer and its reason straight after a pick", () => {
    render(<UiBlock spec={quiz} onSend={vi.fn()} />);

    expect(screen.getByText("Question 1 of 2")).toBeTruthy();
    const wrong = screen.getByRole("button", { name: /Downhill/ });
    fireEvent.click(wrong);
    expect(screen.getByText("Not quite.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Uphill/ }).getAttribute("data-state")).toBe("correct");
    expect(wrong.getAttribute("data-state")).toBe("wrong");
  });

  it("scores the quiz and offers a retry", () => {
    render(<UiBlock spec={quiz} onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Uphill/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: /Colour/ }));
    fireEvent.click(screen.getByRole("button", { name: "See results" }));

    expect(screen.getByText("1/2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Question 1 of 2")).toBeTruthy();
  });

  it("does not let a reader pick twice for the same question", () => {
    render(<UiBlock spec={quiz} onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Uphill/ }));
    const other = screen.getByRole("button", { name: /Downhill/ }) as HTMLButtonElement;
    expect(other.disabled).toBe(true);
  });
});

describe("choice block", () => {
  const choice = specFrom({
    blocks: [
      {
        type: "choice",
        id: "season",
        label: "When are you going?",
        value: "summer",
        options: [
          { value: "summer", label: "Summer" },
          { value: "fall", label: "Fall" },
        ],
      },
      { type: "button", label: "Plan it", message: "Plan for {season}" },
    ],
  });

  it("chooses one card and uses the choice in a button message", () => {
    const onSend = vi.fn();
    render(<UiBlock spec={choice} onSend={onSend} />);

    fireEvent.click(screen.getByLabelText("Fall"));
    fireEvent.click(screen.getByRole("button", { name: "Plan it" }));

    expect(onSend).toHaveBeenCalledWith("Plan for fall");
  });
});

describe("suggestions block", () => {
  it("sends the tapped follow-up as the reader's next message", () => {
    const onSend = vi.fn();
    const spec = specFrom({
      blocks: [
        {
          type: "suggestions",
          items: [
            { label: "Build a packing list", message: "Give me a packing list for 3 days" },
            { label: "Compare flights", message: "Compare flights from London" },
          ],
        },
      ],
    });
    render(<UiBlock spec={spec} onSend={onSend} />);

    fireEvent.click(screen.getByRole("button", { name: "Compare flights" }));

    expect(onSend).toHaveBeenCalledWith("Compare flights from London");
  });
});
