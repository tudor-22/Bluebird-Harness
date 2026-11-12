import type { ExtraTool } from "./tools";

/** The two work modes a message can start with: `/swarm …` and `/research …`. */
export type AgentMode = "swarm" | "research";

/** A swarm never has more than this many agents at once. */
export const SWARM_MAX_AGENTS = 4;
/** Deep research gets this many tool calls, plan updates not counted. */
export const RESEARCH_MAX_CALLS = 30;

export function detectMode(text: string): { mode: AgentMode | null; task: string } {
  const match = /^\s*\/(swarm|research)(?=\s|$|:)[:\s]*([\s\S]*)$/i.exec(text);
  if (!match) return { mode: null, task: text };
  return { mode: match[1].toLowerCase() as AgentMode, task: match[2].trim() };
}

/** Research is for the web: the browser, a little memory, and the plan. Nothing that changes files or runs commands. */
export function researchAllows(name: string): boolean {
  if (name.startsWith("browser_")) return name !== "browser_upload";
  return ["plan_update", "page_images", "fetch_image", "memory_search", "recall_chat", "skill_view"].includes(name);
}

/** Browser actions research may take without asking: it reads, scrolls and follows links, in the background. */
export function researchAutoBrowser(name: string): boolean {
  return name.startsWith("browser_") && name !== "browser_upload" && name !== "browser_eval";
}

export function modeNote(mode: AgentMode, task: string): string {
  if (mode === "research") {
    return [
      `Deep research mode. The person wants a thorough, sourced answer to: "${task || "their question"}".`,
      `You have at most ${RESEARCH_MAX_CALLS} tool calls for the whole job (plan updates are free), and only the web tools. The browser works in the background, in its own window the person does not have to watch.`,
      "Start with plan_update: three to six steps, such as the angles to cover. Then search (browser_open on a search results page), open the six to ten most promising and most authoritative pages in the one tab already open, and take what you need from each page's outline instead of screenshots. Prefer primary sources, official documentation and recent dates; cross-check any number or claim that matters on a second source; when sources disagree, say so.",
      `Keep two calls spare. Each tool result ends with how many calls are used; when about ${RESEARCH_MAX_CALLS - 2} are used, or you have enough, stop and write the report.`,
      "Write the report as: a two- or three-sentence answer first, then the findings under short headings, then what is uncertain or missing, then the sources as markdown links with the page title. Never state something you did not read on a page.",
    ].join(" ");
  }
  return [
    `Swarm mode. The person wants this done by a team: "${task || "their task"}".`,
    `Break it into two to ${SWARM_MAX_AGENTS} separate jobs that can run side by side, each with a clear specialty (for example researcher, implementer, reviewer, tester), then start them together with one swarm_run call. Never more than ${SWARM_MAX_AGENTS} agents. Do not use swarm_run for something one agent can do.`,
    "Give each agent a complete brief, since it starts with no memory of this conversation: what to do, what to report, and which files or pages it owns, so two agents never edit the same file. Only one agent may use the browser (set browser true on it); the others work with files and commands. Agents can leave notes for each other on a shared board.",
    "Call plan_update first with the stages (split, run the agents, combine). When swarm_run returns, check the reports against each other, fix gaps or contradictions yourself or with one more swarm_run, and give the person one combined answer.",
  ].join(" ");
}

/** A shared board the agents of one swarm write to and read from while they work. */
export type BoardEntry = { by: string; note: string };

export function boardTools(board: BoardEntry[], by: string): ExtraTool[] {
  const empty = { type: "object", properties: {}, additionalProperties: false } as const;
  return [
    {
      kind: "read",
      spec: {
        name: "board_post",
        description: "Leave a short note on the swarm's shared board for your teammates: a finding, a decision, a file you changed, or something you need from them.",
        parameters: { type: "object", properties: { note: { type: "string" } }, required: ["note"], additionalProperties: false },
      },
      prepare(args) {
        const note = typeof args.note === "string" ? args.note.trim().slice(0, 800) : "";
        return {
          name: "board_post",
          kind: "read",
          summary: "Post to the team board",
          scope: "read",
          async run() {
            if (!note) return "Nothing to post.";
            board.push({ by, note });
            if (board.length > 60) board.splice(0, board.length - 60);
            return "Posted.";
          },
        };
      },
    },
    {
      kind: "read",
      spec: { name: "board_read", description: "Read what your teammates have posted on the swarm's shared board.", parameters: empty },
      prepare() {
        return {
          name: "board_read",
          kind: "read",
          summary: "Read the team board",
          scope: "read",
          async run() {
            const others = board.filter((entry) => entry.by !== by);
            return others.length ? others.map((entry) => `[${entry.by}] ${entry.note}`).join("\n") : "Nothing from teammates yet.";
          },
        };
      },
    },
  ];
}

/** Runs several async streams at once and yields their items as they arrive, tagged with the stream they came from. */
export async function* interleave<T>(streams: AsyncIterable<T>[]): AsyncGenerator<{ index: number; value: T }> {
  const iterators = streams.map((stream) => stream[Symbol.asyncIterator]());
  type Step = { index: number; result: IteratorResult<T> };
  const pending = new Map<number, Promise<Step>>();
  const pull = (index: number) => pending.set(index, iterators[index].next().then((result) => ({ index, result })));
  iterators.forEach((_, index) => pull(index));
  while (pending.size > 0) {
    const { index, result } = await Promise.race(pending.values());
    if (result.done) {
      pending.delete(index);
      continue;
    }
    yield { index, value: result.value };
    pull(index);
  }
}
