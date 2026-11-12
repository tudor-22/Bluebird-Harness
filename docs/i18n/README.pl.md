<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <b>Polski</b> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>Jedyny harness AI, jakiego będziesz potrzebować: zamień dowolny komputer w autonomiczny system AI.</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** to prywatny system AI działający lokalnie, z ponad 12 silnikami modeli, trwałą pamięcią, proaktywnym planowaniem, sterowaniem komputerem, własną przeglądarką i wbudowanym asystentem kodu. Działa na macOS, Windows i Linuksie, bez konta, bez logowania i bez chmury Bluebird.

## Pobierz

| Platforma | Pobierz | Jak zainstalować |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](../../apps/builds/macos/Bluebird-0.1.0-mac-arm64.dmg) | Otwórz plik `.dmg` i przeciągnij **Bluebird** do Programów. Przy pierwszym uruchomieniu kliknij aplikację prawym przyciskiem i wybierz **Otwórz** (nie jest jeszcze podpisana). |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](../../apps/builds/windows/Bluebird-0.1.0-win-x64.zip) | Rozpakuj archiwum i uruchom `Bluebird.exe`. Jeśli pojawi się SmartScreen, kliknij **Więcej informacji → Uruchom mimo to**. |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](../../apps/builds/linux/Bluebird-0.1.0-linux-x64.tar.gz) | Rozpakuj poleceniem `tar -xzf`, a następnie uruchom `./bluebird` z rozpakowanego folderu. |

> **Uwaga:** Bluebird był dotąd testowany tylko na macOS. Wersje dla Windows i Linuksa są dostępne, ale nie zostały jeszcze w pełni przetestowane. Jeśli coś nie działa, zgłoś problem w zakładce Issues.

Przy pierwszym uruchomieniu okno konfiguracji tworzy prywatną lokalną bazę danych i proponuje pobranie Ollamy oraz modelu startowego. Niczego nie trzeba instalować ręcznie.

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>: wyspecjalizowani agenci pracujący obok siebie nad jednym zadaniem.</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## Natywne sterowanie komputerem dla każdej aplikacji

Wpisz `@`, aby wskazać Bluebirdowi dowolną zainstalowaną aplikację. Odczytuje jej okno i obsługuje ją przez systemowe akcje dostępności w macOS, Windows i Linuksie, więc działa nawet z aplikacjami bez żadnej integracji.

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="Natywne sterowanie komputerem dla każdej aplikacji" width="100%">
</p>

---

## Co potrafi

| | |
| --- | --- |
| **Dowolny silnik** | Ponad 12 silników: Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google lub dowolne własne API. Przełączasz je z jednego menu. |
| **Trwała pamięć** | Pamięta Cię między rozmowami, przeszukuje całą historię czatu i pozwala zobaczyć oraz usunąć każde wspomnienie. |
| **Proaktywny** | Wykonuje zaplanowane zadania (`daily 08:30`, `every 30m`, cron) i odezwie się do Ciebie na Telegramie, Discordzie i Slacku. |
| **Sterowanie komputerem** | Odczytuje i obsługuje aplikacje na pulpicie przez ich interfejsy dostępności. Wpisz `@`, aby wskazać aplikację. |
| **Własna przeglądarka** | Steruje prawdziwą przeglądarką Chromium: otwiera, czyta, klika, wpisuje. `/research` tworzy raport ze źródłami. |
| **Asystent kodu** | Czyta, edytuje i uruchamia kod, pokazuje podgląd HTML i SVG na żywo, a każda zmiana ma przycisk Cofnij. |
| **Rój i skille** | `/swarm` dzieli zadanie między maksymalnie czterech agentów. Skille same się ulepszają i instalują z katalogów Claude Code i Codex. |
| **Ty masz kontrolę** | Zawsze pytaj, Auto albo Pełny dostęp. API nasłuchuje tylko na loopbacku, a Twoje klucze nigdy nie opuszczają komputera. |
| **Serwery narzędzi (MCP)** | Podłącz dowolny serwer MCP, a jego narzędzia pojawią się w czacie. |
| **Interaktywne wizualizacje** | Odpowiada suwakami, wykresami, scenami 3D, diagramami i mini-aplikacjami na żywo zamiast ścian tekstu. |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>Dowolny silnik</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>Trwała pamięć</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>Proaktywny</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>Własna przeglądarka</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>Asystent kodu</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>Rój i skille</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>Ty masz kontrolę</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>Serwery narzędzi (MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>Interaktywne wizualizacje</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>Interaktywne wizualizacje</b></sub></td>
</tr>
</table>

---

## Obsługiwane silniki

Silniki lokalne są wykrywane automatycznie. Silniki hostowane wymagają klucza, który dodajesz sam.

| Lokalne | Hostowane | Własne |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## Jak to działa

Wszystko działa na Twoim komputerze. Rozmowy, pamięć i załączniki trafiają do prywatnej, lokalnej bazy PostgreSQL. Silniki hostowane są używane tylko wtedy, gdy dodasz własny klucz.

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## Uruchom ze źródeł

Wymaga Node 22+, pnpm, PostgreSQL 17 i [Ollamy](https://ollama.com). Możesz też uruchomić `bash scripts/install.sh`. Następnie otwórz <http://localhost:3000>.

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [Pełna dokumentacja](../../docs/DOCUMENTATION.md)

---

## Wesprzyj projekt

Jeśli Bluebird jest dla Ciebie przydatny, możesz [postawić mi kawę](https://buymeacoffee.com/tudoriustin_) albo śledzić mnie na [X](https://x.com/tudoriustin_) i [Hugging Face](https://huggingface.co/tudor-iustin22).

## License

Licencja Apache License 2.0. Autor: Tudor Iustin. See [LICENSE](../../LICENSE).
