<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <b>Українська</b> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>Єдиний AI-харнес, який вам знадобиться: перетворіть будь-який комп'ютер на автономну AI-систему.</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** — це приватна локальна AI-система з понад 12 рушіями моделей, постійною пам'яттю, проактивним плануванням, керуванням комп'ютером, власним браузером і вбудованим помічником із коду. Працює на macOS, Windows і Linux: без облікового запису, без входу і без хмари Bluebird.

## Завантаження

| Платформа | Завантажити | Як встановити |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](../../apps/builds/macos/Bluebird-0.1.0-mac-arm64.dmg) | Відкрийте `.dmg` і перетягніть **Bluebird** у «Програми». Під час першого запуску клацніть застосунок правою кнопкою та виберіть **Відкрити** (він ще не підписаний). |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](../../apps/builds/windows/Bluebird-0.1.0-win-x64.zip) | Розпакуйте архів і запустіть `Bluebird.exe`. Якщо з'явиться SmartScreen, натисніть **Докладніше → Все одно виконати**. |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](../../apps/builds/linux/Bluebird-0.1.0-linux-x64.tar.gz) | Розпакуйте командою `tar -xzf`, потім запустіть `./bluebird` з розпакованої теки. |

> **Зверніть увагу:** поки що Bluebird протестовано лише на macOS. Збірки для Windows і Linux доступні, але ще не пройшли повного тестування. Якщо щось не працює, створіть issue на вкладці Issues.

Під час першого запуску вікно налаштування створює приватну локальну базу даних і пропонує завантажити Ollama та стартову модель. Нічого не потрібно встановлювати вручну.

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>: спеціалізовані агенти працюють пліч-о-пліч над одним завданням.</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## Нативне керування будь-яким застосунком на вашому комп'ютері

Введіть `@`, щоб указати Bluebird будь-який встановлений застосунок. Він читає вікно застосунку й керує ним через власні засоби доступності macOS, Windows і Linux, тому працює навіть із застосунками без жодної інтеграції.

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="Нативне керування будь-яким застосунком на вашому комп'ютері" width="100%">
</p>

---

## Що він уміє

| | |
| --- | --- |
| **Будь-який рушій** | Понад 12 рушіїв: Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google або будь-який власний API. Перемикання з одного меню. |
| **Постійна пам'ять** | Пам'ятає вас між розмовами, шукає по всій історії чату і дає змогу переглядати та видаляти кожен спогад. |
| **Проактивність** | Виконує заплановані завдання (`daily 08:30`, `every 30m`, cron) і сам звертається до вас у Telegram, Discord та Slack. |
| **Керування комп'ютером** | Читає та керує настільними застосунками через їхні API доступності. Введіть `@`, щоб указати застосунок. |
| **Власний браузер** | Керує справжнім браузером Chromium: відкриває, читає, клікає, вводить текст. `/research` створює звіт із джерелами. |
| **Помічник із коду** | Читає, редагує та запускає код, показує живий попередній перегляд HTML і SVG, а кожна зміна має кнопку «Скасувати». |
| **Рій і навички** | `/swarm` ділить завдання між чотирма агентами. Навички самі себе вдосконалюють і встановлюються з каталогів Claude Code та Codex. |
| **Контроль у ваших руках** | Завжди питати, Авто або Повний доступ. API слухає лише loopback, а ваші ключі ніколи не залишають комп'ютер. |
| **Сервери інструментів (MCP)** | Підключіть будь-який MCP-сервер, і його інструменти з'являться в чаті. |
| **Інтерактивні візуалізації** | Відповідає повзунками, графіками, 3D-сценами, діаграмами та живими міні-застосунками замість стін тексту. |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>Будь-який рушій</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>Постійна пам'ять</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>Проактивність</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>Власний браузер</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>Помічник із коду</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>Рій і навички</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>Контроль у ваших руках</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>Сервери інструментів (MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>Інтерактивні візуалізації</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>Інтерактивні візуалізації</b></sub></td>
</tr>
</table>

---

## Підтримувані рушії

Локальні рушії визначаються автоматично. Хмарним рушіям потрібен ключ, який ви додаєте самі.

| Локальні | Хмарні | Власний API |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## Як це працює

Усе працює на вашому комп'ютері. Розмови, пам'ять і вкладення зберігаються в приватній локальній базі PostgreSQL. Хмарні рушії використовуються лише тоді, коли ви додаєте власний ключ.

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## Запуск із вихідного коду

Потрібні Node 22+, pnpm, PostgreSQL 17 і [Ollama](https://ollama.com). Або запустіть `bash scripts/install.sh`. Потім відкрийте <http://localhost:3000>.

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [Повна документація](../../docs/DOCUMENTATION.md)

---

## Підтримати проєкт

Якщо Bluebird вам корисний, можна [пригостити мене кавою](https://buymeacoffee.com/tudoriustin_) або підписатися на [X](https://x.com/tudoriustin_) і [Hugging Face](https://huggingface.co/tudor-iustin22).

## License

Ліцензія Apache License 2.0. Автор: Tudor Iustin. See [LICENSE](../../LICENSE).
