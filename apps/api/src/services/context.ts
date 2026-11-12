import type { DbClient } from "../db/pool";
import type { EmbeddingProvider } from "../embeddings/types";
import type { ModelMessage } from "../model/types";
import { env } from "../env";
import { identityPrompt, type RunningModel } from "./identity";
import { formatLocalStamp, loadRecentMessages, toModelMessages } from "./messages";

/** How much of the thread rides in the prompt untouched. */
export const HISTORY_WINDOW = 60;
/** Retrieve more archive moments now that compaction can remove them from the live tail. */
export const RETRIEVAL_LIMIT = 10;
export const RETRIEVAL_MIN_SCORE = 0.3;
/** Active long-term memories carried on every turn, independent of message compaction. */
export const MEMORY_LIMIT = 12;
const MEMORY_CHAR_BUDGET = 6_000;
const MESSAGE_TIMES_NOTE =
  "Messages from them end with a (sent YYYY-MM-DD HH:mm) marker in their local time. Use " +
  "those markers whenever they ask when something was said, what time it was, or how long " +
  "ago it happened. The markers are metadata, never part of the wording: never copy or " +
  "echo a timestamp, never begin a reply with one, and never say you do not have message times.";

/**
 * The interactive panel capability. The model may append one fenced `ui`
 * block to a reply; the web app renders it with native components against the
 * shared `ui-spec` schema.
 */
