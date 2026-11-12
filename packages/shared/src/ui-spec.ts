import { z } from "zod";

/**
 * The interactive panel language: the model may append one fenced `ui` block
 * to a reply, and the web app renders it as native components. Declarative
 * only: there is no HTML, CSS, or script from the model, just data.
 */

export const UI_BLOCK_LANGUAGE = "ui";

const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_]{0,31}$/, "ids are letters, digits and underscores");

/**
 * Strings are softly capped: long model output is clamped to fit, never a
 * reason to reject the whole panel.
 */
const text = (max: number) =>
  z.string().trim().min(1).transform((value) => value.slice(0, max));
const softText = (max: number) =>
  z.string().trim().transform((value) => value.slice(0, max));
const finite = z.number().finite();
const computeText = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .regex(/^[a-z0-9\s+\-*/^()._]+$/i, "compute is simple arithmetic");
const chartValue = z.union([finite, idSchema]);

export const uiSliderSchema = z.object({
  type: z.literal("slider"),
  id: idSchema,
  label: text(60),
  min: finite,
  max: finite,
  step: finite.positive().optional(),
  value: finite,
});

export const uiNumberSchema = z.object({
  type: z.literal("number"),
  id: idSchema,
  label: text(60),
  min: finite.optional(),
  max: finite.optional(),
  step: finite.positive().optional(),
  value: finite,
});

export const uiSelectSchema = z
  .object({
    type: z.literal("select"),
    id: idSchema,
    label: text(60),
    options: z.array(z.object({ value: text(40), label: text(40) })).min(1).max(12),
    value: text(40),
  });

export const uiToggleSchema = z.object({
  type: z.literal("toggle"),
  id: idSchema,
  label: text(60),
  value: z.boolean(),
});

export const uiStepperSchema = z
  .object({
    type: z.literal("stepper"),
    id: idSchema,
    label: text(60),
    min: finite.optional(),
    max: finite.optional(),
    step: finite.positive().optional(),
    value: finite,
  })
  .refine(
    (node) => node.min === undefined || node.max === undefined || node.min <= node.max,
    "min must not exceed max",
  );

export const uiCopySchema = z.object({
  type: z.literal("copy"),
  label: text(40),
  text: text(600),
});

export const uiImageSchema = z
  .object({
    type: z.literal("image"),
    attachmentId: z.string().uuid().optional(),
    url: z
      .string()
      .trim()
      .regex(/^https:\/\/\S{6,400}$/, "image urls are https")
      .optional(),
    caption: softText(160).optional(),
  })
  .refine((node) => Boolean(node.attachmentId || node.url), "image needs an id or a url");

export const uiEntitySchema = z.object({
  type: z.literal("entity"),
  title: text(90),
  imageUrl: z
    .string()
    .trim()
    .regex(/^https:\/\/\S{6,1000}$/, "entity images are https")
    .optional(),
  attachmentId: z.string().uuid().optional(),
  tag: softText(30).optional(),
  tone: z.enum(["neutral", "good", "warn", "bad"]).optional(),
  text: text(600),
  sourceLabel: softText(40).optional(),
  sourceUrl: z
    .string()
    .trim()
    .regex(/^https:\/\/\S{6,1000}$/, "entity source urls are https")
    .optional(),
});

export const uiTimelineSchema = z.object({
  type: z.literal("timeline"),
  items: z
    .array(
      z.object({
        time: softText(16).optional(),
        title: text(80),
        note: softText(400).optional(),
      }),
    )
    .min(1)
    .max(20),
});

/**
 * An interactive diagram: labelled parts placed on a 100 by 60 canvas. The
 * reader can spread the parts apart (an exploded view), pick a group to
 * highlight it, and tap a part for its note. Positions are where each part
 * sits when assembled.
 */
