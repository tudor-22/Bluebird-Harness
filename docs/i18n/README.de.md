<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <b>Deutsch</b> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>Das einzige KI-Harness, das du je brauchen wirst: Verwandle jeden Computer in ein autonomes KI-System.</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** ist ein privates, lokal ausgerichtetes KI-System mit über 12 Modell-Engines, dauerhaftem Gedächtnis, proaktiver Planung, Computersteuerung, eigenem Browser und integriertem Code-Assistenten. Es läuft unter macOS, Windows und Linux, ohne Konto, ohne Anmeldung und ohne Bluebird-Cloud.

## Download

| Plattform | Download | Installation |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](../../apps/builds/macos/Bluebird-0.1.0-mac-arm64.dmg) | Öffne die `.dmg` und ziehe **Bluebird** in „Programme“. Klicke beim ersten Start mit der rechten Maustaste auf die App und wähle **Öffnen** (sie ist noch nicht signiert). |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](../../apps/builds/windows/Bluebird-0.1.0-win-x64.zip) | Entpacke das Archiv und starte `Bluebird.exe`. Wenn SmartScreen erscheint, klicke auf **Weitere Informationen → Trotzdem ausführen**. |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](../../apps/builds/linux/Bluebird-0.1.0-linux-x64.tar.gz) | Entpacke mit `tar -xzf` und starte `./bluebird` im entpackten Ordner. |

> **Hinweis:** Bluebird wurde bisher nur unter macOS getestet. Die Builds für Windows und Linux sind verfügbar, aber noch nicht vollständig getestet. Wenn etwas nicht funktioniert, öffne bitte ein Issue im Reiter „Issues“.

Beim ersten Start legt ein Einrichtungsfenster eine private lokale Datenbank an und bietet an, Ollama und ein Starter-Modell herunterzuladen. Du musst nichts von Hand installieren.

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>: spezialisierte Agenten arbeiten Seite an Seite an einer Aufgabe.</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## Native Computersteuerung für jede App auf deinem Computer

Tippe `@`, um Bluebird auf eine beliebige installierte App zu richten. Es liest das Fenster der App und bedient sie über die eigenen Bedienungshilfen-Aktionen von macOS, Windows und Linux, sodass es auch mit Apps funktioniert, die gar keine Integration haben.

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="Native Computersteuerung für jede App auf deinem Computer" width="100%">
</p>

---

## Was es kann

| | |
| --- | --- |
| **Jede Engine** | Über 12 Engines: Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google oder jede eigene API. Wechsel über ein Menü. |
| **Dauerhaftes Gedächtnis** | Merkt sich dich über Unterhaltungen hinweg, durchsucht deinen gesamten Chatverlauf und lässt dich jede Erinnerung ansehen und löschen. |
| **Proaktiv** | Führt geplante Aufgaben aus (`daily 08:30`, `every 30m`, Cron) und meldet sich bei dir über Telegram, Discord und Slack. |
| **Computersteuerung** | Liest und bedient Desktop-Apps über deren Bedienungshilfen-APIs. Mit `@` zeigst du auf eine App. |
| **Eigener Browser** | Steuert einen echten Chromium-Browser: öffnen, lesen, klicken, tippen. `/research` erstellt einen Bericht mit Quellen. |
| **Code-Assistent** | Liest, bearbeitet und führt Code aus, zeigt HTML und SVG live an, und jede Änderung hat eine Rückgängig-Schaltfläche. |
| **Schwarm und Skills** | `/swarm` verteilt eine Aufgabe auf bis zu vier Agenten. Skills verbessern sich selbst und lassen sich aus Claude-Code- und Codex-Katalogen installieren. |
| **Du behältst die Kontrolle** | Immer fragen, Auto oder Vollzugriff. Die API hört nur auf Loopback, und deine Schlüssel verlassen deinen Computer nie. |
| **Tool-Server (MCP)** | Binde einen beliebigen MCP-Server ein, und seine Tools erscheinen im Chat. |
| **Interaktive Visualisierungen** | Antwortet mit Schiebereglern, Diagrammen, 3D-Szenen, Schaubildern und Mini-Apps statt mit Textwüsten. |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>Jede Engine</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>Dauerhaftes Gedächtnis</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>Proaktiv</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>Eigener Browser</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>Code-Assistent</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>Schwarm und Skills</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>Du behältst die Kontrolle</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>Tool-Server (MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>Interaktive Visualisierungen</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>Interaktive Visualisierungen</b></sub></td>
</tr>
</table>

---

## Unterstützte Engines

Lokale Engines werden automatisch erkannt. Gehostete Engines brauchen einen Schlüssel, den du selbst hinzufügst.

| Lokal | Gehostet | Eigene |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## So funktioniert es

Alles läuft auf deinem Computer. Unterhaltungen, Gedächtnis und Anhänge liegen in einer privaten lokalen PostgreSQL-Datenbank. Gehostete Engines werden nur genutzt, wenn du einen eigenen Schlüssel hinzufügst.

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## Aus dem Quellcode starten

Benötigt Node 22+, pnpm, PostgreSQL 17 und [Ollama](https://ollama.com). Oder führe `bash scripts/install.sh` aus. Öffne dann <http://localhost:3000>.

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [Vollständige Dokumentation](../../docs/DOCUMENTATION.md)

---

## Das Projekt unterstützen

Wenn Bluebird dir nützt, kannst du mir [einen Kaffee spendieren](https://buymeacoffee.com/tudoriustin_) oder mir auf [X](https://x.com/tudoriustin_) und [Hugging Face](https://huggingface.co/tudor-iustin22) folgen.

## License

Lizenziert unter der Apache License 2.0. Entwickelt von Tudor Iustin. See [LICENSE](../../LICENSE).