export const UI_KIT_NOTE = [
  "Answer in plain prose by default. Build a ui panel only when the person asks to see, show,",
  "visualise, diagram, simulate or play with something, or when numbers or a relationship are best",
  "explored with controls. Never add a diagram, mindmap or overview graphic to a normal answer, and never",
  "make one to describe yourself, your abilities or what you can reach. When a diagram is asked for: draw a diagram block with shaped parts, groups, arrowed links and a",
  "note on each part, or a mindmap for a topic broken into ideas, then explain it briefly in prose. Numbers, trade-offs and what-ifs:",
  "sliders or steppers with computed stats, a chart or a breakdown. A process over time, a plan",
  "or a project: a timeline or a gantt. Steps and quizzes are only for when the person asks for them: never add a quiz, test or practice questions on your own, even when explaining something to learn.",
  "Data they may want to keep: a table with an export button. Places: a map. Something to",
  "play with, a game or a simulation: an app block. When the person says visualise, show,",
  "draw, diagram, simulate, explain how or walk me through, always build the visual.",
  "A visual never replaces the explanation: write a short, clear answer in prose and let the",
  "panel carry the structure. Do not repeat the same content in both.",
  "Plain greetings, quick facts, short answers and casual chat stay as ordinary Markdown with",
  "short paragraphs, bold lead-ins only where they help scanning, and lists only when a list",
  "is the clearest shape. A to-do list, set of steps or itinerary with nothing to explore can",
  "stay a Markdown list unless they ask for an interactive version.",
  "Maths, formulas, calculations, quantitative explanations and learning-by-changing-examples",
  "always get an interactive panel when numbers or a relationship can be explored. Render",
  "formulas as LaTeX with $...$ for inline maths or $$...$$ for a display formula, never as",
  "code. Include adjustable inputs plus computed stats, and add a breakdown or chart when it",
  "makes the relationship easier to see.",
  "Web pages: when the person asks you to build a website, web page, landing page, game or",
  "tool, write it as an app block so it appears live right in the reply, and keep your prose to",
  "a short description of what you built. When you show HTML or SVG as code to read or copy,",
  "put it in a fenced block tagged html or svg: the reader gets a Preview button on it. Code in",
  "any other language is only shown, so never say the reader can run it from the chat.",
  "When a map is useful, add only the map block with a marker for each place.",
  "Interactive panels go in ONE fenced block at the end of your message, after your prose.",
  "Pictures and entity cards are the exceptions and are not end panels: write a web picture in",
  "Markdown, on its own line as ![short caption](url), immediately after the paragraph that",
  "talks about that place, product or thing. Put an entity-card block immediately after the",
  "paragraph that introduces the things being compared. Then keep writing. A reply may contain",
  "several pictures and entity blocks placed like that.",
  "Every fenced block must be fenced exactly like this, with the opening fence line and the",
  "closing fence line included, and the JSON on its own lines between them:",
  "```ui",
  '{"title":"Split the bill","blocks":[{"type":"number","id":"total","label":"Total","min":0,"step":1,"value":80},{"type":"number","id":"people","label":"People","min":1,"step":1,"value":4},{"type":"stat","label":"Each pays","compute":"total / people","prefix":"£"}]}',
  "```",
  "Without the fence lines the panel cannot appear, so never write the JSON on its own.",
  "Tables are strict: rows is an array of arrays, and every row has its own square brackets",
  'around its cells, exactly like [["a","b"],["c","d"]], never bare strings floating inside rows.',
  "Checklists are strict too: every item is {\"id\":\"short_id\",\"label\":\"One line\"}.",
  "When a panel is justified, match the shape to the content: interactive numbers become",
  "sliders, steppers or number inputs with computed stats; real choices become selects or",
  "buttons; composition or shares become a breakdown; projections become a bar or line",
  "chart; progress becomes a progress block; a timeline or map is appropriate only when",
  "the visual ordering or geography is materially useful.",
  "Never write CSS, HTML, SVG or JavaScript for an ordinary visual, layout or chart; the ui block",
  "does that. The one exception is an app block, described below, for a tool or game the reader",
  "asked for. A code block is only ever for real coding questions.",
  "When in doubt, leave the panel out and write the answer normally.",
  "Inside the block put only valid JSON: no comments, no trailing commas, no backslashes",
  'anywhere, and no double quotes inside strings. Shape: {"title":"optional","blocks":[...]}.',
  "Block types: slider {type,id,label,min,max,step?,value}; number {type,id,label,min?,max?,step?,value};",
  "stepper {type,id,label,min?,max?,step?,value} for a plus and minus counter;",
  "select {type,id,label,options:[{value,label}],value}; toggle {type,id,label,value};",
  'stat {type,label,value,prefix?,suffix?} where value may be replaced by compute, simple arithmetic over slider, number and stepper ids like "seats * 29" or "principal * (1 + rate / 100) ^ years";',
  "checklist {type,items:[{id,label,done?}]}; table {type,columns:[...],rows:[[...]]};",
  'chart {type,kind:"bar" or "line",labels:[...],values:[...]}; progress {type,label,value,max?}; text {type,text};',
  'breakdown {type,label?,prefix?,suffix?,items:[{label,value? or compute?,color?}]} draws a stacked composition bar with a legend, values and percentages; each computed item uses input ids, so the graph reacts to sliders;',
  "button {type,label,message} where message may reference input values as {id};",
  "copy {type,label,text} copies text for the user when tapped, and text may reference input values as {id}, useful for lists they need elsewhere;",
  "image {type,attachmentId? or url?,caption?} shows a picture inside a panel: attachmentId for an image they sent, using an id from the image list, or a url from the live search results; never invent either; use this only for a picture the person attached or for a deliberate side-by-side comparison, because web pictures normally go inline in the reply as Markdown images;",
  "when the answer is visual, put each web picture inline as ![short caption](url) right after the paragraph it illustrates, never in a gallery at the end;",
  "Entity cards are the preferred shape when the answer assesses specific things, not general advice: a fish, product, hotel, destination, piece of gear or option. Put an inline entity-card block right after the paragraph that introduces it. Each card gets an image from the live pictures, a short tag with a tone, the verdict in one or two sentences, and the source. If two or more things are assessed, give each its own card. Keep the prose to a short intro and the final recommendation, put the assessment in the cards, and never repeat the same points in both. A picture used in a card must not also be added as a standalone Markdown image.",
  'Entity-card example shape: ```ui {"blocks":[{"type":"entity","title":"Blue parrotfish hybrid","imageUrl":"PICTURE_URL","tag":"Not suitable for 100 L","tone":"bad","text":"Grows to 15 to 20 cm and needs a larger tank.","sourceLabel":"Tropical Fish","sourceUrl":"SOURCE_URL"}]} ```. Replace PICTURE_URL and SOURCE_URL with the real live urls; never output the placeholders.',
  'entity {type,title,imageUrl? or attachmentId?,tag?,tone? "neutral"|"good"|"warn"|"bad",text,sourceLabel?,sourceUrl?} is a compact card for one specific product, animal, hotel, destination, gear item or option. Use one or more when assessing specific things, especially with a suitability or status tag. Give it a live-search picture url when available, a short tag, one or two sentences and the source link. Put the entity block immediately after the paragraph that introduces them, then continue. Do not repeat the same thing in prose and cards;',
  "form {type,label,message,fields:[{id,label,kind:'text' or 'number',placeholder?,value?}]} asks the reader for details you need to answer, such as a bill total, a budget, dates or a number of people. label is the submit button text. message is sent as their message when they submit, with {field_id} replaced by what they typed. Use at most six fields, and only when you genuinely need the details;",
  "steps {type,id,items:[{title,text?}]} is a walkthrough the reader pages through with Back and Next. Use it only when they ask for an interactive or step-by-step walkthrough; plain steps stay as a Markdown list;",
  "quiz {type,id,questions:[{question,options:[2 to 5 short strings],answer,explanation?}]} is a learning quiz the reader works through one question at a time. answer is the index of the right option, counting from 0, and it must not always be 0, so vary it. explanation says why, in one or two sentences. Use a quiz only when they explicitly ask to be quizzed, to practise, revise or test themselves. Never add one unprompted. Give three to six questions;",
  "choice {type,id,label,options:[{value,label}],value} shows single-choice cards for the reader to pick from. Use it with a button whose message uses {id}, for example to ask when they are going and then plan with the chosen season. value is the option selected at first;",
  "text and callout blocks accept Markdown and LaTeX: use $...$ for an inline formula and $$...$$ for a display formula, exactly as in the prose;",
  "suggestions {type,items:[{label,message}]} shows up to three tappable follow-up pills, with short labels; a tap sends its message as the reader's next turn. Use it at the end of a plan or a long answer to offer the most useful next step;",
  "timeline {type,items:[{time?,title,note?}]} lays out a day or a trip as stops in order;",
  "diagram {type,id,title?,parts:[{label,group?,shape?,icon?,x?,y?,note?}],links?:[{from,to,label?,style?,arrow?}],captions?:{group:text},layout?,direction?,playable?,spread?} draws labelled, shaped parts joined by arrowed links. For flows, pipelines, architectures, processes and org charts set layout to \"auto\" (and direction \"LR\" or \"TB\") and leave x and y out: the parts are placed in layers by their links, so you never work out coordinates. For a physical arrangement give x (0 to 100) and y (0 to 60) as the parts sit when assembled. shape is box, pill (start or end), diamond (a decision), circle, database (a store) or hexagon; icon is one emoji such as \"🗄\"; groups are colour-coded automatically, so give related parts the same group name. A link can be style solid, dashed (optional or async) or dotted, and carries a short label such as \"yes\" or \"HTTP\". The reader can press Play flow to watch the sequence light up part by part, pull the parts apart with an Expansion slider, pick a group chip, and tap a part for its note. Keep labels under 24 characters, 5 to 14 parts, a note on each, and name each link by the part labels. Example, shortened: {\"type\":\"diagram\",\"id\":\"login\",\"title\":\"Sign-in\",\"layout\":\"auto\",\"parts\":[{\"label\":\"User\",\"shape\":\"pill\",\"icon\":\"🙂\",\"group\":\"Client\"},{\"label\":\"Valid?\",\"shape\":\"diamond\",\"group\":\"Server\",\"note\":\"Checks the password hash.\"},{\"label\":\"Users DB\",\"shape\":\"database\",\"group\":\"Server\"}],\"links\":[{\"from\":\"User\",\"to\":\"Valid?\",\"label\":\"submit\"},{\"from\":\"Valid?\",\"to\":\"Users DB\",\"label\":\"lookup\",\"style\":\"dashed\"}]};",
  "mindmap {type,id,title?,root,nodes:[{label,parent?,note?}]} draws a radial mind map with colour-coded branches. root is the central topic; each node names its parent by label (leave parent out to hang it off the centre). Use it to break a topic into ideas, summarise a subject, brainstorm or revise, with 6 to 25 nodes, two levels deep, a note on the important ones;",  "\"scene {type,id,title?,parts:[{label,shape?,position?,size?,rotation?,from?,to?,radius?,color?,group?,note?}],captions?:{group:text},spread?} draws a real 3D model from simple shapes. The reader drags to turn it, scrolls or pinches to zoom, pulls the parts apart with an Expansion slider, picks a group chip to highlight its parts, and taps a part for its note. y points up, x runs left to right and z towards the reader; keep the whole model within about 20 units across, centred near 0,0,0. shape is box (size [width,height,depth]), sphere (size [radius]), cylinder or cone (size [radius,height], standing up along y), torus (size [ring radius, tube radius], a ring facing z like a wheel seen from the side) or tube. rotation is degrees about x, y and z. A tube joins two points with from [x,y,z] and to [x,y,z] and a radius, so use tubes for rods, pipes, frames, cables and bones and never work out rotations yourself. Give every part a short label, a group and a one-sentence note, and keep it to about 25 parts. Use a scene whenever the subject is a physical thing the reader would want to turn around and take apart: a bicycle, engine, building, molecule, planet system, circuit board or anatomy. Use a diagram instead for flows and abstract structures. Example, shortened: {\"type\":\"scene\",\"id\":\"bike\",\"title\":\"Bicycle\",\"parts\":[{\"label\":\"Front wheel\",\"shape\":\"torus\",\"position\":[5,0,0],\"size\":[2.2,0.14],\"group\":\"Wheels\",\"note\":\"Rolls on the road and carries the front brake.\"},{\"label\":\"Rear wheel\",\"shape\":\"torus\",\"position\":[-5,0,0],\"size\":[2.2,0.14],\"group\":\"Wheels\"},{\"label\":\"Top tube\",\"shape\":\"tube\",\"from\":[-3,2.6,0],\"to\":[2.5,2.8,0],\"radius\":0.14,\"group\":\"Frame\",\"note\":\"Joins the seat to the steering.\"},{\"label\":\"Fork\",\"shape\":\"tube\",\"from\":[2.5,2.8,0],\"to\":[5,0,0],\"radius\":0.1,\"group\":\"Frame\"},{\"label\":\"Saddle\",\"shape\":\"box\",\"position\":[-3,3.3,0],\"size\":[1.6,0.25,0.7],\"group\":\"Rider\"}],\"captions\":{\"Wheels\":\"Both wheels are the same size here.\"}}",
  "gantt {type,title?,unit?,tasks:[{label,start,end,group?,progress?,note?}]} shows a schedule as bars on a shared axis. start and end are numbers (a week or day count, with unit naming it) or ISO dates like 2026-11-02; progress is 0 to 100. Use it for project plans and timetables, not for a plain list of steps;",
  "export {type,label,filename,format,text? or table?} is a button that saves a file with no model call. format is csv, txt, md or json. Give text, which may use {id} values, or table as the number of a table on this panel counting from 0. Use it when the reader would want to keep a table, plan or list as a file;",
  'map {type,title?,zoom?,route?,markers:[{label,q?,lat?,lng?,note?,icon?,image?}]} shows places on a route map and supports up to 15 ordered stops. Give each marker a short label and a place query q like "Sagrada Familia, Barcelona"; coordinates are optional and get filled in. For trips, road trips, delivery routes or multi-stop days, order the markers and use the map automatically. icon may be one short emoji and image may be a relevant https picture from the live results;',
  'row {type,columns:2 or 3,blocks:[...]} places blocks side by side; callout {type,text,tone:"note" or "warning"}.',
  "An app block is different: it is a fenced block whose opening line is three backticks followed by the word app and a short title, with a complete HTML document body inside, then the closing fence. It runs as a small sandboxed tool or game in the chat. Use one when the reader asks for a website, web page, game, calculator or tool to play with, or an interactive visual the other blocks cannot draw. Keep it under 300 lines, make it work on a phone, and use a single quote for every attribute and string. It cannot load anything from the internet, so never include external scripts, fonts, images, stylesheets, links or requests; draw pictures with SVG or a canvas. To send the reader's choice back into the chat, call bluebird.send('the text') from a button or key press, using the text they would have typed. Only send when they press something. Put the app block at the end of your message, after one short line that says what it does.",
  "Keep it small and tidy: at most about 12 blocks and short labels. ids are short, like cta or",
  "step_1, and each id is unique. Keep your prose close to normal and do not repeat in",
  "prose what the panel already shows. Never mention the block, the JSON, or the panel itself;",
  "it is simply part of your answer.",
].join(" ");

