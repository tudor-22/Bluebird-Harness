<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <b>Ελληνικά</b> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>Το μόνο AI harness που θα χρειαστείτε ποτέ: μετατρέψτε οποιονδήποτε υπολογιστή σε αυτόνομο σύστημα AI.</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

Το **Bluebird Harness** είναι ένα ιδιωτικό σύστημα AI με προτεραιότητα στο τοπικό περιβάλλον, με πάνω από 12 μηχανές μοντέλων, μόνιμη μνήμη, προληπτικό προγραμματισμό, έλεγχο του υπολογιστή, δικό του πρόγραμμα περιήγησης και ενσωματωμένο βοηθό κώδικα. Τρέχει σε macOS, Windows και Linux, χωρίς λογαριασμό, χωρίς σύνδεση και χωρίς cloud του Bluebird.

## Λήψη

| Πλατφόρμα | Λήψη | Πώς να εγκαταστήσετε |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](../../apps/builds/macos/Bluebird-0.1.0-mac-arm64.dmg) | Ανοίξτε το `.dmg` και σύρετε το **Bluebird** στις Εφαρμογές. Στην πρώτη εκκίνηση, κάντε δεξί κλικ στην εφαρμογή και επιλέξτε **Άνοιγμα** (δεν είναι ακόμη υπογεγραμμένη). |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](../../apps/builds/windows/Bluebird-0.1.0-win-x64.zip) | Αποσυμπιέστε και εκτελέστε το `Bluebird.exe`. Αν εμφανιστεί το SmartScreen, πατήστε **Περισσότερες πληροφορίες → Εκτέλεση ούτως ή άλλως**. |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](../../apps/builds/linux/Bluebird-0.1.0-linux-x64.tar.gz) | Αποσυμπιέστε με `tar -xzf` και εκτελέστε `./bluebird` από τον φάκελο που προέκυψε. |

> **Σημείωση:** Μέχρι στιγμής το Bluebird έχει δοκιμαστεί μόνο σε macOS. Οι εκδόσεις για Windows και Linux παρέχονται αλλά δεν έχουν δοκιμαστεί πλήρως. Αν κάτι δεν λειτουργεί, ανοίξτε ένα issue στην καρτέλα Issues.

Στην πρώτη εκκίνηση, ένα παράθυρο ρύθμισης δημιουργεί μια ιδιωτική τοπική βάση δεδομένων και προτείνει τη λήψη του Ollama και ενός αρχικού μοντέλου. Δεν χρειάζεται να εγκαταστήσετε τίποτα χειροκίνητα.

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>: εξειδικευμένοι πράκτορες δουλεύουν δίπλα-δίπλα σε μία εργασία.</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## Εγγενής έλεγχος υπολογιστή για κάθε εφαρμογή

Πληκτρολογήστε `@` για να δείξετε στο Bluebird οποιαδήποτε εγκατεστημένη εφαρμογή. Διαβάζει το παράθυρό της και τη χειρίζεται μέσω των ενεργειών προσβασιμότητας του ίδιου του συστήματος σε macOS, Windows και Linux, οπότε λειτουργεί ακόμη και με εφαρμογές χωρίς καμία ενσωμάτωση.

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="Εγγενής έλεγχος υπολογιστή για κάθε εφαρμογή" width="100%">
</p>

---

## Τι κάνει