export const uiDiagramSchema = z.object({
  type: z.literal("diagram"),
  id: idSchema,
  title: softText(80).optional(),
  parts: z
    .array(
      z.object({
        label: text(24),
        /** Chips let the reader focus a group of parts, such as "Brakes". */
        group: softText(24).optional(),
        /** Where it sits on the canvas. Leave out with layout "auto". */
        x: z.number().min(0).max(100).optional(),
        y: z.number().min(0).max(60).optional(),
        /** How the part is drawn. A diamond is a decision, a database a store. */
        shape: z.enum(["box", "pill", "diamond", "circle", "database", "hexagon"]).optional(),
        /** One emoji or glyph shown before the label. */
        icon: softText(4).optional(),
        note: softText(300).optional(),
      }),
    )
    .min(2)
    .max(24),
  /** Lines between parts, by part label, such as a flow or an assembly. */
  links: z
    .array(
      z.object({
        from: text(24),
        to: text(24),
        label: softText(20).optional(),
        style: z.enum(["solid", "dashed", "dotted"]).optional(),
        /** Draw an arrowhead at the end. On by default. */
        arrow: z.boolean().optional(),
      }),
    )
    .max(40)
    .optional(),
  /** What each group does, shown under the diagram when its chip is chosen. */
  captions: z.record(z.string(), softText(300)).optional(),
  /** Offer the expansion slider. On by default. */
  spread: z.boolean().optional(),
  /** "auto" places the parts in layers by their links, so no x or y is needed. */
  layout: z.enum(["manual", "auto"]).optional(),
  /** Direction of the layers with layout "auto": left to right, or top to bottom. */
  direction: z.enum(["LR", "TB"]).optional(),
  /** Offer a Play button that lights the parts one by one along the links. */
  playable: z.boolean().optional(),
});

/**
 * A mind map: one central topic with branches. Parts name their parent, so a
 * map is a flat list. The reader taps a branch to open its note or fold it.
 */
export const uiMindmapSchema = z.object({
  type: z.literal("mindmap"),
  id: idSchema,
  title: softText(80).optional(),
  /** The central topic. */
  root: text(40),
  nodes: z
    .array(
      z.object({
        label: text(32),
        /** The parent's label; leave out to hang it off the central topic. */
        parent: softText(32).optional(),
        note: softText(300).optional(),
      }),
    )
    .min(2)
    .max(40),
});

/** A number kept inside a range, so a slightly wild value never costs the whole scene. */
const within = (min: number, max: number) =>
  z.number().finite().transform((value) => Math.min(max, Math.max(min, value)));
const vec3 = z.tuple([within(-60, 60), within(-60, 60), within(-60, 60)]);
const degrees3 = z.tuple([within(-720, 720), within(-720, 720), within(-720, 720)]);

/**
 * A 3D scene built from simple shapes, that the reader can turn around, zoom,
 * pull apart and explore by group. Everything is data: shapes, positions,
 * colours and notes, so nothing the model writes is ever run. y points up, and
 * a scene fits in about 20 units across. A "tube" runs between two points, so
 * rods and pipes never need rotations worked out by hand.
 */
export const uiScenePartSchema = z.object({
  label: text(28),
  shape: z.enum(["box", "sphere", "cylinder", "cone", "torus", "tube"]).default("box"),
  /** Where the part sits when assembled. */
  position: vec3.optional(),
  /** box: width, height, depth. sphere: radius. cylinder and cone: radius, height. torus: ring radius, tube radius. */
  size: z.array(within(0.02, 40)).min(1).max(3).optional(),
  /** Degrees about x, y and z. */
  rotation: degrees3.optional(),
  /** For a tube: its two ends and thickness. */
  from: vec3.optional(),
  to: vec3.optional(),
  radius: within(0.02, 10).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  group: softText(24).optional(),
  note: softText(300).optional(),
});