/**
 * The last word before the model writes, where instructions carry the most
 * weight. Keeps ordinary structure in Markdown and reserves panels for
 * genuinely interactive or visual answers.
 */
export const UI_KIT_REMINDER =
  "One last check before you answer: only build a visual panel if the person asked for one or numbers need exploring; otherwise answer in prose and never add a diagram or mindmap unprompted. " +
  "An explanation of how something works wants a diagram block (layout auto), a topic breakdown a mindmap, numbers want sliders with " +
  "computed stats or a chart, a plan wants a timeline or gantt. Never add a quiz or steps " +
  "walkthrough unless the person asked for one. Keep a short written explanation alongside the visual and do not write " +
  "the same content twice. Greetings, quick facts and casual chat stay plain Markdown. " +
  "Web pictures are written as inline Markdown images right after the paragraph they " +
  "illustrate, never in a ui gallery at the end. Use an inline entity-card block when " +
  "assessing specific products, animals, places or options. For maths or calculations, " +
  "always render the formula in LaTeX and include the interactive calculation panel when " +
  "values can change.";

/** Asks for a plan: a trip, itinerary, schedule, programme or similar. */
const PLANNING_PATTERN =
  /\b(?:plan|plans|planning|itinerary|trip|holiday|vacation|weekend|schedule|timetable|programme|program|meal\s+plan|workout\s+plan|training\s+plan|study\s+plan|revision\s+plan|roadmap|routine|agenda|road\s+trip)\b/i;

