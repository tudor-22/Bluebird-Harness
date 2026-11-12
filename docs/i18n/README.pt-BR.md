<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <b>Português (Brasil)</b> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>O único harness de IA de que você vai precisar: transforme qualquer computador em um sistema de IA autônomo.</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** é um sistema de IA privado e local em primeiro lugar, com mais de 12 motores de modelos, memória persistente, agendamento proativo, controle do computador, navegador próprio e assistente de código integrado. Roda no macOS, Windows e Linux, sem conta, sem login e sem nuvem do Bluebird.

## Download

| Plataforma | Download | Como instalar |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-mac-arm64.dmg) | Abra o `.dmg` e arraste o **Bluebird** para Aplicativos. Na primeira abertura, clique com o botão direito no app e escolha **Abrir** (ele ainda não está assinado). |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-win-x64.zip) | Descompacte e execute `Bluebird.exe`. Se o SmartScreen aparecer, clique em **Mais informações → Executar assim mesmo**. |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-linux-x64.tar.gz) | Extraia com `tar -xzf` e execute `./bluebird` na pasta extraída. |

> **Aviso:** até agora o Bluebird foi testado apenas no macOS. As versões para Windows e Linux estão disponíveis, mas ainda não foram totalmente testadas. Se algo der errado, abra uma issue na aba Issues.

Na primeira abertura, uma janela de configuração cria um banco de dados local privado e oferece baixar o Ollama e um modelo inicial. Você não precisa instalar nada manualmente.

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>: agentes especializados trabalhando lado a lado em uma mesma tarefa.</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## Controle nativo do computador para qualquer app

Digite `@` para apontar o Bluebird para qualquer app instalado. Ele lê a janela do app e a opera pelas ações de acessibilidade do próprio sistema no macOS, Windows e Linux, então funciona até com apps sem nenhuma integração.

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="Controle nativo do computador para qualquer app" width="100%">
</p>

---

## O que ele faz

| | |
| --- | --- |
| **Qualquer motor** | Mais de 12 motores: Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google ou qualquer API personalizada. Troque em um único menu. |
| **Memória persistente** | Lembra de você entre conversas, pesquisa todo o histórico do chat e deixa você ver e apagar cada memória. |
| **Proativo** | Executa tarefas agendadas (`daily 08:30`, `every 30m`, cron) e avisa você no Telegram, Discord e Slack. |
| **Controle do computador** | Lê e opera aplicativos de desktop pelas APIs de acessibilidade. Digite `@` para apontar um app. |
| **Navegador próprio** | Controla um navegador Chromium de verdade: abre, lê, clica, digita. `/research` gera um relatório com fontes. |
| **Assistente de código** | Lê, edita e executa código, mostra prévia ao vivo de HTML e SVG, e cada alteração tem um botão Desfazer. |
| **Enxame e skills** | `/swarm` divide uma tarefa entre até quatro agentes. As skills se aprimoram sozinhas e podem ser instaladas dos catálogos do Claude Code e do Codex. |
| **Você no controle** | Sempre perguntar, Auto ou Acesso total. A API escuta apenas em loopback e suas chaves nunca saem do seu computador. |
| **Servidores de ferramentas (MCP)** | Conecte qualquer servidor MCP e as ferramentas dele aparecem no chat. |
| **Visuais interativos** | Responde com controles deslizantes, gráficos, cenas 3D, diagramas e mini apps ao vivo em vez de paredes de texto. |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>Qualquer motor</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>Memória persistente</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>Proativo</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>Navegador próprio</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>Assistente de código</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>Enxame e skills</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>Você no controle</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>Servidores de ferramentas (MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>Visuais interativos</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>Visuais interativos</b></sub></td>
</tr>
</table>

---

## Motores compatíveis

Motores locais são detectados automaticamente. Motores hospedados precisam de uma chave que você mesmo adiciona.

| Locais | Hospedados | Personalizado |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## Como funciona

Tudo roda no seu computador. Conversas, memória e anexos ficam em um banco PostgreSQL local e privado. Motores hospedados só são usados se você adicionar sua própria chave.

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## Executar a partir do código-fonte

Requer Node 22+, pnpm, PostgreSQL 17 e [Ollama](https://ollama.com). Ou execute `bash scripts/install.sh`. Depois abra <http://localhost:3000>.

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [Documentação completa](../../docs/DOCUMENTATION.md)

---

## Apoie o projeto

Se o Bluebird for útil para você, pode [me pagar um café](https://buymeacoffee.com/tudoriustin_) ou me seguir no [X](https://x.com/tudoriustin_) e no [Hugging Face](https://huggingface.co/tudor-iustin22).

## License

Licenciado sob a Apache License 2.0. Criado por Tudor Iustin. See [LICENSE](../../LICENSE).
