import type { AgentLevel } from "@bluebird/shared";

/** The ways the model may use files and commands, in the words shown to the person. */
export const ACCESS_LEVELS: { value: AgentLevel; label: string; short: string; text: string }[] = [
  {
    value: "ask",
    label: "Always ask",
    short: "Always ask",
    text: "The model can look at anything on this computer, but every change and every command waits for your approval.",
  },
  {
    value: "auto",
    label: "Auto",
    short: "Auto",
    text: "The model decides. Everyday edits and commands go ahead; anything risky, like deleting files, sudo or system settings, still asks.",
  },
  {
    value: "full",
    label: "Full access",
    short: "Full access",
    text: "No limits and no prompts: any file, any command, anywhere on this computer.",
  },
];

export const FULL_ACCESS_WARNING =
  "Full access gives the model access to the entire operating system. It can read, change and delete any file you can, run any command, install software and use the network, without asking you first. A few destructive commands are still never run. Only turn this on if you trust the model you have chosen.";
