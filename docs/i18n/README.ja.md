<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <b>日本語</b> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>必要なのはこれ一つ。どんなコンピューターも自律型 AI システムに変える AI ハーネス。</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** は、12 以上のモデルエンジン、永続メモリ、プロアクティブなスケジュール実行、コンピューター操作、独自ブラウザ、内蔵コードアシスタントを備えた、プライベートでローカルファーストな AI システムです。macOS、Windows、Linux で動作し、アカウントもサインインも Bluebird クラウドも不要です。

## ダウンロード

| プラットフォーム | ダウンロード | インストール方法 |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-mac-arm64.dmg) | `.dmg` を開いて **Bluebird** を「アプリケーション」にドラッグします。初回起動時はアプリを右クリックして **開く** を選んでください（まだ署名されていません）。 |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-win-x64.zip) | ZIP を展開して `Bluebird.exe` を実行します。SmartScreen が表示されたら **詳細情報 → 実行** をクリックしてください。 |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-linux-x64.tar.gz) | `tar -xzf` で展開し、展開したフォルダーで `./bluebird` を実行します。 |

> **ご注意：** 現時点では macOS でのみテスト済みです。Windows 版と Linux 版も提供していますが、まだ十分にテストされていません。問題があれば Issues タブから報告してください。

初回起動時にセットアップ画面が表示され、プライベートなローカルデータベースを作成し、Ollama と入門用モデルのダウンロードを提案します。手動でインストールするものはありません。

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>：専門化したエージェントが並んで一つの作業をこなします。</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## コンピューター上のあらゆるアプリに対応するネイティブ操作

`@` を入力して、インストール済みのアプリを Bluebird に指定します。アプリのウィンドウを読み取り、macOS、Windows、Linux 標準のアクセシビリティ操作で動かすため、連携機能のないアプリでも使えます。

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="コンピューター上のあらゆるアプリに対応するネイティブ操作" width="100%">
</p>

---

## できること

| | |
| --- | --- |
| **どんなエンジンでも** | 12 以上のエンジン：Ollama、llama.cpp、vLLM、LM Studio、Strata Engine、OpenAI、Anthropic、DeepSeek、Qwen、Mistral、Google、または任意のカスタム API。メニューひとつで切り替えられます。 |
| **永続メモリ** | 会話をまたいであなたを覚え、チャット履歴全体を検索でき、すべての記憶を確認・削除できます。 |
| **プロアクティブ** | スケジュールタスク（`daily 08:30`、`every 30m`、cron）を実行し、Telegram、Discord、Slack で知らせてくれます。 |
| **コンピューター操作** | アクセシビリティ API を通じてデスクトップアプリを読み取り、操作します。`@` を入力してアプリを指定できます。 |
| **独自ブラウザ** | 本物の Chromium ブラウザを操作します：開く、読む、クリック、入力。`/research` は出典付きのレポートを作ります。 |
| **コードアシスタント** | コードの読み取り、編集、実行を行い、HTML と SVG をライブでプレビューします。変更ごとに元に戻すボタンがあります。 |
| **スウォームとスキル** | `/swarm` は作業を最大 4 つのエージェントに分担させます。スキルは自己改善し、Claude Code と Codex のカタログからインストールできます。 |
| **主導権はあなたに** | 常に確認、自動、フルアクセスから選べます。API はループバックのみで待ち受け、キーがコンピューターの外に出ることはありません。 |
| **ツールサーバー（MCP）** | 任意の MCP サーバーをつなげば、そのツールがチャットに表示されます。 |
| **インタラクティブなビジュアル** | 長文ではなく、スライダー、チャート、3D シーン、図解、ライブのミニアプリで答えます。 |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>どんなエンジンでも</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>永続メモリ</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>プロアクティブ</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>独自ブラウザ</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>コードアシスタント</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>スウォームとスキル</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>主導権はあなたに</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>ツールサーバー（MCP）</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>インタラクティブなビジュアル</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>インタラクティブなビジュアル</b></sub></td>
</tr>
</table>

---

## 対応エンジン

ローカルエンジンは自動検出されます。ホスト型エンジンには自分で追加するキーが必要です。

| ローカル | ホスト型 | カスタム |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## 仕組み

すべてがあなたのコンピューター上で動きます。会話、メモリ、添付ファイルはプライベートなローカル PostgreSQL データベースに保存されます。ホスト型エンジンは、自分のキーを追加した場合にのみ使われます。

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## ソースから実行

Node 22+、pnpm、PostgreSQL 17、[Ollama](https://ollama.com) が必要です。または `bash scripts/install.sh` を実行してください。その後 <http://localhost:3000> を開きます。

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [完全なドキュメント](../../docs/DOCUMENTATION.md)

---

## プロジェクトを応援する

Bluebird が役に立ったら、[コーヒーをおごってください](https://buymeacoffee.com/tudoriustin_)。[X](https://x.com/tudoriustin_) と [Hugging Face](https://huggingface.co/tudor-iustin22) のフォローもぜひ。

## License

Apache License 2.0 でライセンスされています。作者：Tudor Iustin。 See [LICENSE](../../LICENSE).
