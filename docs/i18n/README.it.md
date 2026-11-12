<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <b>Italiano</b> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>L'unico harness AI di cui avrai bisogno: trasforma qualsiasi computer in un sistema AI autonomo.</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** è un sistema AI privato e local-first con oltre 12 motori di modelli, memoria persistente, pianificazione proattiva, controllo del computer, un browser tutto suo e un assistente di codice integrato. Funziona su macOS, Windows e Linux, senza account, senza accesso e senza cloud Bluebird.

## Download

| Piattaforma | Download | Come installare |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](../../apps/builds/macos/Bluebird-0.1.0-mac-arm64.dmg) | Apri il `.dmg` e trascina **Bluebird** in Applicazioni. Al primo avvio, fai clic destro sull'app e scegli **Apri** (non è ancora firmata). |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](../../apps/builds/windows/Bluebird-0.1.0-win-x64.zip) | Decomprimi ed esegui `Bluebird.exe`. Se compare SmartScreen, fai clic su **Ulteriori informazioni → Esegui comunque**. |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](../../apps/builds/linux/Bluebird-0.1.0-linux-x64.tar.gz) | Estrai con `tar -xzf`, poi esegui `./bluebird` dalla cartella estratta. |

> **Nota:** finora Bluebird è stato testato solo su macOS. Le build per Windows e Linux sono disponibili ma non ancora testate a fondo. Se qualcosa non funziona, apri una segnalazione nella scheda Issues.

Al primo avvio, una finestra di configurazione crea un database locale privato e propone di scaricare Ollama e un modello iniziale. Non devi installare nulla a mano.

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>: agenti specializzati che lavorano fianco a fianco sullo stesso compito.</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## Controllo nativo del computer per qualsiasi app

Digita `@` per indicare a Bluebird qualsiasi app installata. Legge la finestra dell'app e la usa tramite le azioni di accessibilità del sistema su macOS, Windows e Linux, quindi funziona anche con app che non hanno alcuna integrazione.

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="Controllo nativo del computer per qualsiasi app" width="100%">
</p>

---

## Cosa fa

| | |
| --- | --- |
| **Qualsiasi motore** | Oltre 12 motori: Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google o qualsiasi API personalizzata. Cambi da un solo menu. |
| **Memoria persistente** | Si ricorda di te tra una conversazione e l'altra, cerca in tutta la cronologia e ti lascia vedere ed eliminare ogni ricordo. |
| **Proattivo** | Esegue attività pianificate (`daily 08:30`, `every 30m`, cron) e ti contatta su Telegram, Discord e Slack. |
| **Controllo del computer** | Legge e usa le app desktop tramite le loro API di accessibilità. Digita `@` per indicare un'app. |
| **Browser integrato** | Pilota un vero browser Chromium: apre, legge, clicca, scrive. `/research` produce un report con le fonti. |
| **Assistente di codice** | Legge, modifica ed esegue codice, mostra anteprime live di HTML e SVG, e ogni modifica ha un pulsante Annulla. |
| **Sciame e skill** | `/swarm` divide un lavoro tra fino a quattro agenti. Le skill si migliorano da sole e si installano dai cataloghi di Claude Code e Codex. |
| **Il controllo resta a te** | Chiedi sempre, Auto o Accesso completo. L'API ascolta solo in loopback e le tue chiavi non lasciano mai il computer. |
| **Server di strumenti (MCP)** | Collega qualsiasi server MCP e i suoi strumenti compaiono nella chat. |
| **Visualizzazioni interattive** | Risponde con cursori, grafici, scene 3D, diagrammi e mini app dal vivo invece di muri di testo. |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>Qualsiasi motore</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>Memoria persistente</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>Proattivo</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>Browser integrato</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>Assistente di codice</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>Sciame e skill</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>Il controllo resta a te</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>Server di strumenti (MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>Visualizzazioni interattive</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>Visualizzazioni interattive</b></sub></td>
</tr>
</table>

---

## Motori supportati

I motori locali vengono rilevati automaticamente. I motori ospitati richiedono una chiave che aggiungi tu.

| Locali | Ospitati | Personalizzato |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## Come funziona

Tutto gira sul tuo computer. Conversazioni, memoria e allegati risiedono in un database PostgreSQL locale e privato. I motori ospitati si usano solo se aggiungi una tua chiave.

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## Esegui dal sorgente

Richiede Node 22+, pnpm, PostgreSQL 17 e [Ollama](https://ollama.com). Oppure esegui `bash scripts/install.sh`. Poi apri <http://localhost:3000>.

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [Documentazione completa](../../docs/DOCUMENTATION.md)

---

## Sostieni il progetto

Se Bluebird ti è utile, puoi [offrirmi un caffè](https://buymeacoffee.com/tudoriustin_) o seguirmi su [X](https://x.com/tudoriustin_) e [Hugging Face](https://huggingface.co/tudor-iustin22).

## License

Rilasciato con licenza Apache License 2.0. Creato da Tudor Iustin. See [LICENSE](../../LICENSE).
