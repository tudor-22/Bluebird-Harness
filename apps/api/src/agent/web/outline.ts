/**
 * Turns a page's accessibility tree into a short outline a model can read and
 * act on. Each thing a person could click, type into or choose gets a numbered
 * mark. The marks stay tied to the underlying page nodes, so an action lands on
 * exactly the element the outline showed.
 */

/** The parts of a Chrome accessibility node the outline uses. */
export type AxNode = {
  nodeId: string;
  parentId?: string;
  ignored?: boolean;
  role?: { value?: string };
  name?: { value?: string };
  value?: { value?: unknown };
  description?: { value?: string };
  properties?: { name: string; value?: { value?: unknown } }[];
  childIds?: string[];
  backendDOMNodeId?: number;
  frameId?: string;
};

export type Mark = {
  n: number;
  role: string;
  name: string;
  backendNodeId: number;
  /** The frame the element lives in, when it is not the top page. */
  frameId?: string;
};

export type Outline = {
  text: string;
  marks: Mark[];
  /** True when the outline was cut to fit the size limit. */
  truncated: boolean;
};

export type OutlineOptions = {
  /** Show only things to act on, without the reading text. */
  actionsOnly?: boolean;
  /** Stop after about this many characters. */
  maxChars?: number;
  /** First mark number to hand out, so outlines from several frames can share one list. */
  startAt?: number;
  /** Only the part of the page under this backend node. */
  within?: number;
};

const ACTIONABLE = new Set([
  "button", "link", "textbox", "searchbox", "combobox", "listbox", "checkbox", "radio", "switch",
  "slider", "spinbutton", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "treeitem",
  "option", "textarea", "disclosuretriangle", "popupbutton", "colorwell", "datetime",
]);

/** Roles that only group things: their children are shown in their place. */
const TRANSPARENT = new Set([
  "generic", "none", "presentation", "group", "section", "div", "paragraph", "rootwebarea",
  "webarea", "genericcontainer", "divsection", "layouttable", "layouttablerow", "layouttablecell",
  "ignored", "labeltext", "legend", "blockquote",
]);

const LANDMARKS = new Set(["banner", "navigation", "main", "complementary", "contentinfo", "search", "form", "region", "dialog", "alertdialog", "table", "list", "menu", "menubar", "tablist", "toolbar", "tree", "grid"]);

const prop = (node: AxNode, name: string): unknown => node.properties?.find((entry) => entry.name === name)?.value?.value;
const text = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
const clip = (value: string, length: number): string => (value.length > length ? `${value.slice(0, length - 1)}…` : value);

/** Short flags that change what a control does or whether it can be used. */
function flagsOf(node: AxNode): string[] {
  const flags: string[] = [];
  const checked = prop(node, "checked");
  if (checked === true || checked === "true") flags.push("checked");
  else if (checked === "mixed") flags.push("mixed");
  if (prop(node, "pressed") === true || prop(node, "pressed") === "true") flags.push("pressed");
  if (prop(node, "selected") === true) flags.push("selected");
  if (prop(node, "expanded") === true) flags.push("expanded");
  else if (prop(node, "expanded") === false) flags.push("collapsed");
  if (prop(node, "disabled") === true) flags.push("disabled");
  if (prop(node, "required") === true) flags.push("required");
  if (prop(node, "invalid") && prop(node, "invalid") !== "false") flags.push("invalid");
  if (prop(node, "readonly") === true) flags.push("read-only");
  if (prop(node, "focused") === true) flags.push("focused");
  return flags;
}

