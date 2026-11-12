<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <b>繁體中文</b> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>你唯一需要的 AI 框架：把任何電腦變成自主運作的 AI 系統。</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** 是一個私密、本機優先的 AI 系統，支援 12 種以上模型引擎，具備持久記憶、主動排程、電腦操控、內建瀏覽器與程式碼助理。它可在 macOS、Windows 和 Linux 上執行，不需要帳號、不需要登入，也沒有 Bluebird 雲端服務。

## 下載

| 平台 | 下載 | 安裝方式 |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](../../apps/builds/macos/Bluebird-0.1.0-mac-arm64.dmg) | 開啟 `.dmg`，將 **Bluebird** 拖曳到「應用程式」。首次啟動時，請在 App 上按右鍵並選擇**打開**（尚未簽署）。 |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](../../apps/builds/windows/Bluebird-0.1.0-win-x64.zip) | 解壓縮後執行 `Bluebird.exe`。若出現 SmartScreen，請點選**其他資訊 → 仍要執行**。 |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](../../apps/builds/linux/Bluebird-0.1.0-linux-x64.tar.gz) | 使用 `tar -xzf` 解壓縮，然後在解壓縮後的資料夾中執行 `./bluebird`。 |

> **提醒：** 目前僅在 macOS 上完成測試。Windows 與 Linux 版本已提供，但尚未經過完整測試。若遇到問題，請在 Issues 頁面回報。

首次啟動時，設定視窗會建立私有的本機資料庫，並提示下載 Ollama 與入門模型。不需要手動安裝任何東西。

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>：多個專業代理並行協作完成同一項任務。</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## 原生電腦操控，適用於你電腦上的任何應用程式

輸入 `@` 即可讓 Bluebird 指向任何已安裝的應用程式。它會讀取應用程式視窗，並透過 macOS、Windows 與 Linux 系統內建的輔助使用操作來控制它，因此即使應用程式沒有任何整合也能使用。

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="原生電腦操控，適用於你電腦上的任何應用程式" width="100%">
</p>

---

## 功能

| | |
| --- | --- |
| **任意引擎** | 12 種以上引擎：Ollama、llama.cpp、vLLM、LM Studio、Strata Engine、OpenAI、Anthropic、DeepSeek、Qwen、Mistral、Google，或任何自訂 API。一個選單即可切換。 |
| **持久記憶** | 跨對話記住你，可搜尋完整聊天紀錄，並讓你檢視與刪除每一則記憶。 |
| **主動執行** | 執行排程任務（`daily 08:30`、`every 30m`、cron），並透過 Telegram、Discord 和 Slack 主動聯絡你。 |
| **電腦操控** | 透過輔助使用 API 讀取並操作桌面應用程式。輸入 `@` 即可指定某個應用程式。 |
| **內建瀏覽器** | 驅動真正的 Chromium 瀏覽器：開啟、閱讀、點擊、輸入。`/research` 會產生附來源的報告。 |
| **程式碼助理** | 讀取、編輯並執行程式碼，即時預覽 HTML 與 SVG，每次修改都有「復原」按鈕。 |
| **代理群與技能** | `/swarm` 可將任務分給最多四個代理。技能會自我改進，並可從 Claude Code 與 Codex 目錄安裝。 |
| **一切由你掌控** | 可選「每次詢問」、「自動」或「完整存取」。API 只監聽本機回送位址，你的金鑰不會離開你的電腦。 |
| **工具伺服器（MCP）** | 接上任何 MCP 伺服器，其工具就會出現在聊天中。 |
| **互動式視覺化** | 以滑桿、圖表、3D 場景、圖解與即時小應用來回答，而不是大段文字。 |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>任意引擎</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>持久記憶</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>主動執行</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>內建瀏覽器</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>程式碼助理</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>代理群與技能</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>一切由你掌控</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>工具伺服器（MCP）</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>互動式視覺化</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>互動式視覺化</b></sub></td>
</tr>
</table>

---

## 支援的引擎

本機引擎會自動偵測。託管引擎需要你自行加入金鑰。

| 本機 | 託管 | 自訂 |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## 運作方式

一切都在你的電腦上執行。對話、記憶與附件都存放在私有的本機 PostgreSQL 資料庫中。只有在你加入自己的金鑰後，才會使用託管引擎。

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## 從原始碼執行

需要 Node 22+、pnpm、PostgreSQL 17 與 [Ollama](https://ollama.com)。也可以執行 `bash scripts/install.sh`。然後開啟 <http://localhost:3000>。

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [完整文件](../../docs/DOCUMENTATION.md)

---

## 支持本專案

如果 Bluebird 對你有幫助，歡迎[請我喝杯咖啡](https://buymeacoffee.com/tudoriustin_)，也歡迎追蹤我的 [X](https://x.com/tudoriustin_) 與 [Hugging Face](https://huggingface.co/tudor-iustin22)。

## License

採用 Apache License 2.0 授權。作者：Tudor Iustin。 See [LICENSE](../../LICENSE).
