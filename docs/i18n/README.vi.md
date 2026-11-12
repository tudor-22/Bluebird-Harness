<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <b>Tiếng Việt</b>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>Bộ khung AI duy nhất bạn cần: biến bất kỳ máy tính nào thành một hệ thống AI tự chủ.</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** là hệ thống AI riêng tư, ưu tiên chạy cục bộ, với hơn 12 công cụ mô hình, bộ nhớ lâu dài, lập lịch chủ động, điều khiển máy tính, trình duyệt riêng và trợ lý lập trình tích hợp. Chạy trên macOS, Windows và Linux, không cần tài khoản, không cần đăng nhập và không có đám mây của Bluebird.

## Tải xuống

| Nền tảng | Tải xuống | Cách cài đặt |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](../../apps/builds/macos/Bluebird-0.1.0-mac-arm64.dmg) | Mở tệp `.dmg` và kéo **Bluebird** vào Applications. Lần mở đầu tiên, nhấp chuột phải vào ứng dụng và chọn **Open** (ứng dụng chưa được ký). |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](../../apps/builds/windows/Bluebird-0.1.0-win-x64.zip) | Giải nén rồi chạy `Bluebird.exe`. Nếu SmartScreen xuất hiện, nhấp **More info → Run anyway**. |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](../../apps/builds/linux/Bluebird-0.1.0-linux-x64.tar.gz) | Giải nén bằng `tar -xzf`, sau đó chạy `./bluebird` trong thư mục vừa giải nén. |

> **Lưu ý:** Hiện Bluebird mới được kiểm thử trên macOS. Bản dựng cho Windows và Linux đã có sẵn nhưng chưa được kiểm thử đầy đủ. Nếu gặp lỗi, vui lòng mở issue ở tab Issues.

Lần chạy đầu tiên, cửa sổ thiết lập sẽ tạo một cơ sở dữ liệu cục bộ riêng tư và đề nghị tải Ollama cùng một mô hình khởi đầu. Bạn không cần cài gì thủ công.

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>: các tác tử chuyên biệt làm việc song song trên cùng một nhiệm vụ.</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## Điều khiển máy tính gốc cho mọi ứng dụng trên máy của bạn

Gõ `@` để trỏ Bluebird tới bất kỳ ứng dụng nào đã cài. Nó đọc cửa sổ của ứng dụng và vận hành qua các thao tác trợ năng của chính hệ thống trên macOS, Windows và Linux, nên hoạt động cả với những ứng dụng không có tích hợp nào.

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="Điều khiển máy tính gốc cho mọi ứng dụng trên máy của bạn" width="100%">
</p>

---

## Nó làm được gì

| | |
| --- | --- |
| **Bất kỳ công cụ nào** | Hơn 12 công cụ: Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google hoặc bất kỳ API tùy chỉnh nào. Chuyển đổi từ một menu. |
| **Bộ nhớ lâu dài** | Nhớ bạn qua các cuộc trò chuyện, tìm kiếm toàn bộ lịch sử chat và cho bạn xem, xóa từng ký ức. |
| **Chủ động** | Chạy các tác vụ theo lịch (`daily 08:30`, `every 30m`, cron) và chủ động liên hệ bạn qua Telegram, Discord và Slack. |
| **Điều khiển máy tính** | Đọc và vận hành ứng dụng máy tính qua API trợ năng. Gõ `@` để trỏ tới một ứng dụng. |
| **Trình duyệt riêng** | Điều khiển một trình duyệt Chromium thật: mở, đọc, nhấp, nhập. `/research` tạo báo cáo có nguồn. |
| **Trợ lý lập trình** | Đọc, sửa và chạy mã, xem trước HTML và SVG trực tiếp, và mọi thay đổi đều có nút Hoàn tác. |
| **Bầy tác tử và kỹ năng** | `/swarm` chia một việc cho tối đa bốn tác tử. Kỹ năng tự cải thiện và có thể cài từ danh mục của Claude Code và Codex. |
| **Bạn luôn kiểm soát** | Luôn hỏi, Tự động hoặc Toàn quyền. API chỉ lắng nghe trên loopback và khóa của bạn không bao giờ rời khỏi máy. |
| **Máy chủ công cụ (MCP)** | Kết nối bất kỳ máy chủ MCP nào và công cụ của nó sẽ xuất hiện trong cuộc trò chuyện. |
| **Hình ảnh tương tác** | Trả lời bằng thanh trượt, biểu đồ, cảnh 3D, sơ đồ và ứng dụng nhỏ trực tiếp thay vì những khối văn bản dài. |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>Bất kỳ công cụ nào</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>Bộ nhớ lâu dài</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>Chủ động</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>Trình duyệt riêng</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>Trợ lý lập trình</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>Bầy tác tử và kỹ năng</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>Bạn luôn kiểm soát</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>Máy chủ công cụ (MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>Hình ảnh tương tác</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>Hình ảnh tương tác</b></sub></td>
</tr>
</table>

---

## Công cụ được hỗ trợ

Công cụ cục bộ được tự động phát hiện. Công cụ trên đám mây cần khóa do bạn tự thêm.

| Cục bộ | Trên đám mây | Tùy chỉnh |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## Cách hoạt động

Mọi thứ chạy trên máy của bạn. Cuộc trò chuyện, bộ nhớ và tệp đính kèm nằm trong cơ sở dữ liệu PostgreSQL cục bộ riêng tư. Các công cụ lưu trữ trên đám mây chỉ được dùng khi bạn tự thêm khóa.

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## Chạy từ mã nguồn

Cần Node 22+, pnpm, PostgreSQL 17 và [Ollama](https://ollama.com). Hoặc chạy `bash scripts/install.sh`. Sau đó mở <http://localhost:3000>.

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [Tài liệu đầy đủ](../../docs/DOCUMENTATION.md)

---

## Ủng hộ dự án

Nếu Bluebird hữu ích với bạn, bạn có thể [mời tôi một ly cà phê](https://buymeacoffee.com/tudoriustin_) hoặc theo dõi tôi trên [X](https://x.com/tudoriustin_) và [Hugging Face](https://huggingface.co/tudor-iustin22).

## License

Được cấp phép theo Apache License 2.0. Tác giả: Tudor Iustin. See [LICENSE](../../LICENSE).
