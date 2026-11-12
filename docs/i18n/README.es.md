<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <b>Español</b> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>El único arnés de IA que necesitarás: convierte cualquier ordenador en un sistema de IA autónomo.</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** es un sistema de IA privado y local, con más de 12 motores de modelos, memoria persistente, programación proactiva, control del ordenador, navegador propio y asistente de código integrado. Funciona en macOS, Windows y Linux, sin cuenta, sin inicio de sesión y sin nube de Bluebird.

## Descarga

| Plataforma | Descarga | Cómo instalar |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-mac-arm64.dmg) | Abre el `.dmg` y arrastra **Bluebird** a Aplicaciones. En el primer inicio, haz clic derecho en la app y elige **Abrir** (aún no está firmada). |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-win-x64.zip) | Descomprime y ejecuta `Bluebird.exe`. Si aparece SmartScreen, haz clic en **Más información → Ejecutar de todas formas**. |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-linux-x64.tar.gz) | Extrae con `tar -xzf` y ejecuta `./bluebird` desde la carpeta extraída. |

> **Aviso:** hasta ahora Bluebird solo se ha probado en macOS. Las versiones para Windows y Linux están disponibles, pero aún no se han probado por completo. Si algo falla, abre una incidencia en la pestaña Issues.

En el primer inicio, una ventana de configuración crea una base de datos local privada y ofrece descargar Ollama y un modelo inicial. No hace falta instalar nada a mano.

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>: agentes especializados trabajando codo con codo en una misma tarea.</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## Control nativo del ordenador para cualquier app

Escribe `@` para señalar a Bluebird cualquier app instalada. Lee la ventana de la app y la maneja con las acciones de accesibilidad del propio sistema en macOS, Windows y Linux, así que funciona con apps que no tienen ninguna integración.

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="Control nativo del ordenador para cualquier app" width="100%">
</p>

---

## Qué hace

| | |
| --- | --- |
| **Cualquier motor** | Más de 12 motores: Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google o cualquier API personalizada. Cambia desde un solo menú. |
| **Memoria persistente** | Te recuerda entre conversaciones, busca en todo tu historial de chat y te deja ver y borrar cada recuerdo. |
| **Proactivo** | Ejecuta tareas programadas (`daily 08:30`, `every 30m`, cron) y te avisa por Telegram, Discord y Slack. |
| **Control del ordenador** | Lee y maneja aplicaciones de escritorio mediante sus API de accesibilidad. Escribe `@` para señalar una app. |
| **Navegador propio** | Controla un navegador Chromium real: abrir, leer, hacer clic, escribir. `/research` genera un informe con fuentes. |
| **Asistente de código** | Lee, edita y ejecuta código, previsualiza HTML y SVG en vivo, y cada cambio tiene un botón para deshacer. |
| **Enjambre y skills** | `/swarm` reparte un trabajo entre hasta cuatro agentes. Las skills se mejoran solas y se instalan desde los catálogos de Claude Code y Codex. |
| **Tú mantienes el control** | Preguntar siempre, Auto o Acceso total. La API solo escucha en loopback y tus claves nunca salen de tu ordenador. |
| **Servidores de herramientas (MCP)** | Conecta cualquier servidor MCP y sus herramientas aparecen en el chat. |
| **Visuales interactivos** | Responde con deslizadores, gráficos, escenas 3D, diagramas y mini apps en vivo en lugar de muros de texto. |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>Cualquier motor</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>Memoria persistente</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>Proactivo</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>Navegador propio</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>Asistente de código</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>Enjambre y skills</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>Tú mantienes el control</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>Servidores de herramientas (MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>Visuales interactivos</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>Visuales interactivos</b></sub></td>
</tr>
</table>

---

## Motores compatibles

Los motores locales se detectan automáticamente. Los motores alojados necesitan una clave que añadas tú.

| Locales | Alojados | Personalizado |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## Cómo funciona

Todo se ejecuta en tu ordenador. Las conversaciones, la memoria y los adjuntos viven en una base de datos PostgreSQL local y privada. Los motores alojados solo se usan si añades tu propia clave.

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## Ejecutar desde el código fuente

Requiere Node 22+, pnpm, PostgreSQL 17 y [Ollama](https://ollama.com). O ejecuta `bash scripts/install.sh`. Después abre <http://localhost:3000>.

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [Documentación completa](../../docs/DOCUMENTATION.md)

---

## Apoya el proyecto

Si Bluebird te resulta útil, puedes [invitarme a un café](https://buymeacoffee.com/tudoriustin_) o seguirme en [X](https://x.com/tudoriustin_) y [Hugging Face](https://huggingface.co/tudor-iustin22).

## License

Con licencia Apache License 2.0. Creado por Tudor Iustin. See [LICENSE](../../LICENSE).