export function looksLikePlanningRequest(text: string): boolean {
  return PLANNING_PATTERN.test(text);
}

/**
 * For plans only. Shapes a plan the way a good planner would: a recommendation
 * with stated assumptions, days or phases with headings, detail per stop, cost
 * tables, and the questionnaire and follow-ups in the single ui panel.
 */
export const PLANNING_NOTE = [
  "This message asks for a plan, such as a trip, itinerary, schedule or programme. Make the",
  "plan detailed and usable, in this shape:",
  "Open with your recommendation in one or two sentences, and state the assumptions you are",
  "making (where they are travelling from, the budget, the group) so they can correct you.",
  "Organise the plan by day or by phase. Give each one a bold heading with a short theme, for",
  "example **Day 1: the historic centre**, then the stops or sessions in order.",
  "Give each stop a bold time or slot, then one or two practical sentences in ordinary prose:",
  "what to see or do, how long to allow, booking or ticket advice, a rough cost and the best",
  "timing. Keep the stops as short paragraphs rather than long bullet lists.",
  "When costs matter, give them as a Markdown table with one column per option, such as a",
  "budget option and a comfortable option, a row for each category and a total row. Say that",
  "the figures are planning estimates, not live quotes.",
  "Cover what decides whether the plan works: getting around, booking rules, opening times and",
  "anything time-sensitive such as entry requirements. If something may have changed since your",
  "knowledge, say so and recommend a quick check.",
  "When the plan is a project or anything measured in days or weeks, with tasks that overlap or",
  "follow one another, also add one gantt block to the ui panel with a bar per task (numbers for",
  "weeks or days, with unit set, or ISO dates). Keep the written plan as the main answer.",
  "When the plan involves a table of figures the reader may want to keep, add an export button",
  "for it in the same panel.",
  "If key details are missing, ask for them in the single ui panel at the end. Use one choice",
  "block per detail (when they are going, the length, the budget, who is coming, the style), at",
  "most four, with the most likely value selected. Choice blocks are cards the reader taps, so",
  "never use a select dropdown for these questions. End with one button whose message uses those",
  "ids, such as Build my plan for {when}, {length} nights.",
  "End with one suggestions block of two or three follow-ups they can tap, such as a packing",
  "list, flight tips or a different area. Put the choice blocks, the button and the suggestions",
  "in that same single ui block, choices first, and keep the rest of the reply as prose.",
  "Do not use em dashes anywhere in the reply.",
].join(" ");

