# Import from Hermes Agent and OpenClaw

Bring what another agent already knows about you into Bluebird with one command: memories become
Bluebird memories, skills become Bluebird skills, and, if you ask, past conversations join your
thread. The other agent's files are only read. Nothing in them is changed, moved or deleted.

```bash
pnpm import:agents --dry-run      # see what would come over
pnpm import:agents                # import memories and skills
pnpm import:agents --history      # also past conversations and daily notes
```

Run it from a checkout of the repository with the same `.env` the API uses (`DATABASE_URL`, and
`BLUEBIRD_SETTINGS_FILE` if you changed it), so it writes to the same database and skills folder.
Running it again is safe: anything already imported is recognised and left alone.

## What comes over

| From | Where it is read | Becomes |
| --- | --- | --- |
| Hermes Agent | `memories/USER.md` and `memories/MEMORY.md`, one memory per `§`-separated entry | Memories. Entries that read as directives ("Prefers...", "Never...") are preferences; the rest are facts. |
| Hermes Agent | `skills/**/SKILL.md`, with the skill's scripts and references | Skills. Skills Hermes ships with (listed in `skills/.bundled_manifest`) are skipped unless you pass `--include-bundled`. |
| Hermes Agent | `state.db`, with `--history` | Messages in your thread, with their original times. Only what you and the agent said in sessions you have not hidden; tool output, system prompts, rewound turns and compaction summaries are left out. |
| OpenClaw | `USER.md` (the directives under `## Directives`, or the whole file), and `users/*/USER.md` | Memories, as preferences or facts. |
| OpenClaw | `MEMORY.md`, one memory per list item or paragraph | Memories (facts). |
| OpenClaw | `memory/YYYY-MM-DD*.md` daily notes, with `--history` | Memories (events), dated by the note. |
| OpenClaw | `skills/`, `.agents/skills/` in the workspace, and the managed `skills/` in the state folder | Skills. When two have the same name, the one OpenClaw itself would use wins. |

OpenClaw's session transcripts live in a per-agent SQLite file whose layout OpenClaw does not
document as stable, so they are not imported; its daily notes carry the history instead. Config,
credentials, API keys and channel settings are never imported from either agent.

Each memory keeps where it came from (`metadata.source = "import"`, the agent and the file), so
you can find and remove imported memories later. Skills keep their source in the skills stats and
show as installed.

## Where it looks

**Hermes Agent:** `HERMES_HOME` if set, otherwise `~/.hermes` (`%LOCALAPPDATA%\hermes` on
Windows), following `active_profile` to `profiles/<name>` the way Hermes does. Pass
`--hermes-home <folder>` to choose another.

**OpenClaw:** the workspace named in `~/.openclaw/openclaw.json` (`agents.entries.main.workspace`
or `agents.defaults.workspace`), otherwise `~/.openclaw/workspace`. `OPENCLAW_STATE_DIR`,
`OPENCLAW_PROFILE` and `OPENCLAW_CONFIG_PATH` are followed. Pass `--openclaw-workspace <folder>`
to choose another.

## Options

| Option | Meaning |
| --- | --- |
| `--from hermes,openclaw` | Which agents to import from. Default: both. |
| `--dry-run` | List what would be imported, and what is already in Bluebird. Nothing is written. |
| `--history` | Also import Hermes conversations and OpenClaw daily notes. |
| `--include-bundled` | Also import the skills Hermes ships with. |
| `--overwrite-skills` | Replace a Bluebird skill of the same name. Its previous `SKILL.md` is kept in the skill's `history` folder. Without it, existing skills are left alone. |
| `--json` | Print the full report as JSON. |

## From the app

The API offers the same import at `POST /import` (and the web app at `POST /api/import`), for a
settings screen: send `{ "dryRun": true }` to show what is there, then `{ "dryRun": false }` to
import it. The body also takes `sources`, `history`, `includeBundled` and `overwriteSkills`, and
the answer is the same report the command prints with `--json`. The web client has
`importFromAgents` in `components/chat/automation-client.ts` for it.

## Notes

- Memories are embedded for search when the embedding model (`bge-m3`) is available. Without it
  they are still saved, and keyword search finds them.
- Imported conversations are placed in your one thread by their original time, so they show up in
  history and in search. They count toward the thread like any other messages.
- Memory entries longer than 800 characters are shortened, and messages longer than 20,000
  characters are cut, with a note in the report.