export const uiSceneSchema = z.object({
  type: z.literal("scene"),
  id: idSchema,
  title: softText(80).optional(),
  parts: z.array(uiScenePartSchema).min(1).max(40),
  /** What each group does, shown under the scene when its chip is chosen. */
  captions: z.record(z.string(), softText(300)).optional(),
  /** Offer the expansion slider. On by default. */
  spread: z.boolean().optional(),
});

/** One bar on a Gantt chart. Start and end are numbers (a day, a week) or ISO dates. */
const ganttPoint = z.union([finite, z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

export const uiGanttSchema = z.object({
  type: z.literal("gantt"),
  title: softText(80).optional(),
  /** Names the numeric scale on the axis, such as "week" or "day". */
  unit: softText(12).optional(),
  tasks: z
    .array(
      z.object({
        label: text(40),
        start: ganttPoint,
        end: ganttPoint,
        group: softText(24).optional(),
        /** How far along it is, 0 to 100. */
        progress: z.number().min(0).max(100).optional(),
        note: softText(300).optional(),
      }),
    )
    .min(1)
    .max(24),
});

/** A button that saves what is on screen as a file, with no model call. */
export const uiExportSchema = z.object({
  type: z.literal("export"),
  label: text(40),
  filename: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,59}$/, "export filenames are plain")
    .transform((value) => value.replace(/\.[A-Za-z0-9]{1,5}$/, "")),
  format: z.enum(["csv", "txt", "md", "json"]).default("txt"),
  /** The file's text; may use {id} values from inputs. */
  text: softText(20_000).optional(),
  /** Save the nth table on the panel (counting from 0) instead of text. */
  table: z.number().int().min(0).max(15).optional(),
});

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

export const uiMapSchema = z.object({
  type: z.literal("map"),
  title: softText(60).optional(),
  zoom: z.number().int().min(1).max(19).optional(),
  route: z.boolean().optional(),
  markers: z
    .array(
      z.object({
        label: text(60),
        q: softText(120).optional(),
        lat: latitude.optional(),
        lng: longitude.optional(),
        note: softText(180).optional(),
        icon: softText(8).optional(),
        image: z
          .string()
          .trim()
          .regex(/^https:\/\/\S{6,1000}$/, "marker images are https")
          .optional(),
      }),
    )
    .min(1)
    .max(15),
});

