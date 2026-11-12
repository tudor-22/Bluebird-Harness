<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <b>ไทย</b> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>AI harness ตัวเดียวที่คุณต้องการ: เปลี่ยนคอมพิวเตอร์เครื่องไหนก็ได้ให้เป็นระบบ AI อัตโนมัติ</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** คือระบบ AI ส่วนตัวที่ทำงานบนเครื่องเป็นหลัก รองรับเอนจินโมเดลกว่า 12 ตัว มีหน่วยความจำถาวร ตั้งเวลาทำงานเชิงรุก ควบคุมคอมพิวเตอร์ มีเบราว์เซอร์ของตัวเอง และมีผู้ช่วยเขียนโค้ดในตัว ใช้งานได้บน macOS, Windows และ Linux โดยไม่ต้องมีบัญชี ไม่ต้องล็อกอิน และไม่มีคลาวด์ของ Bluebird

## ดาวน์โหลด

| แพลตฟอร์ม | ดาวน์โหลด | วิธีติดตั้ง |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-mac-arm64.dmg) | เปิดไฟล์ `.dmg` แล้วลาก **Bluebird** ไปที่ Applications เมื่อเปิดครั้งแรก ให้คลิกขวาที่แอปแล้วเลือก **Open** (ยังไม่ได้ลงนามแอป) |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-win-x64.zip) | แตกไฟล์ zip แล้วรัน `Bluebird.exe` หากมี SmartScreen ขึ้นมา ให้คลิก **More info → Run anyway** |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-linux-x64.tar.gz) | แตกไฟล์ด้วย `tar -xzf` แล้วรัน `./bluebird` จากโฟลเดอร์ที่แตกออกมา |

> **โปรดทราบ:** ขณะนี้ Bluebird ผ่านการทดสอบบน macOS เท่านั้น มีไฟล์สำหรับ Windows และ Linux ให้ใช้ แต่ยังไม่ได้ทดสอบครบถ้วน หากพบปัญหา โปรดเปิด issue ที่แท็บ Issues

เมื่อเปิดครั้งแรก หน้าต่างตั้งค่าจะสร้างฐานข้อมูลส่วนตัวบนเครื่อง และเสนอให้ดาวน์โหลด Ollama กับโมเดลเริ่มต้น ไม่ต้องติดตั้งอะไรเอง

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>: เอเจนต์เฉพาะทางทำงานเคียงข้างกันเพื่องานเดียว</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## ควบคุมคอมพิวเตอร์แบบเนทีฟสำหรับทุกแอปในเครื่องของคุณ

พิมพ์ `@` เพื่อชี้ Bluebird ไปที่แอปที่ติดตั้งไว้ตัวไหนก็ได้ ระบบจะอ่านหน้าต่างของแอปและควบคุมผ่านการทำงานด้านการช่วยการเข้าถึงของระบบเองบน macOS, Windows และ Linux จึงใช้ได้แม้กับแอปที่ไม่มีการเชื่อมต่อใด ๆ

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="ควบคุมคอมพิวเตอร์แบบเนทีฟสำหรับทุกแอปในเครื่องของคุณ" width="100%">
</p>

---

## ทำอะไรได้บ้าง

| | |
| --- | --- |
| **เอนจินอะไรก็ได้** | รองรับกว่า 12 เอนจิน: Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google หรือ API แบบกำหนดเอง สลับได้จากเมนูเดียว |
| **หน่วยความจำถาวร** | จำคุณได้ข้ามการสนทนา ค้นหาประวัติแชตทั้งหมด และให้คุณดูและลบความทรงจำแต่ละรายการได้ |
| **ทำงานเชิงรุก** | รันงานที่ตั้งเวลาไว้ (`daily 08:30`, `every 30m`, cron) และติดต่อคุณผ่าน Telegram, Discord และ Slack |
| **ควบคุมคอมพิวเตอร์** | อ่านและควบคุมแอปบนเดสก์ท็อปผ่าน API การช่วยการเข้าถึง พิมพ์ `@` เพื่อชี้ไปที่แอป |
| **เบราว์เซอร์ของตัวเอง** | ควบคุมเบราว์เซอร์ Chromium จริง: เปิด อ่าน คลิก พิมพ์ `/research` สร้างรายงานพร้อมแหล่งอ้างอิง |
| **ผู้ช่วยเขียนโค้ด** | อ่าน แก้ไข และรันโค้ด แสดงตัวอย่าง HTML และ SVG แบบสด และทุกการเปลี่ยนแปลงมีปุ่มเลิกทำ |
| **ฝูงเอเจนต์และสกิล** | `/swarm` แบ่งงานให้เอเจนต์ได้สูงสุดสี่ตัว สกิลพัฒนาตัวเองได้ และติดตั้งจากแคตตาล็อกของ Claude Code และ Codex |
| **คุณควบคุมได้เสมอ** | เลือกได้ระหว่างถามทุกครั้ง อัตโนมัติ หรือเข้าถึงเต็มรูปแบบ API รับการเชื่อมต่อเฉพาะ loopback และคีย์ของคุณไม่เคยออกจากคอมพิวเตอร์ |
| **เซิร์ฟเวอร์เครื่องมือ (MCP)** | เชื่อมต่อเซิร์ฟเวอร์ MCP ใดก็ได้ แล้วเครื่องมือของมันจะปรากฏในแชต |
| **ภาพแบบโต้ตอบ** | ตอบด้วยแถบเลื่อน แผนภูมิ ฉาก 3 มิติ แผนภาพ และมินิแอปแบบสด แทนข้อความยาวเหยียด |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>เอนจินอะไรก็ได้</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>หน่วยความจำถาวร</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>ทำงานเชิงรุก</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>เบราว์เซอร์ของตัวเอง</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>ผู้ช่วยเขียนโค้ด</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>ฝูงเอเจนต์และสกิล</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>คุณควบคุมได้เสมอ</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>เซิร์ฟเวอร์เครื่องมือ (MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>ภาพแบบโต้ตอบ</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>ภาพแบบโต้ตอบ</b></sub></td>
</tr>
</table>

---

## เอนจินที่รองรับ

เอนจินในเครื่องจะถูกตรวจพบอัตโนมัติ เอนจินแบบโฮสต์ต้องใช้คีย์ที่คุณเพิ่มเอง

| ในเครื่อง | โฮสต์ | กำหนดเอง |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## ทำงานอย่างไร

ทุกอย่างทำงานบนคอมพิวเตอร์ของคุณ การสนทนา หน่วยความจำ และไฟล์แนบเก็บไว้ในฐานข้อมูล PostgreSQL ส่วนตัวบนเครื่อง เอนจินแบบโฮสต์จะถูกใช้ก็ต่อเมื่อคุณเพิ่มคีย์ของคุณเอง

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## รันจากซอร์สโค้ด

ต้องใช้ Node 22+, pnpm, PostgreSQL 17 และ [Ollama](https://ollama.com) หรือรัน `bash scripts/install.sh` จากนั้นเปิด <http://localhost:3000>

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [เอกสารฉบับเต็ม](../../docs/DOCUMENTATION.md)

---

## สนับสนุนโปรเจกต์

ถ้า Bluebird มีประโยชน์กับคุณ คุณสามารถ[เลี้ยงกาแฟผม](https://buymeacoffee.com/tudoriustin_) หรือติดตามผมได้ที่ [X](https://x.com/tudoriustin_) และ [Hugging Face](https://huggingface.co/tudor-iustin22)

## License

เผยแพร่ภายใต้ Apache License 2.0 สร้างโดย Tudor Iustin See [LICENSE](../../LICENSE).
