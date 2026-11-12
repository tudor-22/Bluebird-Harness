<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <b>Русский</b> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>Единственный AI-харнес, который вам понадобится: превратите любой компьютер в автономную AI-систему.</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** — это приватная локальная AI-система с более чем 12 движками моделей, постоянной памятью, проактивным планированием, управлением компьютером, собственным браузером и встроенным помощником по коду. Работает на macOS, Windows и Linux: без аккаунта, без входа и без облака Bluebird.

## Скачать

| Платформа | Скачать | Как установить |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-mac-arm64.dmg) | Откройте `.dmg` и перетащите **Bluebird** в «Программы». При первом запуске нажмите на приложение правой кнопкой и выберите **Открыть** (оно пока не подписано). |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-win-x64.zip) | Распакуйте архив и запустите `Bluebird.exe`. Если появится SmartScreen, нажмите **Подробнее → Выполнить в любом случае**. |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-linux-x64.tar.gz) | Распакуйте командой `tar -xzf`, затем запустите `./bluebird` из распакованной папки. |

> **Обратите внимание:** пока Bluebird протестирован только на macOS. Сборки для Windows и Linux доступны, но ещё не прошли полное тестирование. Если что-то не работает, создайте issue на вкладке Issues.

При первом запуске окно настройки создаёт приватную локальную базу данных и предлагает скачать Ollama и стартовую модель. Ничего не нужно устанавливать вручную.

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>: специализированные агенты работают бок о бок над одной задачей.</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## Нативное управление любым приложением на вашем компьютере

Введите `@`, чтобы указать Bluebird любое установленное приложение. Он читает окно приложения и управляет им через собственные средства специальных возможностей macOS, Windows и Linux, поэтому работает даже с приложениями без какой-либо интеграции.

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="Нативное управление любым приложением на вашем компьютере" width="100%">
</p>

---

## Что он умеет

| | |
| --- | --- |
| **Любой движок** | Более 12 движков: Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google или любой собственный API. Переключение из одного меню. |
| **Постоянная память** | Помнит вас между разговорами, ищет по всей истории чата и позволяет просматривать и удалять любое воспоминание. |
| **Проактивность** | Выполняет задачи по расписанию (`daily 08:30`, `every 30m`, cron) и сам выходит на связь в Telegram, Discord и Slack. |
| **Управление компьютером** | Читает и управляет настольными приложениями через их API специальных возможностей. Введите `@`, чтобы указать приложение. |
| **Собственный браузер** | Управляет настоящим браузером Chromium: открывает, читает, кликает, вводит текст. `/research` создаёт отчёт с источниками. |
| **Помощник по коду** | Читает, редактирует и запускает код, показывает живой предпросмотр HTML и SVG, а у каждого изменения есть кнопка «Отменить». |
| **Рой и навыки** | `/swarm` делит задачу между четырьмя агентами. Навыки улучшают себя сами и устанавливаются из каталогов Claude Code и Codex. |
| **Контроль у вас** | Всегда спрашивать, Авто или Полный доступ. API слушает только loopback, а ваши ключи никогда не покидают компьютер. |
| **Серверы инструментов (MCP)** | Подключите любой MCP-сервер, и его инструменты появятся в чате. |
| **Интерактивные визуализации** | Отвечает ползунками, графиками, 3D-сценами, диаграммами и живыми мини-приложениями вместо стен текста. |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>Любой движок</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>Постоянная память</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>Проактивность</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>Собственный браузер</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>Помощник по коду</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>Рой и навыки</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>Контроль у вас</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>Серверы инструментов (MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>Интерактивные визуализации</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>Интерактивные визуализации</b></sub></td>
</tr>
</table>

---

## Поддерживаемые движки

Локальные движки определяются автоматически. Облачным движкам нужен ключ, который вы добавляете сами.

| Локальные | Облачные | Свой API |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## Как это работает

Всё работает на вашем компьютере. Разговоры, память и вложения хранятся в приватной локальной базе PostgreSQL. Облачные движки используются только если вы добавите собственный ключ.

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## Запуск из исходников

Нужны Node 22+, pnpm, PostgreSQL 17 и [Ollama](https://ollama.com). Или запустите `bash scripts/install.sh`. Затем откройте <http://localhost:3000>.

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [Полная документация](../../docs/DOCUMENTATION.md)

---

## Поддержать проект

Если Bluebird вам полезен, можно [угостить меня кофе](https://buymeacoffee.com/tudoriustin_) или подписаться на [X](https://x.com/tudoriustin_) и [Hugging Face](https://huggingface.co/tudor-iustin22).

## License

Лицензия Apache License 2.0. Автор: Tudor Iustin. See [LICENSE](../../LICENSE).
