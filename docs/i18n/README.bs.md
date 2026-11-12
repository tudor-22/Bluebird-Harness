<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <b>Bosanski</b> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>Jedini AI harness koji će vam ikada trebati: pretvorite bilo koji računar u autonomni AI sistem.</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** je privatan AI sistem koji radi prvenstveno lokalno, sa više od 12 modelskih motora, trajnom memorijom, proaktivnim zakazivanjem, upravljanjem računarom, vlastitim preglednikom i ugrađenim asistentom za kod. Radi na macOS-u, Windowsu i Linuxu, bez naloga, bez prijave i bez Bluebird clouda.

## Preuzimanje

| Platforma | Preuzimanje | Kako instalirati |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](../../apps/builds/macos/Bluebird-0.1.0-mac-arm64.dmg) | Otvorite `.dmg` i prevucite **Bluebird** u Applications. Pri prvom pokretanju kliknite desnim tasterom na aplikaciju i odaberite **Open** (još nije potpisana). |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](../../apps/builds/windows/Bluebird-0.1.0-win-x64.zip) | Raspakujte arhivu i pokrenite `Bluebird.exe`. Ako se pojavi SmartScreen, kliknite **More info → Run anyway**. |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](../../apps/builds/linux/Bluebird-0.1.0-linux-x64.tar.gz) | Raspakujte pomoću `tar -xzf`, a zatim pokrenite `./bluebird` iz raspakovanog foldera. |

> **Napomena:** Bluebird je do sada testiran samo na macOS-u. Verzije za Windows i Linux su dostupne, ali još nisu u potpunosti testirane. Ako nešto ne radi, otvorite issue na kartici Issues.

Pri prvom pokretanju prozor za postavljanje kreira privatnu lokalnu bazu podataka i nudi preuzimanje Ollame i početnog modela. Ništa ne morate instalirati ručno.

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>: specijalizirani agenti rade rame uz rame na jednom zadatku.</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## Nativno upravljanje računarom za svaku aplikaciju

Upišite `@` da usmjerite Bluebird na bilo koju instaliranu aplikaciju. Čita prozor aplikacije i upravlja njome putem sistemskih radnji pristupačnosti na macOS-u, Windowsu i Linuxu, pa radi i s aplikacijama koje nemaju nikakvu integraciju.

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="Nativno upravljanje računarom za svaku aplikaciju" width="100%">
</p>

---

## Šta može

| | |
| --- | --- |
| **Bilo koji motor** | Više od 12 motora: Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google ili bilo koji vlastiti API. Mijenjate ih iz jednog menija. |
| **Trajna memorija** | Pamti vas kroz razgovore, pretražuje cijelu historiju chata i omogućava vam da vidite i obrišete svako sjećanje. |
| **Proaktivan** | Izvršava zakazane zadatke (`daily 08:30`, `every 30m`, cron) i javlja vam se na Telegramu, Discordu i Slacku. |
| **Upravljanje računarom** | Čita i upravlja desktop aplikacijama preko njihovih API-ja za pristupačnost. Upišite `@` da označite aplikaciju. |
| **Vlastiti preglednik** | Upravlja pravim Chromium preglednikom: otvara, čita, klika, upisuje. `/research` pravi izvještaj s izvorima. |
| **Asistent za kod** | Čita, uređuje i pokreće kod, prikazuje HTML i SVG uživo, a svaka izmjena ima dugme Poništi. |
| **Roj i vještine** | `/swarm` dijeli posao na do četiri agenta. Vještine (skills) same sebe poboljšavaju i instaliraju se iz kataloga Claude Codea i Codexa. |
| **Vi imate kontrolu** | Uvijek pitaj, Auto ili Puni pristup. API sluša samo na loopbacku, a vaši ključevi nikada ne napuštaju računar. |
| **Serveri alata (MCP)** | Povežite bilo koji MCP server i njegovi alati se pojavljuju u chatu. |
| **Interaktivni vizuali** | Odgovara klizačima, grafikonima, 3D scenama, dijagramima i mini aplikacijama uživo umjesto zidova teksta. |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>Bilo koji motor</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>Trajna memorija</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>Proaktivan</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>Vlastiti preglednik</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>Asistent za kod</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>Roj i vještine</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>Vi imate kontrolu</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>Serveri alata (MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>Interaktivni vizuali</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>Interaktivni vizuali</b></sub></td>
</tr>
</table>

---

## Podržani motori

Lokalni motori se otkrivaju automatski. Hostovani motori zahtijevaju ključ koji sami dodajete.

| Lokalni | Hostovani | Vlastiti |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## Kako radi

Sve radi na vašem računaru. Razgovori, memorija i prilozi nalaze se u privatnoj lokalnoj PostgreSQL bazi. Hostovani motori koriste se samo ako dodate vlastiti ključ.

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## Pokretanje iz izvornog koda

Potrebni su Node 22+, pnpm, PostgreSQL 17 i [Ollama](https://ollama.com). Ili pokrenite `bash scripts/install.sh`. Zatim otvorite <http://localhost:3000>.

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [Kompletna dokumentacija](../../docs/DOCUMENTATION.md)

---

## Podržite projekat

Ako vam je Bluebird koristan, možete me [počastiti kafom](https://buymeacoffee.com/tudoriustin_) ili me pratiti na [X-u](https://x.com/tudoriustin_) i [Hugging Faceu](https://huggingface.co/tudor-iustin22).

## License

Licencirano pod Apache License 2.0. Autor: Tudor Iustin. See [LICENSE](../../LICENSE).