export function buildOutline(nodes: AxNode[], options: OutlineOptions = {}): Outline {
  const maxChars = options.maxChars ?? 14_000;
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const roots = nodes.filter((node) => !node.parentId || !byId.has(node.parentId));
  const marks: Mark[] = [];
  const lines: string[] = [];
  let size = 0;
  let truncated = false;
  let next = options.startAt ?? 1;
  let started = options.within === undefined;

  const push = (depth: number, line: string) => {
    if (truncated) return;
    const row = `${"  ".repeat(depth)}${line}`;
    if (size + row.length > maxChars) {
      truncated = true;
      return;
    }
    lines.push(row);
    size += row.length + 1;
  };

  const roleOf = (node: AxNode) => String(node.role?.value ?? "").toLowerCase();

  /** Visible words under a node, for a link or button whose name is only in its children. */
  const words = (node: AxNode, budget = 80): string => {
    const parts: string[] = [];
    const visit = (current: AxNode) => {
      if (parts.join(" ").length > budget) return;
      const label = text(current.name?.value);
      if (roleOf(current) === "statictext" || roleOf(current) === "inlinetextbox") {
        if (label) parts.push(label);
        return;
      }
      for (const id of current.childIds ?? []) {
        const child = byId.get(id);
        if (child) visit(child);
      }
    };
    visit(node);
    return parts.join(" ");
  };

  const walk = (node: AxNode, depth: number) => {
    if (truncated) return;
    const role = roleOf(node);
    const isStart = options.within !== undefined && node.backendDOMNodeId === options.within;
    if (isStart) started = true;
    const inside = started;

    if (node.ignored || role === "ignored") {
      for (const id of node.childIds ?? []) {
        const child = byId.get(id);
        if (child) walk(child, depth);
      }
      return;
    }

    const name = text(node.name?.value);
    const flags = flagsOf(node);
    let shown = false;
    let childDepth = depth;

    if (inside) {
      if (ACTIONABLE.has(role) && node.backendDOMNodeId !== undefined) {
        const label = name || words(node) || text(node.description?.value);
        const value = text(prop(node, "valuetext") ?? node.value?.value);
        const url = role === "link" ? text(prop(node, "url")) : "";
        const mark: Mark = { n: next, role, name: label, backendNodeId: node.backendDOMNodeId, frameId: node.frameId };
        next += 1;
        marks.push(mark);
        let line = `[${mark.n}] ${role}${label ? ` "${clip(label, 90)}"` : ""}`;
        if (value && value !== label) line += ` = "${clip(value, 60)}"`;
        if (flags.length) line += ` (${flags.join(", ")})`;
        if (url) line += ` → ${clip(url, 120)}`;
        push(depth, line);
        shown = true;
        // A text field's content is already shown as its value.
        if (role === "textbox" || role === "searchbox" || role === "textarea") {
          if (isStart) started = options.within === undefined;
          return;
        }
        // A link or button's own words are already its label.
        if (role === "link" || role === "button" || role === "tab" || role === "menuitem" || role === "option") {
          for (const id of node.childIds ?? []) {
            const child = byId.get(id);
            if (child && !roleOf(child).includes("text")) walk(child, depth + 1);
          }
          return;
        }
      } else if (role === "heading") {
        const level = prop(node, "level");
        push(depth, `${"#".repeat(Math.min(6, Number(level) || 1))} ${clip(name || words(node), 120)}`);
        return;
      } else if (LANDMARKS.has(role)) {
        push(depth, `${role}${name ? ` "${clip(name, 60)}"` : ""}`);
        shown = true;
      } else if (role === "img" || role === "image") {
        if (name && !options.actionsOnly) push(depth, `image "${clip(name, 80)}"`);
        return;
      } else if (role === "statictext" || role === "inlinetextbox") {
        if (name && !options.actionsOnly) push(depth, clip(name, 220));
        return;
      } else if (!TRANSPARENT.has(role) && name && !options.actionsOnly) {
        push(depth, `${role} "${clip(name, 80)}"`);
        shown = true;
      }
    }

    childDepth = shown ? depth + 1 : depth;
    for (const id of node.childIds ?? []) {
      const child = byId.get(id);
      if (child) walk(child, childDepth);
    }
    if (isStart) started = options.within === undefined;
  };

  for (const root of roots) walk(root, 0);
  if (truncated) lines.push("[…outline cut here; use browser_look with a mark to look inside one part]");
  return { text: lines.join("\n"), marks, truncated };
}
