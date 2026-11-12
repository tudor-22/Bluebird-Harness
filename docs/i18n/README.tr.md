<p align="center">
<a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.da.md">Dansk</a> | <a href="README.ja.md">日本語</a> | <a href="README.pl.md">Polski</a> | <a href="README.ru.md">Русский</a> | <a href="README.bs.md">Bosanski</a> | <a href="README.ar.md">العربية</a> | <a href="README.no.md">Norsk</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.th.md">ไทย</a> | <b>Türkçe</b> | <a href="README.uk.md">Українська</a> | <a href="README.bn.md">বাংলা</a> | <a href="README.el.md">Ελληνικά</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../assets/logo.png" alt="Bluebird Harness" width="120">
</p>

<h1 align="center">Bluebird Harness</h1>

<p align="center"><b>İhtiyacınız olacak tek yapay zekâ harness'i: herhangi bir bilgisayarı otonom bir yapay zekâ sistemine dönüştürün.</b></p>

<p align="center">
  <a href="https://buymeacoffee.com/tudoriustin_"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <a href="https://x.com/tudoriustin_"><img src="https://img.shields.io/badge/X-@tudoriustin__-000000?style=for-the-badge&logo=x&logoColor=white" alt="X"></a>
  <a href="https://huggingface.co/tudor-iustin22"><img src="https://img.shields.io/badge/Hugging%20Face-tudor--iustin22-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License: Apache 2.0"></a>
</p>

**Bluebird Harness**, 12'den fazla model motoru, kalıcı bellek, proaktif zamanlama, bilgisayar kontrolü, kendi tarayıcısı ve yerleşik kod asistanı olan, özel ve yerel öncelikli bir yapay zekâ sistemidir. macOS, Windows ve Linux üzerinde çalışır; hesap, oturum açma ve Bluebird bulutu gerektirmez.

## İndir