const RECENT_PHRASES_HEADER =
  "Lines you used in your last replies. Do not reuse them, their wording, or their idea:";

const BEDTIME_PATTERN =
  /\b(?:go(?:ing)?\s+to\s+bed|get(?:ting)?\s+(?:some\s+)?(?:sleep|rest)|go\s+to\s+sleep|sleep\s+well|bedtime|still\s+up|still\s+awake|up\s+(?:this|so\s+|too\s+)?late|half[- ]asleep|don'?t\s+stay\s+up\s+(?:too\s+)?late|late[- ]night|call\s+it\s+a\s+night|turn\s+in|(?:need|should)\s+(?:some\s+)?(?:sleep|rest)|you\s+should\s+be\s+(?:asleep|in\s+bed)|you(?:'re| are)\s+(?:tired|exhausted)|get\s+off\s+(?:the\s+)?phone|put\s+(?:the\s+)?phone\s+(?:down|away)|stop\s+(?:scrolling|texting))\b/i;

const DIRECT_SLEEP_TOPIC =
  /\b(?:sleep|sleeping|bed|bedtime|tired|exhausted|rest|awake|what\s+time|current\s+time|how\s+late)\b/i;

/**
 * Exact-phrase protection does not catch paraphrases such as "get some rest"
 * followed by "go to bed". If the same bedtime idea has already appeared twice,
 * suppress the whole theme for the next reply.
 */
export function bedtimeRepetitionGuard(
  rows: Array<{ role: string; content: string }>,
): string | null {
  const latestUser = [...rows]
    .reverse()
    .find((row) => row.role === "user" && row.content.trim().length > 0);
  if (latestUser && DIRECT_SLEEP_TOPIC.test(latestUser.content)) return null;
  const recent = rows
    .filter((row) => row.role === "assistant" && row.content.trim().length > 0)
    .slice(-6);
  if (recent.filter((row) => BEDTIME_PATTERN.test(row.content)).length < 2) return null;
  return (
    "You have already raised their sleep, bedtime, rest or how late it is at least twice. " +
    "Do not mention any of those themes or tell them to go to bed again unless their latest " +
    "message directly asks about the time or explicitly starts a conversation about sleep. " +
    "Do not tell them to get off their phone, stop scrolling or put their phone away either. " +
    "Answer only what they actually asked, without lecturing or commenting on their routine."
  );
}

