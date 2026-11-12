<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <b>한국어</b> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>당신에게 필요한 유일한 AI 하네스: 어떤 컴퓨터든 자율 AI 시스템으로 바꿔 줍니다.</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness**는 12개 이상의 모델 엔진, 영구 메모리, 선제적 일정 실행, 컴퓨터 제어, 자체 브라우저, 내장 코드 어시스턴트를 갖춘 프라이빗 로컬 우선 AI 시스템입니다. macOS, Windows, Linux에서 실행되며 계정도, 로그인도, Bluebird 클라우드도 없습니다.

## 다운로드

| 플랫폼 | 다운로드 | 설치 방법 |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](../../apps/builds/macos/Bluebird-0.1.0-mac-arm64.dmg) | `.dmg`를 열고 **Bluebird**를 응용 프로그램으로 드래그하세요. 처음 실행할 때는 앱을 우클릭하고 **열기**를 선택하세요(아직 서명되지 않았습니다). |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](../../apps/builds/windows/Bluebird-0.1.0-win-x64.zip) | 압축을 풀고 `Bluebird.exe`를 실행하세요. SmartScreen이 나타나면 **추가 정보 → 실행**을 클릭하세요. |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](../../apps/builds/linux/Bluebird-0.1.0-linux-x64.tar.gz) | `tar -xzf`로 압축을 풀고, 풀린 폴더에서 `./bluebird`를 실행하세요. |

> **참고:** 현재까지 macOS에서만 테스트되었습니다. Windows와 Linux 빌드는 제공되지만 아직 충분히 테스트되지 않았습니다. 문제가 있으면 Issues 탭에 등록해 주세요.

처음 실행하면 설정 창이 비공개 로컬 데이터베이스를 만들고 Ollama와 기본 모델 다운로드를 안내합니다. 직접 설치할 것은 없습니다.

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>: 전문화된 에이전트들이 하나의 작업을 나란히 처리합니다.</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## 컴퓨터의 모든 앱을 위한 네이티브 컴퓨터 제어

`@`를 입력해 설치된 어떤 앱이든 Bluebird에게 가리키세요. 앱 창을 읽고 macOS, Windows, Linux의 자체 접근성 동작으로 조작하므로, 별도 연동이 전혀 없는 앱에서도 작동합니다.

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="컴퓨터의 모든 앱을 위한 네이티브 컴퓨터 제어" width="100%">
</p>

---

## 주요 기능

| | |
| --- | --- |
| **모든 엔진** | 12개 이상의 엔진: Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google, 또는 모든 커스텀 API. 메뉴 하나로 전환합니다. |
| **영구 메모리** | 대화가 바뀌어도 당신을 기억하고, 전체 채팅 기록을 검색하며, 모든 메모리를 확인하고 삭제할 수 있습니다. |
| **선제적 실행** | 예약 작업(`daily 08:30`, `every 30m`, cron)을 실행하고 Telegram, Discord, Slack으로 먼저 알려 줍니다. |
| **컴퓨터 제어** | 접근성 API로 데스크톱 앱을 읽고 조작합니다. `@`를 입력해 앱을 지정하세요. |
| **자체 브라우저** | 실제 Chromium 브라우저를 구동합니다: 열기, 읽기, 클릭, 입력. `/research`는 출처가 달린 보고서를 만듭니다. |
| **코드 어시스턴트** | 코드를 읽고, 수정하고, 실행하며 HTML과 SVG를 실시간 미리 봅니다. 모든 변경에는 실행 취소 버튼이 있습니다. |
| **스웜과 스킬** | `/swarm`은 작업을 최대 네 개의 에이전트에게 나눕니다. 스킬은 스스로 개선되며 Claude Code와 Codex 카탈로그에서 설치할 수 있습니다. |
| **통제는 항상 당신 몫** | 항상 묻기, 자동, 전체 권한 중에서 선택합니다. API는 루프백에서만 수신하며 키는 컴퓨터 밖으로 나가지 않습니다. |
| **도구 서버(MCP)** | MCP 서버를 연결하면 그 도구가 채팅에 나타납니다. |
| **인터랙티브 시각화** | 긴 글 대신 슬라이더, 차트, 3D 장면, 다이어그램, 라이브 미니 앱으로 답합니다. |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>모든 엔진</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>영구 메모리</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>선제적 실행</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>자체 브라우저</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>코드 어시스턴트</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>스웜과 스킬</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>통제는 항상 당신 몫</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>도구 서버(MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>인터랙티브 시각화</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>인터랙티브 시각화</b></sub></td>
</tr>
</table>

---

## 지원 엔진

로컬 엔진은 자동으로 감지됩니다. 호스팅 엔진은 직접 추가한 키가 필요합니다.

| 로컬 | 호스팅 | 커스텀 |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## 작동 방식

모든 것이 당신의 컴퓨터에서 실행됩니다. 대화, 메모리, 첨부 파일은 비공개 로컬 PostgreSQL 데이터베이스에 저장됩니다. 호스팅 엔진은 직접 키를 추가한 경우에만 사용됩니다.

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## 소스에서 실행

Node 22+, pnpm, PostgreSQL 17, [Ollama](https://ollama.com)가 필요합니다. 또는 `bash scripts/install.sh`를 실행하세요. 그런 다음 <http://localhost:3000>을 여세요.

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [전체 문서](../../docs/DOCUMENTATION.md)

---

## 프로젝트 후원

Bluebird가 도움이 되었다면 [커피 한 잔 사 주세요](https://buymeacoffee.com/tudoriustin_). [X](https://x.com/tudoriustin_)와 [Hugging Face](https://huggingface.co/tudor-iustin22)도 팔로우해 주세요.

## License

Apache License 2.0으로 배포됩니다. 제작: Tudor Iustin. See [LICENSE](../../LICENSE).
