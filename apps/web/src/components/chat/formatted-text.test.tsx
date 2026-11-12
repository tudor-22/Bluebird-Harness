import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FormattedText } from "./formatted-text";
import { webImageSrc } from "../../lib/media";

describe("FormattedText", () => {
  it("renders a fenced block as its own panel with a language label", () => {
    const text = [
      "Here is the loop:",
      "",
      "```python",
      "for i in range(10):",
      "    if i % 2 == 0:",
      "        print(i)",
      "```",
      "",
      "After the loop.",
    ].join("\n");

    const { container } = render(<FormattedText text={text} />);

    expect(screen.getByText("python")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy code" })).toBeTruthy();
    const code = container.querySelector("figure code");
    expect(code?.textContent).toContain("for i in range(10):");
    expect(code?.textContent).toContain("        print(i)");
    expect(container.textContent).not.toContain("```");
    expect(screen.getByText("Here is the loop:")).toBeTruthy();
    expect(screen.getByText("After the loop.")).toBeTruthy();
  });

  it("gives every language its own panel and copy control", () => {
    const text = [
      "```javascript",
      "console.log('hi');",
      "```",
      "",
      "```json",
      '{"ok": true}',
      "```",
    ].join("\n");

    const { container } = render(<FormattedText text={text} />);

    expect(screen.getByText("javascript")).toBeTruthy();
    expect(screen.getByText("json")).toBeTruthy();
    expect(container.querySelectorAll("figure")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Copy code" })).toHaveLength(2);
  });

  it("renders inline code without backticks", () => {
    const { container } = render(
      <FormattedText text="Use `range(10)` to iterate from zero to nine." />,
    );

    expect(screen.getByText("range(10)").tagName).toBe("CODE");
    expect(container.textContent).not.toContain("`");
  });

  it("renders inline and display LaTeX formulas", () => {
    const { container } = render(
      <FormattedText text={"GDP is $C + I + G + (X - M)$.\n\n$$GDP = C + I + G + (X - M)$$"} />,
    );

    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector(".katex-display")).not.toBeNull();
    expect(container.textContent).not.toContain("$$");
  });

  it("copies only the code", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<FormattedText text={"```python\nprint('hi')\n```"} />);
    screen.getByLabelText("Copy code").click();

    expect(writeText).toHaveBeenCalledWith("print('hi')");
    expect(await screen.findByRole("button", { name: "Code copied" })).toBeTruthy();
  });

  it("keeps an unclosed fence stable while streaming", () => {
    const { container } = render(<FormattedText text={"```python\nfor i in"} />);

    expect(screen.getByText("python")).toBeTruthy();
    expect(container.querySelector("figure code")?.textContent).toContain("for i in");
  });

  it("shows html in code as text, never as markup", () => {
    const { container } = render(
      <FormattedText text={"```html\n<script>alert('x')</script>\n```"} />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>alert('x')</script>");
  });

  it("still renders tables, headings and lists", () => {
    const text = [
      "## Plan",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "- one",
      "- two",
    ].join("\n");

    const { container } = render(<FormattedText text={text} />);

    expect(container.querySelector("table")).toBeTruthy();
    expect(container.querySelector("h2")?.textContent).toBe("Plan");
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("renders a Markdown picture as a captioned, clickable figure", () => {
    const open = vi.fn();
    const { container } = render(
      <FormattedText
        text={"Positano first.\n\n![Positano at dusk](https://example.com/positano.jpg)"}
        onOpenImage={open}
      />,
    );

    const image = screen.getByRole("img", { name: "Positano at dusk" });
    expect(image.getAttribute("src")).toBe(
      webImageSrc("https://example.com/positano.jpg"),
    );
    expect(container.querySelector('[data-inline-image="true"]')).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open image: Positano at dusk" }));
    expect(open).toHaveBeenCalledWith(
      [
        {
          src: webImageSrc("https://example.com/positano.jpg"),
          caption: "Positano at dusk",
          filename: "positano.jpg",
        },
      ],
      0,
    );
  });

  it("keeps a bold section line on its own line", () => {
    const { container } = render(
      <FormattedText text={"**Rome, days 1 to 3**\nArrive and get your bearings."} />,
    );

    expect(container.querySelector("br")).not.toBeNull();
  });

  it("puts consecutive pictures in a fan that opens at the front one", () => {
    const open = vi.fn();
    const { container } = render(
      <FormattedText
        text={
          "![Positano](https://example.com/positano.jpg)\n![Amalfi](https://example.com/amalfi.jpg)\n![Ravello](https://example.com/ravello.jpg)"
        }
        onOpenImage={open}
      />,
    );

    expect(container.querySelector('[aria-roledescription="carousel"]')).not.toBeNull();
    expect(screen.getAllByRole("img", { hidden: true })).toHaveLength(3);
    // The middle picture starts in front. A side card comes forward first; the front card opens the viewer.
    fireEvent.click(screen.getByRole("button", { name: "Show picture: Ravello" }));
    fireEvent.click(screen.getByRole("button", { name: "Open picture: Ravello" }));
    expect(open).toHaveBeenCalledTimes(1);
    const [items, index] = open.mock.calls[0];
    expect(items.map((item: { caption: string }) => item.caption)).toEqual(["Positano", "Amalfi", "Ravello"]);
    expect(index).toBe(2);
  });
});
