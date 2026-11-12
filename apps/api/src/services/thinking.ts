/**
 * Decides whether a chat turn gets the model's thinking mode. The model
 * cannot genuinely skip its thinking phase (an instruction to close the think
 * block early is ignored), so the platform routes clearly casual turns to
 * non-thinking sampling and keeps thinking for everything substantive. The
 * rules are conservative on purpose: if it is not plainly social, it thinks.
 */

/** Whole messages that are pure social glue. */
const BARE_CASUAL = new Set([
  "hi", "hey", "heyy", "hello", "hiya", "howdy", "yo", "gm", "gn",
  "morning", "good morning", "afternoon", "good afternoon",
  "evening", "good evening", "good night", "night",
  "ok", "okay", "k", "kk", "cool", "nice", "great", "perfect", "awesome",
  "sweet", "thanks", "thank you", "ty", "thx", "cheers",
  "got it", "gotcha", "sounds good", "no worries", "np", "sure",
  "yep", "yeah", "yes", "nope", "nah", "no",
  "lol", "lmao", "haha", "hehe", "hmm", "hm",
  "true", "fair", "right", "exactly", "agreed", "indeed", "fair enough",
]);

/** Words that short social messages are built from. */
const CASUAL_WORDS = new Set([
  "hi", "hey", "heyy", "hello", "hiya", "howdy", "yo", "gm", "gn", "morning",
  "afternoon", "evening", "night", "good", "there", "bluebird",
  "ok", "okay", "k", "kk", "cool", "nice", "great", "perfect", "awesome",
  "sweet", "best", "thanks", "thank", "you", "ty", "thx", "cheers", "so",
  "much", "a", "lot", "man", "mate", "dude", "bro", "yay", "love", "it",
  "got", "gotcha", "sounds", "no", "worries", "np", "sure", "yep", "yeah",
  "yes", "nope", "nah", "lol", "lmao", "haha", "hehe", "hmm", "hm", "true",
  "fair", "right", "exactly", "agreed", "indeed", "enough", "and", "too",
  "one", "that", "is", "are",
]);

const EMOJI_ONLY =
  /^[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\uFE0F\u200D\s]+$/u;
const LAUGH = /^(ha|he){2,}$/;

export function needsThinking(content: string, hasAttachments: boolean): boolean {
  if (hasAttachments) return true;
  const text = content.trim().toLowerCase();
  if (!text || text.length > 140) return true;
  if (EMOJI_ONLY.test(text)) return false;
  const bare = text
    .replace(/[.!?,…~:;()"'’]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!bare) return false;
  if (BARE_CASUAL.has(bare)) return false;
  if (LAUGH.test(bare.replace(/\s+/g, ""))) return false;
  const words = bare.split(" ");
  if (words.length <= 4 && words.every((word) => CASUAL_WORDS.has(word))) {
    return false;
  }
  return true;
}
