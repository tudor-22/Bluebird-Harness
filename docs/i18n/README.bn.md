<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <b>বাংলা</b> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>আপনার প্রয়োজন হবে এমন একমাত্র AI হার্নেস: যেকোনো কম্পিউটারকে স্বাধীনভাবে কাজ করা AI সিস্টেমে বদলে দিন।</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** একটি ব্যক্তিগত, লোকাল-ফার্স্ট AI সিস্টেম, যেখানে আছে ১২টিরও বেশি মডেল ইঞ্জিন, স্থায়ী মেমরি, সক্রিয় সময়সূচি, কম্পিউটার নিয়ন্ত্রণ, নিজস্ব ব্রাউজার এবং বিল্ট-ইন কোড সহকারী। এটি macOS, Windows ও Linux-এ চলে—কোনো অ্যাকাউন্ট, সাইন-ইন বা Bluebird ক্লাউড ছাড়াই।

## ডাউনলোড

| প্ল্যাটফর্ম | ডাউনলোড | ইনস্টল করার নিয়ম |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-mac-arm64.dmg) | `.dmg` খুলে **Bluebird**-কে Applications-এ টেনে আনুন। প্রথমবার চালানোর সময় অ্যাপে রাইট-ক্লিক করে **Open** বেছে নিন (অ্যাপটি এখনো সাইন করা নয়)। |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-win-x64.zip) | জিপ খুলে `Bluebird.exe` চালান। SmartScreen দেখা গেলে **More info → Run anyway** ক্লিক করুন। |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-linux-x64.tar.gz) | `tar -xzf` দিয়ে এক্সট্র্যাক্ট করুন, তারপর এক্সট্র্যাক্ট করা ফোল্ডার থেকে `./bluebird` চালান। |

> **লক্ষ্য করুন:** এখন পর্যন্ত Bluebird শুধু macOS-এ পরীক্ষা করা হয়েছে। Windows ও Linux বিল্ড দেওয়া আছে, তবে এখনো পুরোপুরি পরীক্ষা করা হয়নি। কিছু ঠিকমতো না চললে Issues ট্যাবে একটি issue খুলুন।

প্রথমবার চালু করলে একটি সেটআপ উইন্ডো ব্যক্তিগত লোকাল ডাটাবেস তৈরি করে এবং Ollama ও একটি শুরুর মডেল ডাউনলোড করার প্রস্তাব দেয়। হাতে কিছু ইনস্টল করতে হবে না।

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>: বিশেষায়িত এজেন্টরা পাশাপাশি একটি কাজে লেগে আছে।</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## আপনার কম্পিউটারের যেকোনো অ্যাপের জন্য নেটিভ কম্পিউটার নিয়ন্ত্রণ

ইনস্টল করা যেকোনো অ্যাপে Bluebird-কে নির্দেশ করতে `@` লিখুন। এটি অ্যাপের উইন্ডো পড়ে এবং macOS, Windows ও Linux-এর নিজস্ব অ্যাক্সেসিবিলিটি অ্যাকশনের মাধ্যমে চালায়, তাই কোনো ইন্টিগ্রেশন ছাড়া অ্যাপেও কাজ করে।

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="আপনার কম্পিউটারের যেকোনো অ্যাপের জন্য নেটিভ কম্পিউটার নিয়ন্ত্রণ" width="100%">
</p>

---

## যা যা করতে পারে