export const uiChecklistSchema = z.object({
  type: z.literal("checklist"),
  items: z
    .array(
      z.object({
        id: idSchema,
        label: text(80),
        done: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(30),
});

export const uiStatSchema = z.object({
  type: z.literal("stat"),
  id: idSchema.optional(),
  label: text(60),
  value: finite.optional(),
  compute: computeText.optional(),
  prefix: z.string().max(12).optional(),
  suffix: z.string().max(12).optional(),
});

export const uiTextSchema = z.object({ type: z.literal("text"), text: text(600) });

export const uiTableSchema = z.object({
  type: z.literal("table"),
  columns: z.array(text(28)).min(1).max(6),
  rows: z
    .array(z.array(z.string().transform((value) => value.slice(0, 240))).min(1).max(8))
    .min(1)
    .max(30),
});

export const uiChartSchema = z.object({
  type: z.literal("chart"),
  kind: z.enum(["bar", "line"]),
  labels: z.array(text(16)).min(1).max(24),
  values: z.array(chartValue).min(1).max(24),
  label: softText(60).optional(),
});

export const uiBreakdownSchema = z
  .object({
    type: z.literal("breakdown"),
    label: softText(70).optional(),
    prefix: z.string().max(12).optional(),
    suffix: z.string().max(12).optional(),
    items: z
      .array(
        z
          .object({
            label: text(48),
            value: finite.min(0).optional(),
            compute: computeText.optional(),
            color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
          })
          .refine((item) => item.value !== undefined || item.compute !== undefined, {
            message: "breakdown item needs a value or compute",
          }),
      )
      .min(2)
      .max(8),
  })
  .refine((node) => node.items.some((item) => item.compute || (item.value ?? 0) > 0), {
    message: "breakdown needs a positive value",
  });

export const uiProgressSchema = z.object({
  type: z.literal("progress"),
  label: text(60),
  value: finite,
  max: finite.positive().optional(),
});

export const uiButtonSchema = z.object({
  type: z.literal("button"),
  label: text(40),
  message: text(300),
});

export const uiCalloutSchema = z.object({
  type: z.literal("callout"),
  text: text(320),
  tone: z.enum(["note", "warning"]).optional(),
});

/** A text or number input the reader fills in; submitting sends a message. */
const uiFormFieldSchema = z.object({
  id: idSchema,
  label: text(60),
  kind: z.enum(["text", "number"]).default("text"),
  placeholder: softText(60).optional(),
  value: z.union([softText(200), finite]).optional(),
});

export const uiFormSchema = z.object({
  type: z.literal("form"),
  label: text(40),
  /** Sent on submit; {field_id} is replaced with what the reader typed. */
  message: text(400),
  fields: z.array(uiFormFieldSchema).min(1).max(6),
});

/** A short walkthrough the reader pages through with Back and Next. */
export const uiStepsSchema = z.object({
  type: z.literal("steps"),
  id: idSchema,
  items: z
    .array(z.object({ title: text(80), text: softText(400).optional() }))
    .min(2)
    .max(12),
});

/** One multiple-choice question in a quiz. `answer` is the index of the right option. */
const uiQuizQuestionSchema = z.object({
  question: text(240),
  options: z.array(text(160)).min(2).max(5),
  answer: z.number().int().min(0).max(4),
  explanation: softText(400).optional(),
});

/** A quiz the reader works through: they pick an answer, see why, then move on. */
export const uiQuizSchema = z.object({
  type: z.literal("quiz"),
  id: idSchema,
  questions: z.array(uiQuizQuestionSchema).min(1).max(10),
});

/** Single choice shown as cards with radio dots. Sends nothing by itself. */
export const uiChoiceSchema = z.object({
  type: z.literal("choice"),
  id: idSchema,
  label: text(120),
  options: z.array(z.object({ value: text(40), label: text(120) })).min(2).max(8),
  value: text(40),
});

/** Tappable follow-up suggestions. Each one sends its message as the reader's next turn. */
export const uiSuggestionsSchema = z.object({
  type: z.literal("suggestions"),
  items: z
    .array(z.object({ label: text(60), message: text(300) }))
    .min(1)
    .max(6),
});

export const uiRowSchema = z.object({
  type: z.literal("row"),
  columns: z.number().int().min(2).max(3),
  blocks: z
    .array(
      z.union([
        uiSliderSchema,
        uiNumberSchema,
        uiSelectSchema,
        uiToggleSchema,
        uiStepperSchema,
        uiCopySchema,
        uiImageSchema,
        uiStatSchema,
        uiTextSchema,
        uiProgressSchema,
        uiCalloutSchema,
        uiButtonSchema,
      ]),
    )
    .min(1)
    .max(9),
});

export const uiNodeSchema = z.union([
  uiSliderSchema,
  uiNumberSchema,
  uiSelectSchema,
  uiToggleSchema,
  uiStepperSchema,
  uiCopySchema,
  uiImageSchema,
  uiEntitySchema,
  uiTimelineSchema,
  uiDiagramSchema,
  uiMindmapSchema,
  uiSceneSchema,
  uiGanttSchema,
  uiExportSchema,
  uiMapSchema,
  uiChecklistSchema,
  uiStatSchema,
  uiTextSchema,
  uiTableSchema,
  uiChartSchema,
  uiBreakdownSchema,
  uiProgressSchema,
  uiButtonSchema,
  uiCalloutSchema,
  uiRowSchema,
  uiFormSchema,
  uiStepsSchema,
  uiQuizSchema,
  uiChoiceSchema,
  uiSuggestionsSchema,
]);

export const uiSpecSchema = z.object({
  title: text(80).optional(),
  blocks: z.array(uiNodeSchema).min(1).max(16),
});

export type UiSliderNode = z.infer<typeof uiSliderSchema>;
export type UiNumberNode = z.infer<typeof uiNumberSchema>;
export type UiSelectNode = z.infer<typeof uiSelectSchema>;
export type UiToggleNode = z.infer<typeof uiToggleSchema>;
export type UiStepperNode = z.infer<typeof uiStepperSchema>;
export type UiCopyNode = z.infer<typeof uiCopySchema>;
export type UiImageNode = z.infer<typeof uiImageSchema>;
export type UiEntityNode = z.infer<typeof uiEntitySchema>;
export type UiTimelineNode = z.infer<typeof uiTimelineSchema>;
export type UiDiagramNode = z.infer<typeof uiDiagramSchema>;
export type UiMindmapNode = z.infer<typeof uiMindmapSchema>;
export type UiSceneNode = z.infer<typeof uiSceneSchema>;
export type UiScenePart = z.infer<typeof uiScenePartSchema>;
export type UiGanttNode = z.infer<typeof uiGanttSchema>;
export type UiExportNode = z.infer<typeof uiExportSchema>;
export type UiMapNode = z.infer<typeof uiMapSchema>;
export type UiChecklistNode = z.infer<typeof uiChecklistSchema>;
export type UiStatNode = z.infer<typeof uiStatSchema>;
export type UiTextNode = z.infer<typeof uiTextSchema>;
export type UiTableNode = z.infer<typeof uiTableSchema>;
export type UiChartNode = z.infer<typeof uiChartSchema>;
export type UiBreakdownNode = z.infer<typeof uiBreakdownSchema>;
export type UiProgressNode = z.infer<typeof uiProgressSchema>;
export type UiButtonNode = z.infer<typeof uiButtonSchema>;
export type UiCalloutNode = z.infer<typeof uiCalloutSchema>;
export type UiRowNode = z.infer<typeof uiRowSchema>;
export type UiFormNode = z.infer<typeof uiFormSchema>;
export type UiFormField = z.infer<typeof uiFormFieldSchema>;
export type UiStepsNode = z.infer<typeof uiStepsSchema>;
export type UiQuizNode = z.infer<typeof uiQuizSchema>;
export type UiChoiceNode = z.infer<typeof uiChoiceSchema>;
export type UiSuggestionsNode = z.infer<typeof uiSuggestionsSchema>;
export type UiNode = z.infer<typeof uiNodeSchema>;
export type UiSpec = z.infer<typeof uiSpecSchema>;
export type UiValue = number | string | boolean;

/** JSON with the two gentle repairs worth attempting before giving up. */
function parseSpecJson(source: string): unknown {
  const cleaned = source
    .replace(/,\s*""\s*(?=[,}\]])/g, "")
    .replace(/\[\s*""\s*[,\]]/g, (match) => (match.endsWith("]") ? "[]" : "["));
  const bases = cleaned !== source ? [source, cleaned] : [source];
  const candidates: string[] = [];
  for (const base of bases) {
    candidates.push(base);
    const trimmedTrailingCommas = base.replace(/,\s*([}\]])/g, "$1");
    if (trimmedTrailingCommas !== base) candidates.push(trimmedTrailingCommas);
    const repaired = repairBrackets(base);
    if (repaired) candidates.push(repaired);
    const truncated = salvageTruncatedSpec(base);
    if (truncated) candidates.push(truncated);
  }
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace > 0 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/**
 * A reply cut off mid-spec still has complete blocks before the cut. Find the
 * last top-level comma inside "blocks" that leaves a complete element, close
 * the arrays there, and let the caller keep whatever validates.
 */