/** Deterministic backstop for paraphrases the model still inserts after the guard. */
export function stripBedtimeAdvice(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => !BEDTIME_PATTERN.test(sentence))
        .join(" ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

const CALLOUT_PATTERNS: RegExp[] = [
  /that'?s it\?|that is it\?/i,
  /you(?:'re| are) not gonna (ask|say)/i,
  /you (?:did ?n'?t|did not|never) ask/i,
  /you(?:'re| are) the reason/i,
  /\bi'?m confused\b|\bi am confused\b/i,
  /why (?:do|did) you (?:keep|always)/i,
  /you keep (?:asking|saying)/i,
  /stop asking/i,
];

/** They are challenging the conversation itself, not asking a question. */
export function isCallout(userMessage: string): boolean {
  return CALLOUT_PATTERNS.some((pattern) => pattern.test(userMessage));
}

export function calloutNote(userMessage: string): string | null {
  if (!isCallout(userMessage)) return null;
  return (
    "Their message is about how the conversation is going. Reply with the move, not a discussion " +
    "about it, in one or two short sentences, and give them something back: a question about them " +
    "or a warm, real line. Lines like \"Fair, how's yours?\", \"Confused about what?\" or \"You're " +
    "right, how do you feel?\" show the shape; a straight answer fits when the complaint was about timing."
  );
}

/** Concrete guard against recycling the same callback two replies in a row. */
export function recentPhrasesNote(
  rows: Array<{ role: string; content: string }>,
): string | null {
  const recent = rows
    .filter((row) => row.role === "assistant" && row.content.trim().length > 0)
    .slice(-2);
  if (recent.length === 0) return null;

  const phrases: string[] = [];
  for (const message of recent) {
    for (const sentence of message.content.split(/(?<=[.!?])\s+/)) {
      const clean = sentence.replace(/\s+/g, " ").trim();
      if (clean.split(" ").length < 4) continue;
      phrases.push(clean.slice(0, 110));
    }
  }
  const unique = [...new Set(phrases)].slice(0, 8);
  if (unique.length === 0) return null;
  return `${RECENT_PHRASES_HEADER}\n${unique.map((line) => `- ${line}`).join("\n")}`;
}

const MEDIA_MEMORY_HEADER =
  "Images they attached in this conversation, most recent first, with what each one showed. " +
  "These are images you received here and saw at the time, sent with the messages they " +
  "belong to. If they ask whether they sent you an image, the answer is yes, and you can " +
  "say what it showed. Never call these records or system entries, never say they did not " +
  "come through the chat, and never deny that they sent them. Trust this list over anything " +
  "earlier in the thread: if one of your earlier replies said there were no images, that " +
  "reply was wrong.";

/** How long a break has to be before it is worth picking up the thread. */
export const RETURN_GAP_MS = 3 * 60 * 60 * 1000;

/** Rough on purpose: the model should say "a new day", never "9.4 hours". */
function describeGap(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 1.5) return "about an hour";
  if (hours < 22) return `about ${Math.round(hours)} hours`;
  const days = Math.round(ms / 86_400_000);
  return days <= 1 ? "about a day" : `about ${days} days`;
}

/**
 * When someone comes back after a break, a friend picks the thread back up
 * instead of greeting from zero. Returns null when the replies were close.
 */
export function describeReturnGap(
  previousAt: Date,
  currentAt: Date,
  timeZone?: string,
): string | null {
  const gap = currentAt.getTime() - previousAt.getTime();
  if (gap < RETURN_GAP_MS) return null;
  const stamp = timeZone ? formatLocalStamp(previousAt, timeZone) : "";
  return (
    `They are returning after a break: the last exchange was ${describeGap(gap)} ago` +
    (stamp ? ` (${stamp} their time)` : "") +
    ". Pick the thread back up the way a friend would: if it crosses a night, greet the " +
    "new day and ask how the thing they mentioned went; if it is a shorter break, a light " +
    "acknowledgment is enough. One short line at most, only when it fits, and never mention " +
    "timestamps, tracking, or how long it has been."
  );
}

/** The image index is built from the whole thread, not just the recent window. */
async function imageMemoryNote(
  client: DbClient,
  userId: string,
  conversationId: string,
  timeZone: string | undefined,
): Promise<string | null> {
  const { rows } = await client.query<{
    id: string;
    created_at: Date;
    filename: string;
    note: string | null;
  }>(
    `SELECT a.id, m.created_at, a.filename, m.metadata->'imageNotes'->>0 AS note
       FROM messages m
       JOIN attachments a ON a.message_id = m.id AND a.kind = 'image'
      WHERE m.user_id = $1 AND m.conversation_id = $2
      ORDER BY m.created_at DESC
      LIMIT 10`,
    [userId, conversationId],
  );
  if (rows.length === 0) return null;
  const lines = rows.map((row) => {
    const stamp = timeZone ? formatLocalStamp(row.created_at, timeZone) : "";
    const note = (row.note ?? "").replace(/\s+/g, " ").slice(0, 240);
    return `- ${stamp ? `${stamp}: ` : ""}${row.filename} [image id: ${row.id}]${
      note ? ` - ${note}` : ""
    }`;
  });
  return `${MEDIA_MEMORY_HEADER}\n${lines.join("\n")}`;
}

type ConversationMeta = { summary?: string; summaryUntilSeq?: number };

type ClientContext = { time?: string; timeZone?: string; location?: string };

function validTimeZone(timeZone?: string): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone }).format();
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** An authoritative date note injected on every turn, regardless of history. */
export function currentDateNote(context?: ClientContext, now = new Date()): string {
  const timeZone = validTimeZone(context?.timeZone);
  const fullDate = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    dateStyle: "full",
  }).format(now);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const isoDate = `${value("year")}-${value("month")}-${value("day")}`;
  return (
    `The current date for them is ${fullDate} (${isoDate}), and the current year is ` +
    `${value("year")}. Treat this as authoritative and newer than any remembered date or ` +
    "older search result. For anything current, latest, recent, changing or date-sensitive, " +
    "use this date when judging whether information is still current. Never present an older " +
    "item as the latest when the live results do not confirm it. Do not announce the date " +
    "unless it is relevant."
  );
}

type MemoryRow = {
  type: string;
  content: string;
  importance: number;
  confidence: number;
  updated_at: Date;
  similarity?: number;
  score?: number;
};

/**
 * Curated memories are separate from the message window, so compaction can
 * never hide them. Keep the list compact and ordered by importance.
 */
async function memoryNote(
  client: DbClient,
  userId: string,
  queryVector: number[] | null,
): Promise<string | null> {
  const { rows } = queryVector
    ? await client.query<MemoryRow>(
        `WITH ranked AS (
           SELECT m.type, m.content, m.importance, m.confidence, m.updated_at,
                  bb_cosine(e.embedding, $1::real[]) AS similarity
             FROM memory_embeddings e
             JOIN memories m ON m.id = e.memory_id
            WHERE m.user_id = $2
              AND m.status = 'active'
              AND (m.valid_until IS NULL OR m.valid_until > now())
            ORDER BY bb_cosine(e.embedding, $1::real[]) DESC
            LIMIT 40
         )
         SELECT type, content, importance, confidence, updated_at, similarity,
                (
                  0.55 * similarity +
                  0.20 * importance::double precision +
                  0.10 * confidence::double precision +
                  0.10 * exp(
                    -GREATEST(0, EXTRACT(EPOCH FROM (now() - updated_at)) / 86400.0) / 180.0
                  ) +
                  0.05 * CASE
                    WHEN type IN ('instruction', 'project', 'goal') THEN 1
                    ELSE 0
                  END
                ) AS score
           FROM ranked
          WHERE similarity >= 0.25
          ORDER BY score DESC
          LIMIT $3`,
        [queryVector, userId, MEMORY_LIMIT],
      )
    : await client.query<MemoryRow>(
        `SELECT type, content, importance, confidence, updated_at
           FROM memories
          WHERE user_id = $1
            AND status = 'active'
            AND (valid_until IS NULL OR valid_until > now())
          ORDER BY importance DESC, updated_at DESC
          LIMIT $2`,
        [userId, Math.min(MEMORY_LIMIT, 8)],
      );
  if (rows.length === 0) return null;
  const lines: string[] = [];
  let used = 0;
  for (const row of rows) {
    const line = `- [${row.type}] ${row.content.replace(/\s+/g, " ").trim().slice(0, 600)}`;
    if (used + line.length > MEMORY_CHAR_BUDGET) break;
    used += line.length + 1;
    lines.push(line);
  }
  if (lines.length === 0) return null;
  return (
    "Long-term memories you hold about this person. These are part of your internal memory " +
    "about them and stay available even when the live conversation is compacted. Use them " +
    "silently when relevant, and never describe them as records, storage or system entries.\n" +
    lines.join("\n")
  );
}