| | |
| --- | --- |
| **যেকোনো ইঞ্জিন** | ১২টিরও বেশি ইঞ্জিন: Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google, অথবা যেকোনো কাস্টম API। একটি মেনু থেকেই বদলান। |
| **স্থায়ী মেমরি** | কথোপকথনের পর কথোপকথনে আপনাকে মনে রাখে, পুরো চ্যাট ইতিহাসে খোঁজে, আর প্রতিটি স্মৃতি দেখা ও মুছে ফেলার সুযোগ দেয়। |
| **সক্রিয়** | নির্ধারিত কাজ (`daily 08:30`, `every 30m`, cron) চালায় এবং Telegram, Discord ও Slack-এ আপনার সঙ্গে যোগাযোগ করে। |
| **কম্পিউটার নিয়ন্ত্রণ** | অ্যাক্সেসিবিলিটি API-র মাধ্যমে ডেস্কটপ অ্যাপ পড়ে ও চালায়। কোনো অ্যাপ দেখাতে `@` লিখুন। |
| **নিজস্ব ব্রাউজার** | আসল Chromium ব্রাউজার চালায়: খোলা, পড়া, ক্লিক, টাইপ। `/research` সূত্রসহ একটি রিপোর্ট তৈরি করে। |
| **কোড সহকারী** | কোড পড়ে, সম্পাদনা করে ও চালায়, HTML ও SVG-র লাইভ প্রিভিউ দেখায়, আর প্রতিটি পরিবর্তনে আছে Undo বোতাম। |
| **সোয়ার্ম ও স্কিল** | `/swarm` একটি কাজকে সর্বোচ্চ চারজন এজেন্টের মধ্যে ভাগ করে। স্কিল নিজে নিজে উন্নত হয় এবং Claude Code ও Codex ক্যাটালগ থেকে ইনস্টল করা যায়। |
| **নিয়ন্ত্রণ আপনার হাতে** | সবসময় জিজ্ঞাসা, অটো বা পূর্ণ অ্যাক্সেস। API শুধু loopback-এ শোনে, আর আপনার কী কখনো কম্পিউটারের বাইরে যায় না। |
| **টুল সার্ভার (MCP)** | যেকোনো MCP সার্ভার যুক্ত করলে তার টুল চ্যাটে দেখা যায়। |
| **ইন্টারঅ্যাকটিভ ভিজ্যুয়াল** | লম্বা লেখার বদলে স্লাইডার, চার্ট, ৩ডি দৃশ্য, ডায়াগ্রাম ও লাইভ মিনি অ্যাপ দিয়ে উত্তর দেয়। |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>যেকোনো ইঞ্জিন</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>স্থায়ী মেমরি</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>সক্রিয়</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>নিজস্ব ব্রাউজার</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>কোড সহকারী</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>সোয়ার্ম ও স্কিল</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>নিয়ন্ত্রণ আপনার হাতে</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>টুল সার্ভার (MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>ইন্টারঅ্যাকটিভ ভিজ্যুয়াল</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>ইন্টারঅ্যাকটিভ ভিজ্যুয়াল</b></sub></td>
</tr>
</table>

---

## সমর্থিত ইঞ্জিন

লোকাল ইঞ্জিন স্বয়ংক্রিয়ভাবে শনাক্ত হয়। হোস্টেড ইঞ্জিনের জন্য আপনাকে নিজের কী যোগ করতে হয়।

| লোকাল | হোস্টেড | কাস্টম |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## যেভাবে কাজ করে

সবকিছু আপনার কম্পিউটারেই চলে। কথোপকথন, মেমরি ও সংযুক্তি থাকে একটি ব্যক্তিগত লোকাল PostgreSQL ডাটাবেসে। হোস্টেড ইঞ্জিন কেবল তখনই ব্যবহৃত হয় যখন আপনি নিজের কী যোগ করেন।

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## সোর্স থেকে চালান

Node 22+, pnpm, PostgreSQL 17 এবং [Ollama](https://ollama.com) লাগবে। অথবা `bash scripts/install.sh` চালান। তারপর <http://localhost:3000> খুলুন।

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [সম্পূর্ণ ডকুমেন্টেশন](../../docs/DOCUMENTATION.md)

---

## প্রজেক্টকে সমর্থন করুন

Bluebird আপনার কাজে লাগলে [আমাকে এক কাপ কফি কিনে দিতে পারেন](https://buymeacoffee.com/tudoriustin_), অথবা [X](https://x.com/tudoriustin_) ও [Hugging Face](https://huggingface.co/tudor-iustin22)-এ আমাকে অনুসরণ করতে পারেন।

## License

Apache License 2.0-এর অধীনে লাইসেন্সপ্রাপ্ত। নির্মাতা: Tudor Iustin। See [LICENSE](../../LICENSE).
