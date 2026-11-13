# Bluebird

A private AI assistant that runs entirely on your own computer. It talks to
models served by [Ollama](https://ollama.com), detects the ones you have
installed, and keeps your conversation, memory and attachments in a local
database. There is no account, no sign-in and no cloud service.

Developed by Tudor Iustin.

## Quick start

The short way, on macOS or Linux, from this folder (it installs what is missing, sets up the private
database, builds the app and adds a `bluebird` command):

```bash
bash scripts/install.sh
bluebird start        # also: bluebird stop, status, open
```

On Windows: `powershell -ExecutionPolicy Bypass -File scripts\install.ps1`, then
`scripts\bluebird.ps1 start`.
The steps below do the same by hand.

1. Install Ollama and pull a chat model, plus an embedding model for memory:

   ```bash
   ollama pull llama3.2
   ollama pull bge-m3
   ```

2. Install and prepare Bluebird (Node 22+, pnpm, and a local
   PostgreSQL 17: `brew install postgresql@17`):

   ```bash
   pnpm install
   pnpm setup:keys      # one-time local keys and config
   pnpm db:up           # local Postgres in .data/pg (set LC_ALL=en_US.UTF-8 if it will not start)
   pnpm db:migrate
   ```

3. Start the API and the web app (two terminals):

   ```bash
   pnpm dev:api
   pnpm dev:web
   ```

4. Open <http://localhost:3000>. Models are detected automatically; pick one
   from the menu in the message box. Your choice is remembered in
   `apps/api/.data/settings.json`.

## Desktop app (macOS, Windows, Linux)

Download the installer for your system from the project's Releases page:
`Bluebird-<version>-mac-arm64.dmg` (macOS, Apple Silicon), `Bluebird-<version>-win-x64.exe` (Windows),
`Bluebird-<version>-linux-x86_64.AppImage` or `.deb` (Linux). Nothing else needs installing.

On first launch a setup window does everything, once:

1. creates a private PostgreSQL database in the app's data folder, with keys and passwords made for this install,
2. starts Bluebird,
3. offers to download the AI runtime (Ollama, kept privately inside Bluebird's folder, no administrator rights) and
   a starter chat model plus the memory model. An Ollama you already have is used as it is.

Quitting the app stops everything. The app is not yet signed with a paid developer certificate, so the first launch
needs right-click, Open on macOS, and "More info, Run anyway" on Windows.

Build it yourself on the system you want the installer for:

```bash
pnpm install
pnpm --filter @bluebird/desktop dist      # installer in apps/desktop/release
pnpm --filter @bluebird/desktop smoke     # starts the built app on an empty data folder and checks it comes up
```

Pushing a `v*` tag builds the four installers on GitHub Actions and attaches them to a release
(`.github/workflows/release.yml`). `pnpm --filter @bluebird/desktop icons` redraws the icon from `plain.png`.

## How it works

```text
Browser -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                  |-> PostgreSQL (local)
                                                  |-> Ollama (127.0.0.1:11434)
```

- The API listens on loopback only and checks a short-lived signed token from
  the web app, so other programs on the machine cannot use it.
- The assistant's identity comes from one prompt in
  `apps/api/src/services/identity.ts`. The model uses its own native name. Only
  when asked what it is running in does it say: Bluebird Harness, part of
  Project Bluebird, developed by Tudor Iustin, an Artificial Intelligence
  Engineer in London.
- Everything stays local unless you choose otherwise: hosted engines need a key
  you add yourself, and place lookup for maps is off unless you set `BLUEBIRD_ALLOW_ONLINE=1`.

## Context window

The circle beside the message box shows how full the conversation is. Hover it for the percentage and how
much is used out of the model's window, in thousands of tokens (for example 13K / 128K). Bluebird finds the
window by itself: from Ollama's model details (capped at the window Bluebird asks Ollama for), from the
size a hosted or self-run service lists with its models, or from a table of well-known models, and the
count comes from the engine's own report after each reply.

## Computer access

The control beside the message box (or Settings, Workspace) sets how much the model may do with files
and commands on this computer. The tools reach the whole system, like a person at a terminal, with no
project folder to choose. Relative paths and commands start in your home folder, or in an optional
starting folder you set.

- **Always ask:** the model can look at anything, but every change and every new command
  waits for your approval, with a diff or the full command shown first.
- **Auto** (the default): the model decides. Everyday edits and commands go ahead; risky ones still ask: deleting
  files, `sudo`, changing permissions or system settings, `git push`, piping downloads into a shell,
  uploads, and edits outside your home folder or to hidden account settings.
- **Full access:** no limits and no prompts. Choosing it shows a warning that it gives the model access
  to the entire operating system.

Tools are `read_file`, `list_dir`, `find_files`, `grep`, `view_image`, `fetch_image`, `write_file`, `edit_file` (exact-text
replacement) and `run_command` (any shell command, with a timeout and capped output; Bluebird's own keys
are kept out of its environment). Reads are free. A few destructive commands such as `rm -rf /` are
never run, at any level. Credential files (`.env`, SSH keys) and `.git` internals are off limits to the
file tools unless you choose Full access. An existing file must be read before it is replaced, and a
file that changed since it was read is refused. Pictures: `view_image` and `fetch_image` let the model look at a picture on the computer or on the web
(a model that cannot see borrows any connected vision model, or says how to connect one); `fetch_image`
only fetches public pictures, and saving one to disk asks like any file change. Pictures in a reply
show as a fanned gallery (the front one sharp, the others tilted and blurred behind) that opens full
screen with arrows, a counter and a Download button. Every reply that changed files has an Undo changes
button. Needs a model that supports function calling; one that does not answers as an ordinary chat.
Thinking is skipped on these turns.

## Automation

Everything below follows the access level above, and lives in Settings.

- **Background processes:** `run_command` with `background` starts a server, watcher or build and returns
  at once; `process_list`, `process_output` (it can wait for new output) and `process_stop` manage them.
  They end when Bluebird stops.
- **Helper agents:** `delegate_task` hands a self-contained job to a helper that works alone and
  reports back. A helper can only look unless it is allowed to change things, cannot start helpers of
  its own, and its steps and approvals show in the reply.
- **Skills:** short how-tos kept as `SKILL.md` folders beside your settings. The model sees their names
  and descriptions, loads one when a task matches (`skill_view`), and saves or improves them
  (`skill_save`, `skill_delete`) following your access level. Manage them under Settings, Skills.
  **Skills improve themselves:** after a task that took several steps, or that leaned on a skill, a short
  background review asks the model whether a skill should be written or fixed from what actually happened
  (the steps, the errors, the final answer). New and revised skills are marked "learned" in the `/` menu, a
  revised skill keeps its older versions in its `history` folder, and nothing that looks like a password or
  key is ever written into one. A skill you wrote is only revised when it was used in that task.
- **Memory the assistant tends itself:** `memory_save`, `memory_search` and `memory_forget` let it note
  something durable about you on purpose, check what it knows, and drop what is wrong; `recall_chat`
  searches the whole past conversation, including what has scrolled out of view. The automatic
  after-reply memory still runs alongside. See and delete memories under Settings, Memory.
- **`/swarm`:** start a message with `/swarm` and Bluebird splits the job between up to four specialised agents
  (researcher, implementer, reviewer and so on) that run side by side and report back together. They share a
  board for notes, only one of them may use the browser, each one's steps show in the reply, and their changes
  follow your access level. The lead agent checks the reports against each other and gives one answer.
- **`/research`:** start a message with `/research` for deep web research. Bluebird works only with the browser
  tools, in the background, with at most 30 tool calls (plan updates are free), reading and following links
  without asking. It ends with a sourced report: the answer, findings, what is uncertain, and links.
- **Skills marketplace:** Settings, Skills, Marketplace lists the skills in `~/.claude/skills`, the Claude Code
  plugins, `~/.codex/skills` and `~/.agents/skills`, plus the public `anthropics/skills` and `openai/skills`
  catalogs. Claude Code and Codex skills use the same `SKILL.md` format, so they install as they are, scripts and
  reference files included, and can be installed from any GitHub repository (`owner/repo`,
  `owner/repo/path/to/skill`, or a github.com address). Only GitHub is contacted, and only when you ask.
- **Cron:** Settings, Schedules, or `/cron`, takes a real cron line (`0 9 * * 1-5`) as well as phrases.
- **Tool servers (MCP):** add stdio programs or http addresses under Settings, Connections. Their tools
  appear as `mcp__server__tool`, each call asks first except at Full access, and read-only tools or
  servers you mark trusted go ahead in Auto.
- **Scheduled tasks:** `every 30m`, `daily 08:30`, `weekdays 09:00`, `weekly mon 07:00` or a cron line.
  Tasks run while Bluebird is running, in the same thread and with the same tools, and the model can
  schedule one itself (always with your yes). With nobody there to ask, anything needing approval is
  declined at Always ask.
- **Chat apps:** Telegram (long polling), Discord (its live gateway) and Slack (Socket Mode), none needing
  a public address. Only the ids you list can talk to a bot, and on Discord and Slack only direct messages
  are answered. A request that needs approval arrives with buttons on Telegram, or as a question you answer
  with yes, always or no on Discord and Slack. Scheduled results are sent to every connected app too. Tokens
  stay on this computer. Set them up under Settings, Connections.
- **Where commands run:** this computer, a Docker container (the starting folder is mounted), another
  machine over SSH, or a custom wrapper such as `daytona exec box -- sh -c {command}` for cloud
  sandboxes. File tools always edit files on this computer.
- **Browser:** with Chrome, Chromium, Brave or Edge installed (or `BLUEBIRD_BROWSER_CDP` pointing at one that
  is already running), the `browser_*` tools drive a real browser. `browser_open` returns an outline of the
  page: headings, text and a numbered mark for every link, button and field. The model acts on a mark with
  `browser_click` (real mouse input, after scrolling it into view; it refuses and says why if a banner covers
  it), `browser_type`, `browser_press`, `browser_select`, `browser_hover`, `browser_scroll`, `browser_upload`,
  `browser_wait`, `browser_history` and `browser_tabs`, and reads `browser_logs`, `browser_screenshot` and
  `browser_eval` when the outline is not enough. Set `BLUEBIRD_BROWSER_PROFILE` to keep logins between runs and
  `BLUEBIRD_BROWSER_HEADED=1` to watch. Reading a public page is free in Auto; clicking, typing and script ask.
- **Pointing at an app with `@`:** typing `@` in the message box lists the apps installed on this computer, with
  their icons, above your files (`@Safari`, `@"Visual Studio Code"`). Bluebird then opens that app if needed
  and works in it with the `desktop_*` tools. Apps are found from the bundles in Applications on macOS, the
  Start menu on Windows, and the desktop entries on Linux.
- **Desktop (macOS, Windows, Linux):** the `desktop_*` tools read an app's window the same way, as an outline
  with numbered marks, and act on a mark through the app's own accessibility actions, so the mouse is used only
  when an app offers no other way. Each system has a small helper that Bluebird starts on first use, all
  speaking the same line protocol (`apps/api/src/agent/desktop/`): on **macOS** a Swift program built from
  `native/macos-ax.swift` (needs the Xcode command line tools; allow Accessibility, and Screen Recording for
  screenshots, for the app that runs Bluebird); on **Windows** a PowerShell script over UI Automation
  (`native/windows-uia.ps1`, nothing to install; run Bluebird as the same user as the apps it controls); on
  **Linux** a Python script over AT-SPI (`native/linux-atspi.py`, needs `python3-gi` and `gir1.2-atspi-2.0`,
  accessibility turned on, and `grim`, `gnome-screenshot`, `scrot` or ImageMagick for screenshots and
  `wl-clipboard` or `xclip` for the clipboard; on Wayland the apps' own actions work but synthetic mouse and
  keyboard input may be refused). Tools: `desktop_apps`, `desktop_look`, `desktop_windows`, `desktop_click`,
  `desktop_type`, `desktop_set_value`, `desktop_key`, `desktop_scroll`, `desktop_read`, `desktop_open`,
  `desktop_screenshot` and `desktop_clipboard`. Every desktop tool asks first, except at Full access.
- **Cross-site protection:** the app refuses requests to its API from other websites and from names
  other than localhost (set `BLUEBIRD_ALLOWED_HOSTS` to allow a machine name on your network).

## Engines

Open Settings, then Engine. Bluebird works with any of these, and the default
model you pick is remembered:

- **Local, found automatically:** Ollama, llama.cpp, vLLM, Strata Engine and
  LM Studio, each probed at its usual address (editable).
- **Hosted, once you add a key:** OpenAI API, Anthropic API, DeepSeek, Qwen,
  Mistral and Google. Messages sent through these leave your computer.
- **Custom API:** any chat-completions address of your own, with an optional key.

Each engine lists only the models it reports right now, so a model that is not
available is never shown. Keys are stored in `apps/api/.data/settings.json`
(readable by your account only) and are never sent back to the browser.

Thinking can be set to None, Low, Medium or High, and each model is sent only
what its engine documents: `reasoning_effort` for the OpenAI API, Google and
Mistral, `thinking` plus `reasoning_effort` for DeepSeek, `enable_thinking` and a
budget for Qwen, adaptive thinking with an effort level for current Claude models
(a token budget on the 4.5 generation and earlier), `think` for Ollama, and the
chat template switches for llama.cpp and vLLM. Models that cannot think show no
thinking choice, and a model that cannot be switched off uses its lowest level
for None.
When a model thinks, the line above its reply shows how long it took, with a
small arrow that opens the thinking and any steps it took. It is closed by
default; Settings, Appearance, Show thinking opens it on every reply.

Interactive visuals (Settings, Appearance; on by default) let the model answer with
panels: sliders, calculators, charts with hover detail, tables, checklists,
maps, forms, quizzes, interactive diagrams with an expansion slider and group
chips, 3D scenes built from simple shapes (drag to turn, scroll to zoom, pull
apart with the Expansion slider, tap a part), Gantt charts, export buttons that save a table or text as a file, and
small sandboxed tools.

Code blocks are soft rounded cards with a label and a copy button, and a
Maximize button that opens them full screen. HTML and SVG code also gets Wrap
lines and a Preview that shows the page in place, inside a sandboxed frame with
no network access. Code in other languages is only shown, never run. When you
ask for a website, page, game or tool, the model builds it as a live page right
in the reply, with a caption above and no code in the way.

Scrolling with the wheel anywhere outside the conversation, such as the blank
sides of the page, scrolls the conversation. Anything under the pointer that
scrolls itself, like a long code block, keeps its own scrolling.

Audio files (WAV, MP3, M4A, AAC, OGG, FLAC, WebM, AIFF) can be attached when
the default model can listen to audio. Otherwise Bluebird warns you and does
not attach the file.

## Configuration

Set these in `apps/api/.env` (see `apps/api/.env.example`):

| Variable | Purpose |
| --- | --- |
| `OLLAMA_URL` | Default address for Ollama (default `http://127.0.0.1:11434`) |
| `BLUEBIRD_CONTEXT_TOKENS` | Context window requested from Ollama (default 16384) |
| `BLUEBIRD_RICH_UI` | Interactive panels are taught to every model by default; set to 0 to turn them off by default (people can also switch them in Settings, Appearance) |
| `EMBEDDINGS_MODEL` | Local embedding model for memory and retrieval, served by Ollama (default `bge-m3`, 1024 dimensions) |
| `MODEL_PROVIDER` | `ollama` (default, uses the engines above) or `stub` for an offline placeholder |

If memory or retrieval is not working, check that `ollama pull bge-m3` has
been run. Chat works without it.

## Import from Hermes Agent and OpenClaw

`pnpm import:agents` brings memories and skills (and, with `--history`, past conversations and
daily notes) over from Hermes Agent and OpenClaw. `--dry-run` shows what would come over without
writing anything, and the other agent's files are only ever read. See
[Import from Hermes Agent and OpenClaw](importing.md).

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm db:up && pnpm test
```

## Notes

- Images need a vision model (for example `llava` or `llama3.2-vision`), and
  audio files need a model that can listen to audio.
- A Custom API asks you for its address in Settings, Engine.