function salvageTruncatedSpec(source: string): string | null {
  const blocksAt = source.indexOf('"blocks"');
  if (blocksAt < 0) return null;
  const openAt = source.indexOf("[", blocksAt);
  if (openAt < 0) return null;
  const cuts: number[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = openAt; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") depth -= 1;
    else if (char === "," && depth === 1) cuts.push(index);
  }
  for (let cut = cuts.length - 1; cut >= 0; cut -= 1) {
    const candidate = `${source.slice(0, cuts[cut])}]}`;
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // try an earlier cut
    }
  }
  return null;
}

/**
 * Models occasionally get bracket nesting wrong: dropping the last closers,
 * or closing an array with a brace. This rebuilds the source with the
 * missing closers inserted where the shape demands them, and drops stray
 * closers that have no opener. String contents are copied untouched.
 */
function repairBrackets(source: string): string | null {
  const stack: string[] = [];
  let out = "";
  let inString = false;
  let escaped = false;
  let changed = false;
  for (const char of source) {
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === "{" || char === "[") {
      stack.push(char);
      out += char;
      continue;
    }
    if (char === "}" || char === "]") {
      const expected = char === "}" ? "{" : "[";
      while (stack.length > 0 && stack[stack.length - 1] !== expected) {
        out += stack.pop() === "{" ? "}" : "]";
        changed = true;
      }
      if (stack.length === 0) {
        changed = true; // stray closer with no opener: drop it
        continue;
      }
      stack.pop();
      out += char;
      continue;
    }
    out += char;
  }
  if (inString) {
    out += '"';
    changed = true;
  }
  while (stack.length > 0) {
    out += stack.pop() === "{" ? "}" : "]";
    changed = true;
  }
  return changed ? out : null;
}

