export type GreetingKind = "welcome" | "new-day";

/**
 * Automatic greetings are switched off: Bluebird waits for the person
 * to speak first. The hook stays so a greeting can be reintroduced deliberately.
 */
export function decideGreeting(_input: {
  localDate: string;
  hasMessages: boolean;
  lastGreetingDay?: string | null;
}): GreetingKind | null {
  return null;
}

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night" | "unknown";

/** Which greeting fits the clock the person is actually reading at. */
export function timeOfDay(localTime: string): TimeOfDay {
  const match = localTime.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return "unknown";
  let hour = Number(match[1]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && hour > 23) return "unknown";
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}

export function greetingInstruction(kind: GreetingKind, localTime: string): string {
  const slot = timeOfDay(localTime);
  const slotRule =
    slot === "unknown"
      ? "Match the greeting to their local time of day."
      : `It is ${slot} for them, so the greeting must fit the ${slot}: a morning greeting in the morning, ` +
        "an afternoon greeting in the afternoon, an evening greeting in the evening, and something " +
        "quieter and low-key for the small hours. Never use a greeting that contradicts their clock.";
  const base = [
    "Write the opening message for today. Warm and natural, the way a friend opens a chat, in complete sentences rather than clipped notes.",
    `It is ${localTime} for them.`,
    slotRule,
    "Vary the wording between days: never open two days in a row with the same phrase, and do not default to the identical greeting every time.",
    "Ask exactly one question, never two, and never a compound question joined with or.",
    "Avoid canned openers, stacked exclamations and anything that sounds scripted.",
    "Never mention that you are automatic, scheduled or prompted to greet.",
    "No headings, no lists.",
  ].join(" ");
  if (kind === "welcome") {
    return (
      `${base} This is your very first message to them. Greet them briefly and ask what ` +
      "they would like to work on. Two sentences at most."
    );
  }
  return (
    `${base} It is a new day since you last spoke. Greet them and, if something from earlier ` +
    "in this thread is worth following up on, ask one light, specific question about it, never more."
  );
}
