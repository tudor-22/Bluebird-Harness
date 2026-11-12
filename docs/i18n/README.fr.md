<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <b>Français</b> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>Le seul harnais d'IA dont vous aurez besoin : transformez n'importe quel ordinateur en système d'IA autonome.</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness** est un système d'IA privé, pensé pour le local, avec plus de 12 moteurs de modèles, une mémoire persistante, une planification proactive, le contrôle de l'ordinateur, son propre navigateur et un assistant de code intégré. Il fonctionne sous macOS, Windows et Linux, sans compte, sans connexion et sans cloud Bluebird.

## Téléchargement

| Plateforme | Téléchargement | Installation |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-mac-arm64.dmg) | Ouvrez le `.dmg` et glissez **Bluebird** dans Applications. Au premier lancement, faites un clic droit sur l'app et choisissez **Ouvrir** (elle n'est pas encore signée). |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-win-x64.zip) | Décompressez puis lancez `Bluebird.exe`. Si SmartScreen s'affiche, cliquez sur **Informations complémentaires → Exécuter quand même**. |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-linux-x64.tar.gz) | Extrayez avec `tar -xzf`, puis lancez `./bluebird` depuis le dossier extrait. |

> **À noter :** Bluebird n'a été testé que sur macOS pour l'instant. Les versions Windows et Linux sont fournies mais ne sont pas encore entièrement testées. En cas de problème, ouvrez un ticket dans l'onglet Issues.

Au premier lancement, une fenêtre de configuration crée une base de données locale privée et propose de télécharger Ollama et un modèle de départ. Rien à installer à la main.

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code> : des agents spécialisés qui travaillent côte à côte sur une même tâche.</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## Contrôle natif de l'ordinateur pour n'importe quelle app

Tapez `@` pour désigner à Bluebird n'importe quelle app installée. Il lit la fenêtre de l'app et la pilote via les actions d'accessibilité propres à macOS, Windows et Linux, donc il fonctionne même avec des apps sans aucune intégration.

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="Contrôle natif de l'ordinateur pour n'importe quelle app" width="100%">
</p>

---

## Ce qu'il fait

| | |
| --- | --- |
| **N'importe quel moteur** | Plus de 12 moteurs : Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google ou toute API personnalisée. Changez depuis un seul menu. |
| **Mémoire persistante** | Se souvient de vous d'une conversation à l'autre, fouille tout votre historique et vous laisse voir et supprimer chaque souvenir. |
| **Proactif** | Exécute des tâches planifiées (`daily 08:30`, `every 30m`, cron) et vous contacte sur Telegram, Discord et Slack. |
| **Contrôle de l'ordinateur** | Lit et pilote les applications de bureau via leurs API d'accessibilité. Tapez `@` pour désigner une app. |
| **Son propre navigateur** | Pilote un vrai navigateur Chromium : ouvrir, lire, cliquer, saisir. `/research` produit un rapport avec sources. |
| **Assistant de code** | Lit, modifie et exécute du code, prévisualise HTML et SVG en direct, et chaque modification a un bouton Annuler. |
| **Essaim et skills** | `/swarm` répartit une tâche entre jusqu'à quatre agents. Les skills s'améliorent seules et s'installent depuis les catalogues Claude Code et Codex. |
| **Vous gardez la main** | Toujours demander, Auto ou Accès total. L'API n'écoute que sur la boucle locale et vos clés ne quittent jamais votre ordinateur. |
| **Serveurs d'outils (MCP)** | Branchez n'importe quel serveur MCP et ses outils apparaissent dans la conversation. |
| **Visuels interactifs** | Répond avec des curseurs, des graphiques, des scènes 3D, des schémas et des mini-apps en direct plutôt que des pavés de texte. |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>N'importe quel moteur</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>Mémoire persistante</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>Proactif</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>Son propre navigateur</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>Assistant de code</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>Essaim et skills</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>Vous gardez la main</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>Serveurs d'outils (MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>Visuels interactifs</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>Visuels interactifs</b></sub></td>
</tr>
</table>

---

## Moteurs pris en charge

Les moteurs locaux sont détectés automatiquement. Les moteurs hébergés nécessitent une clé que vous ajoutez vous-même.

| Locaux | Hébergés | Personnalisé |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## Comment ça marche

Tout s'exécute sur votre ordinateur. Les conversations, la mémoire et les pièces jointes sont stockées dans une base PostgreSQL locale privée. Les moteurs hébergés ne sont utilisés que si vous ajoutez votre propre clé.

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## Lancer depuis les sources

Nécessite Node 22+, pnpm, PostgreSQL 17 et [Ollama](https://ollama.com). Ou lancez `bash scripts/install.sh`. Ouvrez ensuite <http://localhost:3000>.

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [Documentation complète](../../docs/DOCUMENTATION.md)

---

## Soutenir le projet

Si Bluebird vous est utile, vous pouvez [m'offrir un café](https://buymeacoffee.com/tudoriustin_) ou me suivre sur [X](https://x.com/tudoriustin_) et [Hugging Face](https://huggingface.co/tudor-iustin22).

## License

Sous licence Apache License 2.0. Créé par Tudor Iustin. See [LICENSE](../../LICENSE).