/** Reads the fence body of a `ui` block into a validated spec, or null. */
export function parseUiSpec(source: string): UiSpec | null {
  const trimmed = source.trim();
  if (!trimmed) return null;
  const raw = parseSpecJson(trimmed);
  if (raw === null) return null;
  const parsed =
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    !("blocks" in raw) &&
    typeof (raw as { type?: unknown }).type === "string"
      ? { blocks: [raw] }
      : raw;
  healSpec(parsed);
  const result = uiSpecSchema.safeParse(parsed);
  if (result.success) return result.data;
  // A cut-off or odd block should not cost the whole panel: keep the blocks
  // that do validate and drop the rest.
  const candidate = parsed as { title?: unknown; blocks?: unknown };
  if (!candidate || !Array.isArray(candidate.blocks)) return null;
  const good = candidate.blocks.filter((node) => uiNodeSchema.safeParse(node).success);
  if (good.length === 0) return null;
  const salvaged = uiSpecSchema.safeParse({
    ...(typeof candidate.title === "string" ? { title: candidate.title } : {}),
    blocks: good.slice(0, 16),
  });
  return salvaged.success ? salvaged.data : null;
}

/**
 * Small model slips that should never cost the whole panel: stray junk
 * entries in block arrays, and tables flattened into one big row.
 */