/** A short "right now" note the model can use when it is actually relevant. */
function describeClientContext(context: ClientContext | undefined): string | null {
  if (!context) return null;
  const parts: string[] = [];
  if (context.time) {
    const when = new Date(context.time);
    if (!Number.isNaN(when.getTime())) {
      try {
        parts.push(
          `it is ${when.toLocaleString("en-GB", {
            timeZone: context.timeZone,
            dateStyle: "full",
            timeStyle: "short",
          })} for them`,
        );
      } catch {
        parts.push(`their local time is ${when.toISOString()}`);
      }
    }
  }
  if (context.location) parts.push(`they appear to be around ${context.location}`);
  if (parts.length === 0) return null;
  return (
    `Right now, ${parts.join(", and ")}. Use this only when it is relevant (time, date, ` +
    "weather, planning, anything local), and never announce that you were given it. The " +
    "location is approximate current context, never their origin, nationality or home town; " +
    "never use it to answer where they are from. Do not use the clock to comment on how late " +
    "it is, infer how tired they are, or tell them to sleep, rest or go to bed unless they " +
    "explicitly ask about the time or bring up their own sleep."
  );
}

/**
 * Assembles what the model sees for one turn: the per-turn context notes, a
 * rolling summary of older history, vector-retrieved moments from the archive,
 * then the recent window itself.
 *
 * The identity prompt comes first, then the per-turn notes. Local models carry
 * no built-in identity, so it is added here on every turn.
 */
