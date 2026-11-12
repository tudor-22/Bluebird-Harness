<p align="center">
<a href="../../README.md">English</a> | <b>简体中文</b> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>你唯一需要的 AI 框架：把任何电脑变成自主运行的 AI 系统。</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** 是一个私密、本地优先的 AI 系统，支持 12 种以上模型引擎，具备持久记忆、主动调度、电脑操控、自带浏览器和内置代码助手。它可在 macOS、Windows 和 Linux 上运行，无需账号、无需登录，也没有 Bluebird 云服务。

## 下载

| 平台 | 下载 | 安装方法 |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](../../apps/builds/macos/Bluebird-0.1.0-mac-arm64.dmg) | 打开 `.dmg`，将 **Bluebird** 拖到“应用程序”。首次启动时，右键点击应用并选择**打开**（应用尚未签名）。 |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](../../apps/builds/windows/Bluebird-0.1.0-win-x64.zip) | 解压后运行 `Bluebird.exe`。如果出现 SmartScreen，请点击**更多信息 → 仍要运行**。 |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](../../apps/builds/linux/Bluebird-0.1.0-linux-x64.tar.gz) | 用 `tar -xzf` 解压，然后在解压后的文件夹中运行 `./bluebird`。 |

> **提示：** 目前仅在 macOS 上完成测试。Windows 和 Linux 版本已提供，但尚未经过完整测试。如遇问题，请在 Issues 页面提交。

首次启动时，设置窗口会创建私有本地数据库，并提示下载 Ollama 和入门模型。无需手动安装任何东西。

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>：多个专业智能体并行协作完成同一任务。</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## 原生电脑操控，适用于你电脑上的任何应用

输入 `@` 即可让 Bluebird 指向任意已安装的应用。它会读取应用窗口，并通过 macOS、Windows 和 Linux 系统自带的无障碍操作来控制它，因此即使应用没有任何集成也能使用。

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="原生电脑操控，适用于你电脑上的任何应用" width="100%">
</p>

---

## 功能

| | |
| --- | --- |
| **任意引擎** | 12 种以上引擎：Ollama、llama.cpp、vLLM、LM Studio、Strata Engine、OpenAI、Anthropic、DeepSeek、Qwen、Mistral、Google，或任何自定义 API。一个菜单即可切换。 |
| **持久记忆** | 跨对话记住你，可搜索完整聊天记录，并允许你查看和删除每一条记忆。 |
| **主动执行** | 运行定时任务（`daily 08:30`、`every 30m`、cron），并通过 Telegram、Discord 和 Slack 主动联系你。 |
| **电脑操控** | 通过无障碍接口读取并操作桌面应用。输入 `@` 即可指定某个应用。 |
| **自带浏览器** | 驱动真实的 Chromium 浏览器：打开、阅读、点击、输入。`/research` 会生成带来源的报告。 |
| **代码助手** | 读取、编辑并运行代码，实时预览 HTML 和 SVG，每次修改都有“撤销”按钮。 |
| **智能体群与技能** | `/swarm` 可将任务分给最多四个智能体。技能会自我改进，并可从 Claude Code 和 Codex 目录安装。 |
| **始终由你掌控** | 可选“始终询问”、“自动”或“完全访问”。API 仅监听本地回环地址，你的密钥不会离开你的电脑。 |
| **工具服务器（MCP）** | 接入任意 MCP 服务器，其工具就会出现在聊天中。 |
| **交互式可视化** | 用滑块、图表、3D 场景、示意图和实时小应用来回答，而不是大段文字。 |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>任意引擎</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>持久记忆</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>主动执行</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>自带浏览器</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>代码助手</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>智能体群与技能</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>始终由你掌控</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>工具服务器（MCP）</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>交互式可视化</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>交互式可视化</b></sub></td>
</tr>
</table>

---

## 支持的引擎

本地引擎会被自动检测。托管引擎需要你自己添加密钥。

| 本地 | 托管 | 自定义 |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## 工作原理

一切都在你的电脑上运行。对话、记忆和附件保存在私有的本地 PostgreSQL 数据库中。只有在你添加自己的密钥后，才会使用托管引擎。

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## 从源码运行

需要 Node 22+、pnpm、PostgreSQL 17 和 [Ollama](https://ollama.com)。也可以运行 `bash scripts/install.sh`。然后打开 <http://localhost:3000>。

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [完整文档](../../docs/DOCUMENTATION.md)

---

## 支持本项目

如果 Bluebird 对你有帮助，可以[请我喝杯咖啡](https://buymeacoffee.com/tudoriustin_)，也欢迎关注我的 [X](https://x.com/tudoriustin_) 和 [Hugging Face](https://huggingface.co/tudor-iustin22)。

## License

基于 Apache License 2.0 许可。作者：Tudor Iustin。 See [LICENSE](../../LICENSE).
