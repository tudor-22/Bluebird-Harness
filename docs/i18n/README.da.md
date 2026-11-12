<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <b>Dansk</b> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>Det eneste AI-harness, du får brug for: gør enhver computer til et autonomt AI-system.</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** er et privat, lokalt-først AI-system med over 12 modelmotorer, vedvarende hukommelse, proaktiv planlægning, computerstyring, sin egen browser og en indbygget kodeassistent. Det kører på macOS, Windows og Linux, uden konto, uden login og uden Bluebird-cloud.

## Download

| Platform | Download | Sådan installerer du |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](../../apps/builds/macos/Bluebird-0.1.0-mac-arm64.dmg) | Åbn `.dmg`-filen og træk **Bluebird** til Programmer. Ved første start skal du højreklikke på appen og vælge **Åbn** (den er endnu ikke signeret). |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](../../apps/builds/windows/Bluebird-0.1.0-win-x64.zip) | Pak ud og kør `Bluebird.exe`. Hvis SmartScreen vises, så klik på **Flere oplysninger → Kør alligevel**. |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](../../apps/builds/linux/Bluebird-0.1.0-linux-x64.tar.gz) | Pak ud med `tar -xzf`, og kør derefter `./bluebird` fra den udpakkede mappe. |

> **Bemærk:** Bluebird er indtil videre kun testet på macOS. Builds til Windows og Linux er med, men er ikke fuldt testet endnu. Hvis noget går galt, så opret et issue under fanen Issues.

Ved første start opretter et opsætningsvindue en privat lokal database og tilbyder at downloade Ollama og en startmodel. Du skal ikke installere noget manuelt.

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>: specialiserede agenter, der arbejder side om side på én opgave.</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## Indbygget computerstyring til enhver app på din computer

Skriv `@` for at pege Bluebird på en hvilken som helst installeret app. Den læser appens vindue og betjener den via systemets egne tilgængelighedshandlinger på macOS, Windows og Linux, så det virker også med apps uden nogen integration.

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="Indbygget computerstyring til enhver app på din computer" width="100%">
</p>

---

## Hvad det kan

| | |
| --- | --- |
| **Enhver motor** | Over 12 motorer: Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google eller enhver tilpasset API. Skift fra én menu. |
| **Vedvarende hukommelse** | Husker dig på tværs af samtaler, søger i hele din chathistorik og lader dig se og slette hver eneste erindring. |
| **Proaktiv** | Kører planlagte opgaver (`daily 08:30`, `every 30m`, cron) og kontakter dig på Telegram, Discord og Slack. |
| **Computerstyring** | Læser og betjener skrivebordsprogrammer via deres tilgængeligheds-API'er. Skriv `@` for at pege på et program. |
| **Egen browser** | Styrer en rigtig Chromium-browser: åbn, læs, klik, skriv. `/research` laver en rapport med kilder. |
| **Kodeassistent** | Læser, redigerer og kører kode, viser live-eksempler af HTML og SVG, og hver ændring har en Fortryd-knap. |
| **Sværm og skills** | `/swarm` fordeler et job på op til fire agenter. Skills forbedrer sig selv og kan installeres fra Claude Code- og Codex-kataloger. |
| **Du bestemmer** | Spørg altid, Auto eller Fuld adgang. API'et lytter kun på loopback, og dine nøgler forlader aldrig din computer. |
| **Værktøjsservere (MCP)** | Tilslut en hvilken som helst MCP-server, og dens værktøjer dukker op i chatten. |
| **Interaktive visualiseringer** | Svarer med skydere, diagrammer, 3D-scener, figurer og live-miniapps i stedet for tekstmure. |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>Enhver motor</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>Vedvarende hukommelse</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>Proaktiv</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>Egen browser</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>Kodeassistent</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>Sværm og skills</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>Du bestemmer</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>Værktøjsservere (MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>Interaktive visualiseringer</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>Interaktive visualiseringer</b></sub></td>
</tr>
</table>

---

## Understøttede motorer

Lokale motorer registreres automatisk. Hostede motorer kræver en nøgle, som du selv tilføjer.

| Lokale | Hostede | Tilpasset |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## Sådan virker det

Alt kører på din computer. Samtaler, hukommelse og vedhæftede filer ligger i en privat lokal PostgreSQL-database. Hostede motorer bruges kun, hvis du selv tilføjer en nøgle.

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## Kør fra kildekoden

Kræver Node 22+, pnpm, PostgreSQL 17 og [Ollama](https://ollama.com). Eller kør `bash scripts/install.sh`. Åbn derefter <http://localhost:3000>.

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [Fuld dokumentation](../../docs/DOCUMENTATION.md)

---

## Støt projektet

Hvis Bluebird er nyttig for dig, kan du [give mig en kop kaffe](https://buymeacoffee.com/tudoriustin_) eller følge med på [X](https://x.com/tudoriustin_) og [Hugging Face](https://huggingface.co/tudor-iustin22).

## License

Udgivet under Apache License 2.0. Lavet af Tudor Iustin. See [LICENSE](../../LICENSE).
