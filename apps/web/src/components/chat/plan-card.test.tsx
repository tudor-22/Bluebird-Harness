import { render, screen } from "@testing-library/react";
import type { ToolRecord } from "@bluebird/shared";
import { describe, expect, it } from "vitest";
import { PlanCard, latestPlan } from "./plan-card";

const plan = (id: string, items: unknown): ToolRecord => ({ id, name: "plan_update", kind: "read", summary: "Plan", status: "done", output: JSON.stringify(items) });

describe("latestPlan", () => {
  it("takes the newest plan_update and ignores other tools", () => {
    const tools = [
      plan("1", [{ content: "A", status: "in_progress" }]),
      { id: "2", name: "grep", kind: "read", summary: "Search x", status: "done" } as ToolRecord,
      plan("3", [{ content: "A", status: "completed" }, { content: "B", status: "in_progress" }]),
    ];
    expect(latestPlan(tools).map((item) => item.status)).toEqual(["completed", "in_progress"]);
  });

  it("is empty with no plan, and skips damaged records", () => {
    expect(latestPlan([])).toEqual([]);
    expect(latestPlan([plan("1", [{ content: "A", status: "pending" }]), { ...plan("2", []), output: "{oops" }])).toHaveLength(1);
  });
});

describe("PlanCard", () => {
  it("lists the steps with how many are done", () => {
    render(<PlanCard live items={[{ content: "Look", status: "completed" }, { content: "Fix", status: "in_progress" }, { content: "Test", status: "pending" }]} />);
    expect(screen.getByText("1 of 3")).toBeTruthy();
    expect(screen.getByText("Fix")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