function healSpec(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const blocks = (value as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) return;
  const usableBlock = (node: unknown): boolean => {
    if (!node || typeof node !== "object") return false;
    const block = node as Record<string, unknown>;
    if (block.type !== "map" || !Array.isArray(block.markers)) return true;
    const markers = block.markers.filter((marker) => {
      if (!marker || typeof marker !== "object") return false;
      const m = marker as Record<string, unknown>;
      const hasCoords = typeof m.lat === "number" && typeof m.lng === "number";
      const hasQuery = typeof m.q === "string" && m.q.trim().length > 0;
      return hasCoords || hasQuery;
    });
    block.markers = markers;
    return markers.length > 0;
  };
  (value as { blocks: unknown[] }).blocks = blocks.filter(usableBlock);
  const visit = (nodes: unknown[]) => {
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const block = node as Record<string, unknown>;
      if (block.type === "row" && Array.isArray(block.blocks)) {
        const children = block.blocks.filter(
          (child) => child && typeof child === "object",
        );
        block.blocks = children;
        visit(children);
        continue;
      }
      if (block.type !== "table") continue;
      const columns = Array.isArray(block.columns) ? block.columns.length : 0;
      if (columns < 1 || !Array.isArray(block.rows)) continue;
      const rows = block.rows as unknown[];
      const chunk = (cells: unknown[]) => {
        const out: unknown[][] = [];
        for (let index = 0; index < cells.length; index += columns) {
          out.push(cells.slice(index, index + columns));
        }
        return out;
      };
      if (rows.length > 0 && rows.every((row) => typeof row === "string")) {
        if (rows.length % columns === 0) block.rows = chunk(rows);
        continue;
      }
      if (rows.length === 1 && Array.isArray(rows[0])) {
        const cells = rows[0] as unknown[];
        if (cells.length > columns && cells.length % columns === 0) {
          block.rows = chunk(cells);
        }
      }
    }
  };
  visit((value as { blocks: unknown[] }).blocks);
}

/**
 * Safety net for replies that came back as a bare spec paragraph without the
 * fence: the API wraps it before storing, so the web renderer sees a normal
 * `ui` block. Anything without a standalone, valid spec paragraph is returned
 * untouched.
 */
export function wrapLooseUiSpec(text: string): string {
  if (text.includes("```")) return text;
  const paragraphs = text.split(/\n{2,}/);
  for (let index = 0; index < paragraphs.length; index += 1) {
    const candidate = paragraphs[index].trim();
    if (!candidate.startsWith("{") || !candidate.endsWith("}")) continue;
    if (!parseUiSpec(candidate)) continue;
    paragraphs[index] = `\`\`\`${UI_BLOCK_LANGUAGE}\n${candidate}\n\`\`\``;
    return paragraphs.join("\n\n");
  }
  return text;
}

