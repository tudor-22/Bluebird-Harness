<p align="center">
English | <a href="docs/i18n/README.zh-CN.md">简体中文</a> | <a href="docs/i18n/README.zh-TW.md">繁體中文</a> | <a href="docs/i18n/README.ko.md">한국어</a> | <a href="docs/i18n/README.de.md">Deutsch</a> | <a href="docs/i18n/README.es.md">Español</a> | <a href="docs/i18n/README.fr.md">Français</a> | <a href="docs/i18n/README.it.md">Italiano</a> | <a href="docs/i18n/README.da.md">Dansk</a> | <a href="docs/i18n/README.ja.md">日本語</a> | <a href="docs/i18n/README.pl.md">Polski</a> | <a href="docs/i18n/README.ru.md">Русский</a> | <a href="docs/i18n/README.bs.md">Bosanski</a> | <a href="docs/i18n/README.ar.md">العربية</a> | <a href="docs/i18n/README.no.md">Norsk</a> | <a href="docs/i18n/README.pt-BR.md">Português (Brasil)</a> | <a href="docs/i18n/README.th.md">ไทย</a> | <a href="docs/i18n/README.tr.md">Türkçe</a> | <a href="docs/i18n/README.uk.md">Українська</a> | <a href="docs/i18n/README.bn.md">বাংলা</a> | <a href="docs/i18n/README.el.md">Ελληνικά</a> | <a href="docs/i18n/README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>The only AI harness you'll ever need: turn any computer into an autonomous AI system.</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** is a private, local-first AI system with 12+ model engines, persistent memory, proactive scheduling, computer use, its own browser and a built-in code assistant. It runs on macOS, Windows and Linux, with no account, no sign-in and no Bluebird cloud.

## Download

| Platform | Download | How to install |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-mac-arm64.dmg) | Open the `.dmg` and drag **Bluebird** to Applications. On first launch, right-click the app and choose **Open** (it is not signed yet). |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-win-x64.zip) | Unzip, then run `Bluebird.exe`. If SmartScreen appears, click **More info → Run anyway**. |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-linux-x64.tar.gz) | Extract with `tar -xzf`, then run `./bluebird` from the extracted folder. |

> **Heads up:** Bluebird has been tested on macOS so far. The Windows and Linux builds are provided but are not fully tested yet. If something breaks, please open an issue in the Issues tab.

On first launch, a setup window creates a private local database and offers to download Ollama and a starter model. Nothing needs to be installed by hand.

<p align="center">
  <img src="assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>: specialised agents working side by side on one job.</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## Native computer use for any app on your computer

Type `@` to point Bluebird at any installed app. It reads the app's window and operates it through the system's own accessibility actions on macOS, Windows and Linux, so it works with apps that have no integration at all.

<p align="center">
  <img src="assets/gifs/native-computer-use.gif" alt="Native computer use for any app on your computer" width="100%">
</p>

---

## What it does

| | |
| --- | --- |
| **Any engine** | 12+ engines: Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google, or any custom API. Switch from one menu. |
| **Persistent memory** | Remembers you across conversations, searches your whole chat history, and lets you see and delete every memory. |
| **Proactive** | Runs scheduled tasks (`daily 08:30`, `every 30m`, cron) and reaches you on Telegram, Discord and Slack. |
| **Computer use** | Reads and operates desktop apps through their accessibility APIs. Type `@` to point it at an app. |
| **Its own browser** | Drives a real Chromium browser: open, read, click, type. `/research` produces a sourced report. |
| **Code assistant** | Reads, edits and runs code, previews HTML and SVG live, and every change has an Undo button. |
| **Swarm and skills** | `/swarm` splits a job across up to four agents. Skills improve themselves and install from Claude Code and Codex catalogs. |
| **You stay in control** | Always ask, Auto or Full access. The API listens on loopback only and your keys never leave your computer. |
| **Tool servers (MCP)** | Plug in any MCP server and its tools appear in the chat. |
| **Interactive visuals** | Answers with sliders, charts, 3D scenes, diagrams and live mini-apps instead of walls of text. |

<table>
<tr>
<td width="50%" align="center"><img src="assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>Any engine</b></sub></td>
<td width="50%" align="center"><img src="assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>Persistent memory</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>Proactive</b></sub></td>
<td width="50%" align="center"><img src="assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>Its own browser</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>Code assistant</b></sub></td>
<td width="50%" align="center"><img src="assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>Swarm and skills</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>You stay in control</b></sub></td>
<td width="50%" align="center"><img src="assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>Tool servers (MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>Interactive visuals</b></sub></td>
<td width="50%" align="center"><img src="assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>Interactive visuals</b></sub></td>
</tr>
</table>

---

## Supported engines

Local engines are detected automatically. Hosted engines need a key that you add yourself.

| Local | Hosted | Custom |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## How it works

Everything runs on your computer. Conversations, memory and attachments live in a private local PostgreSQL database. Hosted engines are used only if you add your own key.

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## Run from source

Needs Node 22+, pnpm, PostgreSQL 17 and [Ollama](https://ollama.com). Or run `bash scripts/install.sh`. Then open <http://localhost:3000>.

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [Full documentation](docs/DOCUMENTATION.md)

---

## Support the project

If Bluebird is useful to you, you can [buy me a coffee](https://buymeacoffee.com/tudoriustin_) or follow along on [X](https://x.com/tudoriustin_) and [Hugging Face](https://huggingface.co/tudor-iustin22).

## License

Licensed under the Apache License 2.0. Built by Tudor Iustin. See [LICENSE](LICENSE).
