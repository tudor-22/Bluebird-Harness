<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <b>Norsk</b> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>Det eneste AI-harnesset du noen gang trenger: gjør enhver datamaskin til et autonomt AI-system.</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** er et privat, lokalt-først AI-system med over 12 modellmotorer, vedvarende minne, proaktiv planlegging, datamaskinstyring, egen nettleser og en innebygd kodeassistent. Det kjører på macOS, Windows og Linux, uten konto, uten pålogging og uten Bluebird-sky.

## Last ned

| Plattform | Nedlasting | Slik installerer du |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-mac-arm64.dmg) | Åpne `.dmg`-filen og dra **Bluebird** til Programmer. Ved første oppstart høyreklikker du på appen og velger **Åpne** (den er ikke signert ennå). |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-win-x64.zip) | Pakk ut og kjør `Bluebird.exe`. Hvis SmartScreen vises, klikker du **Mer info → Kjør likevel**. |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-linux-x64.tar.gz) | Pakk ut med `tar -xzf`, og kjør deretter `./bluebird` fra den utpakkede mappen. |

> **Merk:** Bluebird er foreløpig bare testet på macOS. Byggene for Windows og Linux følger med, men er ikke fullt testet ennå. Hvis noe ikke fungerer, opprett en sak under fanen Issues.

Ved første oppstart oppretter et oppsettvindu en privat lokal database og tilbyr å laste ned Ollama og en startmodell. Du trenger ikke installere noe manuelt.

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>: spesialiserte agenter som jobber side om side med én oppgave.</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## Innebygd datamaskinstyring for alle apper på maskinen din

Skriv `@` for å peke Bluebird mot en hvilken som helst installert app. Den leser appens vindu og betjener den via systemets egne tilgjengelighetshandlinger på macOS, Windows og Linux, så det fungerer også med apper uten noen integrasjon.

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="Innebygd datamaskinstyring for alle apper på maskinen din" width="100%">
</p>

---

## Hva det kan

| | |
| --- | --- |
| **Alle motorer** | Over 12 motorer: Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google eller et eget API. Bytt fra én meny. |
| **Vedvarende minne** | Husker deg på tvers av samtaler, søker i hele chathistorikken og lar deg se og slette hvert minne. |
| **Proaktiv** | Kjører planlagte oppgaver (`daily 08:30`, `every 30m`, cron) og kontakter deg på Telegram, Discord og Slack. |
| **Datamaskinstyring** | Leser og betjener skrivebordsapper via tilgjengelighets-API-ene deres. Skriv `@` for å peke på en app. |
| **Egen nettleser** | Styrer en ekte Chromium-nettleser: åpne, les, klikk, skriv. `/research` lager en rapport med kilder. |
| **Kodeassistent** | Leser, redigerer og kjører kode, viser live forhåndsvisning av HTML og SVG, og hver endring har en Angre-knapp. |
| **Sverm og skills** | `/swarm` fordeler en jobb på opptil fire agenter. Skills forbedrer seg selv og kan installeres fra Claude Code- og Codex-kataloger. |
| **Du har kontrollen** | Spør alltid, Auto eller Full tilgang. API-et lytter bare på loopback, og nøklene dine forlater aldri datamaskinen. |
| **Verktøyservere (MCP)** | Koble til en hvilken som helst MCP-server, så dukker verktøyene opp i chatten. |
| **Interaktive visualiseringer** | Svarer med glidere, diagrammer, 3D-scener, figurer og live miniapper i stedet for tekstmurer. |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>Alle motorer</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>Vedvarende minne</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>Proaktiv</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>Egen nettleser</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>Kodeassistent</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>Sverm og skills</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>Du har kontrollen</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>Verktøyservere (MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>Interaktive visualiseringer</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>Interaktive visualiseringer</b></sub></td>
</tr>
</table>

---

## Støttede motorer

Lokale motorer oppdages automatisk. Vertsbaserte motorer krever en nøkkel som du selv legger til.

| Lokale | Vertsbaserte | Egendefinert |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## Slik fungerer det

Alt kjører på datamaskinen din. Samtaler, minne og vedlegg ligger i en privat lokal PostgreSQL-database. Vertsbaserte motorer brukes bare hvis du legger til en egen nøkkel.

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## Kjør fra kildekode

Krever Node 22+, pnpm, PostgreSQL 17 og [Ollama](https://ollama.com). Eller kjør `bash scripts/install.sh`. Åpne deretter <http://localhost:3000>.

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [Full dokumentasjon](../../docs/DOCUMENTATION.md)

---

## Støtt prosjektet

Hvis Bluebird er nyttig for deg, kan du [spandere en kaffe](https://buymeacoffee.com/tudoriustin_) eller følge meg på [X](https://x.com/tudoriustin_) og [Hugging Face](https://huggingface.co/tudor-iustin22).

## License

Lisensiert under Apache License 2.0. Laget av Tudor Iustin. See [LICENSE](../../LICENSE).