| Platform | İndir | Nasıl kurulur |
| --- | --- | --- |
| macOS (Apple Silicon) | [Bluebird-0.1.0-mac-arm64.dmg](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-mac-arm64.dmg) | `.dmg` dosyasını açın ve **Bluebird**'ü Uygulamalar'a sürükleyin. İlk açılışta uygulamaya sağ tıklayıp **Aç**'ı seçin (henüz imzalı değil). |
| Windows (x64) | [Bluebird-0.1.0-win-x64.zip](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-win-x64.zip) | Arşivi çıkarın ve `Bluebird.exe` dosyasını çalıştırın. SmartScreen görünürse **Daha fazla bilgi → Yine de çalıştır**'a tıklayın. |
| Linux (x64) | [Bluebird-0.1.0-linux-x64.tar.gz](https://github.com/tudor-22/Bluebird-Harness/releases/download/v0.1.0/Bluebird-0.1.0-linux-x64.tar.gz) | `tar -xzf` ile çıkarın, ardından çıkarılan klasörde `./bluebird` komutunu çalıştırın. |

> **Not:** Bluebird şimdiye kadar yalnızca macOS'ta test edildi. Windows ve Linux sürümleri sunuluyor ancak henüz tam olarak test edilmedi. Bir sorun çıkarsa lütfen Issues sekmesinden bildirin.

İlk açılışta bir kurulum penceresi özel bir yerel veritabanı oluşturur ve Ollama ile başlangıç modelini indirmeyi önerir. Elle kurmanız gereken bir şey yok.

<p align="center">
  <img src="../../assets/gifs/agent-swarm.gif" alt="Bluebird Harness" width="100%">
  <br><sub><code>/swarm</code>: uzmanlaşmış ajanlar tek bir iş üzerinde yan yana çalışır.</sub>
</p>

<p align="center">
  <a href="https://www.bluebirdllm.com"><img src="https://img.shields.io/badge/Explore%20Bluebird%20Harness%20%E2%86%92-0A5FC4?style=for-the-badge" alt="Explore Bluebird Harness"></a>
</p>

## Bilgisayarınızdaki her uygulama için yerel bilgisayar kontrolü

Bluebird'ü kurulu herhangi bir uygulamaya yönlendirmek için `@` yazın. Uygulamanın penceresini okur ve macOS, Windows ve Linux'un kendi erişilebilirlik eylemleriyle kullanır; bu yüzden hiçbir entegrasyonu olmayan uygulamalarla bile çalışır.

<p align="center">
  <img src="../../assets/gifs/native-computer-use.gif" alt="Bilgisayarınızdaki her uygulama için yerel bilgisayar kontrolü" width="100%">
</p>

---

## Neler yapar

| | |
| --- | --- |
| **Her motor** | 12'den fazla motor: Ollama, llama.cpp, vLLM, LM Studio, Strata Engine, OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google veya herhangi bir özel API. Tek menüden geçiş yapın. |
| **Kalıcı bellek** | Sizi konuşmalar arasında hatırlar, tüm sohbet geçmişinizde arama yapar ve her anıyı görüp silmenize izin verir. |
| **Proaktif** | Zamanlanmış görevleri (`daily 08:30`, `every 30m`, cron) çalıştırır ve size Telegram, Discord ve Slack üzerinden ulaşır. |
| **Bilgisayar kontrolü** | Masaüstü uygulamalarını erişilebilirlik API'leri üzerinden okur ve kullanır. Bir uygulamayı göstermek için `@` yazın. |
| **Kendi tarayıcısı** | Gerçek bir Chromium tarayıcısını yönetir: açar, okur, tıklar, yazar. `/research` kaynaklı bir rapor üretir. |
| **Kod asistanı** | Kodu okur, düzenler ve çalıştırır, HTML ile SVG'yi canlı önizler; her değişikliğin bir Geri al düğmesi vardır. |
| **Sürü ve beceriler** | `/swarm` bir işi en fazla dört ajana böler. Beceriler kendini geliştirir ve Claude Code ile Codex kataloglarından yüklenir. |
| **Kontrol sizde** | Her zaman sor, Otomatik veya Tam erişim. API yalnızca loopback üzerinde dinler ve anahtarlarınız bilgisayarınızdan hiç çıkmaz. |
| **Araç sunucuları (MCP)** | Herhangi bir MCP sunucusunu bağlayın, araçları sohbette görünsün. |
| **Etkileşimli görseller** | Metin duvarları yerine sürgüler, grafikler, 3B sahneler, diyagramlar ve canlı mini uygulamalarla yanıt verir. |

<table>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/engine-selection.gif" alt="" width="100%"><br><sub><b>Her motor</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/memory-data.gif" alt="" width="100%"><br><sub><b>Kalıcı bellek</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/schedule-tasks.gif" alt="" width="100%"><br><sub><b>Proaktif</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/deep-research.gif" alt="" width="100%"><br><sub><b>Kendi tarayıcısı</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/code-preview.gif" alt="" width="100%"><br><sub><b>Kod asistanı</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/skills-marketplace.gif" alt="" width="100%"><br><sub><b>Sürü ve beceriler</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/permission-mode.gif" alt="" width="100%"><br><sub><b>Kontrol sizde</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/mcp-server.gif" alt="" width="100%"><br><sub><b>Araç sunucuları (MCP)</b></sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="../../assets/gifs/intelligent-ui.gif" alt="" width="100%"><br><sub><b>Etkileşimli görseller</b></sub></td>
<td width="50%" align="center"><img src="../../assets/gifs/svg-diagrams.gif" alt="" width="100%"><br><sub><b>Etkileşimli görseller</b></sub></td>
</tr>
</table>

---

## Desteklenen motorlar

Yerel motorlar otomatik algılanır. Barındırılan motorlar için kendi eklediğiniz bir anahtar gerekir.

| Yerel | Barındırılan | Özel |
| --- | --- | --- |
| Ollama, llama.cpp, vLLM, LM Studio, Strata Engine | OpenAI, Anthropic, DeepSeek, Qwen, Mistral, Google | Chat Completions API |

## Nasıl çalışır

Her şey bilgisayarınızda çalışır. Konuşmalar, bellek ve ekler özel bir yerel PostgreSQL veritabanında tutulur. Barındırılan motorlar yalnızca kendi anahtarınızı eklerseniz kullanılır.

```text
Browser / Desktop -> Next.js web app (localhost:3000) -> Fastify API (127.0.0.1:4000)
                                                            |-> PostgreSQL (local)
                                                            |-> Ollama and other engines
```

## Kaynaktan çalıştırma

Node 22+, pnpm, PostgreSQL 17 ve [Ollama](https://ollama.com) gerekir. Ya da `bash scripts/install.sh` komutunu çalıştırın. Ardından <http://localhost:3000> adresini açın.

```bash
pnpm install && pnpm setup:keys && pnpm db:up && pnpm db:migrate
pnpm dev:api    # terminal 1
pnpm dev:web    # terminal 2
```

📖 [Tam dokümantasyon](../../docs/DOCUMENTATION.md)

---

## Projeyi destekleyin

Bluebird işinize yarıyorsa bana [bir kahve ısmarlayabilir](https://buymeacoffee.com/tudoriustin_) veya beni [X](https://x.com/tudoriustin_) ve [Hugging Face](https://huggingface.co/tudor-iustin22) üzerinden takip edebilirsiniz.

## License

Apache License 2.0 ile lisanslanmıştır. Geliştiren: Tudor Iustin. See [LICENSE](../../LICENSE).
