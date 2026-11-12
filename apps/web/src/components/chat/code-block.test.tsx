import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodeBlock } from "./code-block";
describe("CodeBlock", () => {
  it("shows plain code with a lowercase label, a copy button and no preview", () => {
    render(<CodeBlock language="python" code={"print('hi')"} />);
    expect(screen.getByText("python")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy code" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Maximize code" })).toBeTruthy();
    for (const name of [/^Preview/, /^Run/, "Wrap lines"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("never offers a preview for languages that are not used on web pages", () => {
    for (const language of ["python", "javascript", "typescript", "bash", "sql", "java", "css", "json"]) {
      const { unmount } = render(<CodeBlock language={language} code="x" />);
      expect(screen.queryByRole("button", { name: "Preview" }), language).toBeNull();
      unmount();
    }
  });

  it("gives web page code a fuller header with Wrap lines, Copy, Preview and Maximize", () => {
    render(<CodeBlock language="html" code="<p>Hello</p>" />);
    expect(screen.getByText("HTML")).toBeTruthy();
    for (const name of ["Wrap lines", "Copy code", "Preview", "Maximize code"]) {
      expect(screen.getByRole("button", { name }), name).toBeTruthy();
    }
  });

  it("previews the page in place in a sandboxed frame, and goes back to the code", () => {
    render(<CodeBlock language="html" code="<h1>Hello</h1>" />);
    expect(screen.queryByTitle("Output")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const frame = screen.getByTitle("Output") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("srcdoc")).toContain("<h1>Hello</h1>");
    expect(frame.getAttribute("srcdoc")).toContain("connect-src 'none'");
    expect(screen.queryByRole("button", { name: "Wrap lines" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show code" }));
    expect(screen.queryByTitle("Output")).toBeNull();
    expect(screen.getByRole("button", { name: "Preview" })).toBeTruthy();
  });

  it("previews SVG too", () => {
    render(<CodeBlock language="svg" code={'<svg viewBox="0 0 10 10"><circle r="4"/></svg>'} />);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByTitle("Output").getAttribute("srcdoc")).toContain("<circle");
  });

  it("wraps long lines on request", () => {
    const { container } = render(<CodeBlock language="html" code={"<p>" + "word ".repeat(80) + "</p>"} />);
    const pre = container.querySelector("pre")!;
    expect(pre.getAttribute("data-wrap")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Wrap lines" }));
    expect(pre.getAttribute("data-wrap")).toBe("true");
    expect(screen.getByRole("button", { name: "Wrap lines" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("opens web page code full screen with the page beside it, and closes with Escape", () => {
    render(<CodeBlock language="html" code="<h1>Big</h1>" />);
    fireEvent.click(screen.getByRole("button", { name: "Maximize code" }));

    const dialog = screen.getByRole("dialog", { name: "HTML, full screen" });
    expect(document.body.style.overflow).toBe("hidden");
    expect(within(dialog).getByTitle("Output").getAttribute("srcdoc")).toContain("<h1>Big</h1>");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("opens other code full screen as code alone", () => {
    render(<CodeBlock language="python" code="print(1)" />);
    fireEvent.click(screen.getByRole("button", { name: "Maximize code" }));
    const dialog = screen.getByRole("dialog", { name: "python, full screen" });
    expect(within(dialog).queryByTitle("Output")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close full screen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("still copies the code, and shows that it did", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<CodeBlock language="python" code="print(1)" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    await screen.findByRole("button", { name: "Code copied" });
    expect(writeText).toHaveBeenCalledWith("print(1)");
  });
});