type Token =
  | { kind: "number"; value: number }
  | { kind: "ident"; value: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" | "^" | "(" | ")" };

function tokenize(expression: string): Token[] | null {
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if ("+-*/^()".includes(char)) {
      tokens.push({
        kind: "op",
        value: char as "+" | "-" | "*" | "/" | "^" | "(" | ")",
      });
      index += 1;
      continue;
    }
    const number = /^\d+(\.\d+)?/.exec(expression.slice(index));
    if (number) {
      tokens.push({ kind: "number", value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    const ident = /^[a-z_][a-z0-9_]*/i.exec(expression.slice(index));
    if (ident) {
      tokens.push({ kind: "ident", value: ident[0] });
      index += ident[0].length;
      continue;
    }
    return null;
  }
  return tokens;
}

/**
 * Evaluates the simple arithmetic in `stat.compute`: + - * / ^ and parentheses
 * over numbers and the ids of slider and number inputs. Returns null on
 * anything unexpected, and the caller shows the static value instead.
 */
export function computeExpression(
  expression: string,
  scope: Record<string, number>,
): number | null {
  const tokens = tokenize(expression);
  if (!tokens || tokens.length === 0) return null;
  let index = 0;

  const peek = (): Token | undefined => tokens[index];

  const parseFactor = (): number | null => {
    const token = peek();
    if (!token) return null;
    if (token.kind === "number") {
      index += 1;
      return token.value;
    }
    if (token.kind === "ident") {
      index += 1;
      const value = scope[token.value];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }
    if (token.kind === "op" && token.value === "(") {
      index += 1;
      const value = parseSum();
      const closing = peek();
      if (value === null || !closing || closing.kind !== "op" || closing.value !== ")") {
        return null;
      }
      index += 1;
      return value;
    }
    if (token.kind === "op" && token.value === "-") {
      index += 1;
      const value = parseFactor();
      return value === null ? null : -value;
    }
    return null;
  };

  const parsePower = (): number | null => {
    const base = parseFactor();
    if (base === null) return null;
    const token = peek();
    if (!token || token.kind !== "op" || token.value !== "^") return base;
    index += 1;
    const exponent = parsePower();
    return exponent === null ? null : base ** exponent;
  };

  const parseProduct = (): number | null => {
    let value = parsePower();
    if (value === null) return null;
    for (;;) {
      const token = peek();
      if (!token || token.kind !== "op" || (token.value !== "*" && token.value !== "/")) {
        return value;
      }
      index += 1;
      const next = parsePower();
      if (next === null) return null;
      value = token.value === "*" ? value * next : value / next;
    }
  };

  const parseSum = (): number | null => {
    let value = parseProduct();
    if (value === null) return null;
    for (;;) {
      const token = peek();
      if (!token || token.kind !== "op" || (token.value !== "+" && token.value !== "-")) {
        return value;
      }
      index += 1;
      const next = parseProduct();
      if (next === null) return null;
      value = token.value === "+" ? value + next : value - next;
    }
  };

  const value = parseSum();
  if (value === null || index !== tokens.length || !Number.isFinite(value)) return null;
  return value;
}

export function checklistValueId(id: string): string {
  return `__check__${id}`;
}

/** The starting values for a spec's interactive inputs, keyed by id. */
export function initialUiState(spec: UiSpec): Record<string, UiValue> {
  const state: Record<string, UiValue> = {};
  const collect = (nodes: UiNode[]) => {
    for (const node of nodes) {
      switch (node.type) {
        case "slider":
          state[node.id] = clamp(node.value, node.min, node.max);
          break;
        case "number":
          state[node.id] = clamp(node.value, node.min ?? -Infinity, node.max ?? Infinity);
          break;
        case "stepper":
          state[node.id] = clamp(node.value, node.min ?? -Infinity, node.max ?? Infinity);
          break;
        case "select":
          state[node.id] = node.options.some((option) => option.value === node.value)
            ? node.value
            : node.options[0].value;
          break;
        case "toggle":
          state[node.id] = node.value;
          break;
        case "checklist":
          for (const item of node.items) {
            state[checklistValueId(item.id)] = item.done ?? false;
          }
          break;
        case "form":
          for (const field of node.fields) {
            state[field.id] =
              field.kind === "number"
                ? clamp(typeof field.value === "number" ? field.value : 0, -Infinity, Infinity)
                : typeof field.value === "string"
                  ? field.value
                  : "";
          }
          break;
        case "steps":
          state[node.id] = 0;
          break;
        case "mindmap":
          // The branch picked ("" for none).
          state[node.id] = "";
          break;
        case "scene":
        case "diagram":
          // The chosen group ("" is all parts) and how far apart the parts sit.
          state[node.id] = "";
          state[`${node.id}_spread`] = 0;
          break;
        case "quiz":
          // Where the reader is, and each question's pick (-1 for none yet).
          state[`${node.id}_step`] = 0;
          node.questions.forEach((_, index) => {
            state[`${node.id}_pick_${index}`] = -1;
          });
          break;
        case "choice":
          state[node.id] = node.options.some((option) => option.value === node.value)
            ? node.value
            : node.options[0].value;
          break;
        case "row":
          collect(node.blocks);
          break;
        default:
          break;
      }
    }
  };
  collect(spec.blocks);
  return state;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function formatUiNumber(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString("en-GB");
  return value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

/** Fills `{id}` placeholders in button messages from the current values. */
export function resolveUiTemplate(
  template: string,
  scope: Record<string, UiValue>,
): string {
  return template.replace(/\{([A-Za-z0-9][A-Za-z0-9_]*)\}/g, (match, id: string) => {
    if (!(id in scope)) return match;
    const value = scope[id];
    if (typeof value === "boolean") return value ? "on" : "off";
    if (typeof value === "number") return formatUiNumber(value);
    return value;
  });
}