| | |
| --- | --- |
| **Οποιαδήποτε μηχανή** | Πάνω από 12 μηχανές: Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google ή οποιοδήποτε προσαρμοσμένο API. Αλλάξτε από ένα μενού. |
| **Μόνιμη μνήμη** | Σας θυμάται μεταξύ συνομιλιών, αναζητά σε όλο το ιστορικό συνομιλιών και σας αφήνει να βλέπετε και να διαγράφετε κάθε ανάμνηση. |
| **Προληπτικό** | Εκτελεί προγραμματισμένες εργασίες (`daily 08:30`, `every 30m`, cron) και επικοινωνεί μαζί σας στο Telegram, το Discord και το Slack. |
| **Έλεγχος υπολογιστή** | Διαβάζει και χειρίζεται εφαρμογές επιφάνειας εργασίας μέσω των API προσβασιμότητας. Πληκτρολογήστε `@` για να δείξετε μια εφαρμογή. |
| **Δικό του πρόγραμμα περιήγησης** | Οδηγεί ένα πραγματικό πρόγραμμα περιήγησης Chromium: ανοίγει, διαβάζει, κάνει κλικ, πληκτρολογεί. Το `/research` παράγει αναφορά με πηγές. |
| **Βοηθός κώδικα** | Διαβάζει, επεξεργάζεται και εκτελεί κώδικα, δείχνει ζωντανή προεπισκόπηση HTML και SVG, και κάθε αλλαγή έχει κουμπί Αναίρεσης. |
| **Σμήνος και δεξιότητες** | Το `/swarm` μοιράζει μια εργασία σε έως τέσσερις πράκτορες. Οι δεξιότητες βελτιώνονται μόνες τους και εγκαθίστανται από καταλόγους του Claude Code και του Codex. |
| **Ο έλεγχος είναι δικός σας** | Να ρωτάει πάντα, Αυτόματο ή Πλήρης πρόσβαση. Το API ακούει μόνο στο loopback και τα κλειδιά σας δεν φεύγουν ποτέ από τον υπολογιστή σας. |
| **Διακομιστές εργαλείων (MCP)** | Συνδέστε οποιονδήποτε διακομιστή MCP και τα εργαλεία του εμφανίζονται στη συνομιλία. |
| **Διαδραστικά γραφικά** | Απαντά με ρυθμιστικά, γραφήματα, τρισδιάστατες σκηνές, διαγράμματα και ζωντανές μίνι εφαρμογές αντί για τοίχους κειμένου. |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>Οποιαδήποτε μηχανή</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>Μόνιμη μνήμη</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>Προληπτικό</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>Δικό του πρόγραμμα περιήγησης</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>Βοηθός κώδικα</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>Σμήνος και δεξιότητες</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>Ο έλεγχος είναι δικός σας</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>Διακομιστές εργαλείων (MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>Διαδραστικά γραφικά</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>Διαδραστικά γραφικά</b></sub></td>
</tr>
</table>

---

## Υποστηριζόμενες μηχανές

Οι τοπικές μηχανές εντοπίζονται αυτόματα. Οι φιλοξενούμενες μηχανές χρειάζονται κλειδί που προσθέτετε εσείς.

| Τοπικές | Φιλοξενούμενες | Προσαρμοσμένο |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## Πώς λειτουργεί

Όλα τρέχουν στον υπολογιστή σας. Οι συνομιλίες, η μνήμη και τα συνημμένα αποθηκεύονται σε ιδιωτική τοπική βάση PostgreSQL. Οι φιλοξενούμενες μηχανές χρησιμοποιούνται μόνο αν προσθέσετε δικό σας κλειδί.

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## Εκτέλεση από τον πηγαίο κώδικα

Απαιτούνται Node 22+, pnpm, PostgreSQL 17 και [Ollama](https://ollama.com). Ή εκτελέστε `bash scripts/install.sh`. Έπειτα ανοίξτε το <http://localhost:3000>.

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [Πλήρης τεκμηρίωση](../../docs/DOCUMENTATION.md)

---

## Υποστηρίξτε το έργο

Αν το Bluebird σας φανεί χρήσιμο, μπορείτε να με [κεράσετε έναν καφέ](https://buymeacoffee.com/tudoriustin_) ή να με ακολουθήσετε στο [X](https://x.com/tudoriustin_) και στο [Hugging Face](https://huggingface.co/tudor-iustin22).

## License

Με άδεια Apache License 2.0. Δημιουργήθηκε από τον Tudor Iustin. See [LICENSE](../../LICENSE).