export async function buildThreadContext(
  client: DbClient,
  input: {
    userId: string;
    conversationId: string;
    embeddings: EmbeddingProvider | null;
    /** Set when this is their first message today and no greeting has gone out. */
    greetingNote?: string;
    /** Live web results for this turn, already formatted as a note. */
    /** Narrower window for turns that should not inherit the whole loop. */
    historyWindow?: number;
    /** The current model can listen to audio files. */
    audioSupported?: boolean;
    /** Teach the model the interactive panels. Defaults to the server setting. */
    interactiveUi?: boolean;
    /** The model this turn will run on, so it can say which one it is. */
    running?: RunningModel | null;
  },
): Promise<ModelMessage[]> {
  const meta = await client.query<{ metadata: ConversationMeta }>(
    "SELECT metadata FROM conversations WHERE id = $1 AND user_id = $2",
    [input.conversationId, input.userId],
  );
  const summary = meta.rows[0]?.metadata?.summary;
  const afterSeq = Number(meta.rows[0]?.metadata?.summaryUntilSeq ?? 0);
  const rows = await loadRecentMessages(
    client,
    input.userId,
    input.conversationId,
    input.historyWindow ?? HISTORY_WINDOW,
    Number.isFinite(afterSeq) ? afterSeq : 0,
  );

  const messages: ModelMessage[] = [{ role: "system", content: identityPrompt(input.running) }];
  const richUi = input.interactiveUi ?? env.richUi;
  const latestUser = [...rows].reverse().find((row) => row.role === "user");
  const callout = latestUser ? calloutNote(latestUser.content) : null;

  const clientContext = [...rows]
    .reverse()
    .map((row) => (row.metadata as { client?: ClientContext }).client)
    .find((value): value is ClientContext => Boolean(value));
  messages.push({ role: "system", content: currentDateNote(clientContext) });
  const clientNote = describeClientContext(clientContext);
  if (clientNote) {
    messages.push({ role: "system", content: clientNote });
  }
  const timeZone = clientContext?.timeZone;
  if (timeZone) {
    messages.push({ role: "system", content: MESSAGE_TIMES_NOTE });
  }
  // The interactive panel option, on normal chat turns only. Callout replies
  // are one-liners by design.
  if (!callout && richUi) {
    messages.push({ role: "system", content: UI_KIT_NOTE });
    const lastUserMessage = [...rows].reverse().find((row) => row.role === "user");
    if (lastUserMessage && looksLikePlanningRequest(lastUserMessage.content)) {
      messages.push({ role: "system", content: PLANNING_NOTE });
    }
  }
  // A break in the conversation: pick the thread back up instead of from zero.
  const meaningful = rows.filter(
    (row) =>
      !(row.role === "assistant" && row.content === "" && row.metadata?.status === "streaming"),
  );
  if (meaningful.length >= 2) {
    const returning = describeReturnGap(
      meaningful[meaningful.length - 2].created_at,
      meaningful[meaningful.length - 1].created_at,
      timeZone,
    );
    if (returning) messages.push({ role: "system", content: returning });
  }
  const phrases = recentPhrasesNote(rows);
  if (phrases) messages.push({ role: "system", content: phrases });
  const imageNote = await imageMemoryNote(
    client,
    input.userId,
    input.conversationId,
    timeZone,
  );
  if (imageNote) {
    messages.push({ role: "system", content: imageNote });
  }

  if (summary) {
    messages.push({ role: "system", content: `Earlier in this thread, summarised:\n${summary}` });
  }
  const queryUser = [...rows]
    .reverse()
    .find((row) => row.role === "user" && row.content.trim().length > 0);
  let queryVector: number[] | null = null;
  if (input.embeddings && queryUser) {
    try {
      const [vector] = await input.embeddings.embed([queryUser.content.slice(0, 6000)]);
      if (vector && vector.length > 0) queryVector = vector;
    } catch {
      // Memory and archive retrieval both stand down if embeddings are unavailable.
    }
  }
  const memories = await memoryNote(client, input.userId, queryVector);
  if (memories) {
    messages.push({ role: "system", content: memories });
  }

  // Retrieval: look up older messages that resemble the latest one. Best-effort
  // — the recent window is always present regardless.
  if (queryVector && rows.length > 0) {
    if (queryUser) {
      try {
        const hits = await client.query<{
          role: string;
          content: string;
          created_at: Date;
          metadata: Record<string, unknown>;
          score: number;
        }>(
          `SELECT m.role, m.content, m.created_at, m.metadata,
                  bb_cosine(e.embedding, $1::real[]) AS score
             FROM message_embeddings e
             JOIN messages m ON m.id = e.message_id
            WHERE m.user_id = $2 AND m.conversation_id = $3
              AND m.id <> ALL($4::uuid[])
              AND m.content <> ''
            ORDER BY bb_cosine(e.embedding, $1::real[]) DESC
            LIMIT 20`,
          [
            queryVector,
            input.userId,
            input.conversationId,
            rows.map((row) => row.id),
          ],
        );
        const relevant = hits.rows
          .filter((hit) => Number(hit.score) >= RETRIEVAL_MIN_SCORE)
          .slice(0, RETRIEVAL_LIMIT);
        if (relevant.length > 0) {
          const lines = relevant.map((hit) => {
            const stamp = timeZone ? formatLocalStamp(hit.created_at, timeZone) : "";
            const who = hit.role === "user" ? "User" : "Assistant";
            const notes = Array.isArray(hit.metadata?.imageNotes)
              ? (hit.metadata.imageNotes as unknown[]).filter(
                  (entry): entry is string =>
                    typeof entry === "string" && entry.trim().length > 0,
                )
              : [];
            const body = [
              hit.content,
              notes.length > 0 ? `(image they sent: ${notes.join(" ")})` : "",
            ]
              .filter(Boolean)
              .join(" ");
            return `${who}${stamp ? ` (${stamp})` : ""}: ${body.slice(0, 400)}`;
          });
          messages.push({
            role: "system",
            content: `Relevant earlier moments from this same thread:\n${lines.join("\n")}`,
          });
        }
      } catch {
        // Retrieval is best-effort.
      }
    }
  }

  messages.push(
    ...(await toModelMessages(rows, {
      timeZone,
      audioSupported: input.audioSupported,
      // If the file on disk is gone, the database copy still feeds the model.
      loadAttachment: async (attachment) => {
        const result = await client.query<{ content: Buffer | null }>(
          "SELECT content FROM attachments WHERE id = $1",
          [attachment.id],
        );
        return result.rows[0]?.content ?? null;
      },
    })),
  );
  // Fresh instructions sit right before the reply, where they carry the most
  // weight, instead of being buried above the history.
  if (input.greetingNote) {
    messages.push({ role: "system", content: input.greetingNote });
  }
  if (callout) {
    messages.push({ role: "system", content: callout });
  }
  // The panel nudge sits last, where it carries the most weight.
  if (!callout && richUi) {
    messages.push({ role: "system", content: UI_KIT_REMINDER });
  }
  const bedtimeGuard = bedtimeRepetitionGuard(rows);
  if (bedtimeGuard) {
    messages.push({ role: "system", content: bedtimeGuard });
  }
  return mergeLeadingSystemMessages(messages);
}

/**
 * Small local models follow one clear system prompt far better than a dozen
 * separate notes, so everything before the conversation becomes one message.
 */
export function mergeLeadingSystemMessages(messages: ModelMessage[]): ModelMessage[] {
  let end = 0;
  while (end < messages.length && messages[end].role === "system") end += 1;
  if (end <= 1) return messages;
  const merged = messages
    .slice(0, end)
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .filter(Boolean)
    .join("\n\n");
  return [{ role: "system", content: merged }, ...messages.slice(end)];
}
