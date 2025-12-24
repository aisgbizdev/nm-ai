import OpenAI from "openai";
import { storage } from "./storage";
import * as fs from "fs";
import * as path from "path";
import { handleCalculation } from "./calculators";
import { fetchNews, formatNewsForChat, isNewsRequest as checkNewsIntent } from "./newsFetcher";

const openaiClient = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "deepseek-r1:1.5b";
const OLLAMA_TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT_MS || "7000");
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

const KNOWLEDGE_CORE_PATH = path.join(process.cwd(), "knowledge", "core");

function isGibberishResponse(text: string): boolean {
  if (!text || text.length < 20) return true;
  
  const words = text.split(/\s+/);
  if (words.length < 3) return true;
  
  const meaningfulWords = words.filter(w => w.length >= 2);
  if (meaningfulWords.length < words.length * 0.5) return true;
  
  const indonesianWords = ['dan', 'atau', 'yang', 'untuk', 'dari', 'dengan', 'ini', 'itu', 'adalah', 'dalam', 'pada', 'ke', 'di', 'tersebut', 'akan', 'jika', 'bisa', 'dapat', 'ada', 'tidak', 'harga', 'trading', 'market', 'analisa'];
  const hasIndonesian = indonesianWords.some(w => text.toLowerCase().includes(w));
  
  const repeatingPattern = /(.{3,})\1{3,}/i;
  if (repeatingPattern.test(text)) return true;
  
  const weirdChars = text.match(/[^\w\s.,!?():\-\[\]@#$%&*+='"<>/\\;`~|{}àáâãäåæçèéêëìíîïðñòóôõöùúûüýÿ]/g);
  if (weirdChars && weirdChars.length > text.length * 0.1) return true;
  
  if (!hasIndonesian && !text.includes(' ')) return true;
  
  return false;
}

function isNewsRequest(query: string): boolean {
  const queryLower = query.toLowerCase();
  
  const exclusionKeywords = ['banding', 'compare', 'versus', 'vs', 'perbedaan', 'difference', 'kelebihan', 'kekurangan', 'pros', 'cons', 'mana yang', 'which is'];
  if (exclusionKeywords.some(k => queryLower.includes(k))) {
    return false;
  }
  
  const newsPatterns = [
    /berita/i,
    /news/i,
    /kabar/i,
    /update.*pasar/i,
    /update.*market/i,
    /apa.*terjadi/i,
    /what.*happening/i,
    /headline/i,
    /terbaru/i,
    /latest/i,
    /info.*hari ini/i,
    /situasi.*pasar/i,
    /kondisi.*pasar/i,
  ];
  
  return newsPatterns.some(p => p.test(queryLower)) || checkNewsIntent(query);
}

function detectLanguage(query: string): 'id' | 'en' {
  const indonesianWords = ['apa', 'bagaimana', 'berapa', 'kenapa', 'mengapa', 'dimana', 'kapan', 'siapa', 'tolong', 'minta', 'bisa', 'cara', 'gimana', 'dong', 'donk', 'bro', 'kak', 'mas', 'mba', 'gak', 'tidak', 'iya', 'ya', 'dan', 'atau', 'untuk', 'dari', 'dengan'];
  const queryLower = query.toLowerCase();
  const hasIndonesian = indonesianWords.some(w => queryLower.includes(w));
  return hasIndonesian ? 'id' : 'en';
}

function getNewsResponse(lang: 'id' | 'en'): string {
  if (lang === 'en') {
    return `## Latest News from Newsmaker.id

To get the latest trading news from Newsmaker.id, please visit directly:

**Official Website:**
[newsmaker.id](https://newsmaker.id)

**Real-time Updates via Social Media:**
- TikTok Live: [@newsmaker23_talk](https://tiktok.com/@newsmaker23_talk) - Morning Call every morning
- TikTok Education: [@newsmaker23](https://tiktok.com/@newsmaker23) - Daily educational content

**Mobile Apps:**
- **Newsmaker23 App** - News & analysis on your phone
- **Pro Trader App** - Real-time quotes + signal alerts

The Newsmaker.id editorial team updates news every trading day with in-depth and accurate analysis.

---
*NM Ai - Newsmaker.id*
*This information is educational, not investment advice.*`;
  }
  
  return `## Berita Terbaru Newsmaker.id

Untuk mendapatkan berita trading terbaru dari Newsmaker.id, silakan kunjungi langsung:

**Website Resmi:**
[newsmaker.id](https://newsmaker.id)

**Update Real-time via Sosial Media:**
- TikTok Live: [@newsmaker23_talk](https://tiktok.com/@newsmaker23_talk) - Morning Call setiap pagi
- TikTok Edukasi: [@newsmaker23](https://tiktok.com/@newsmaker23) - Konten edukatif harian

**Aplikasi Mobile:**
- **Newsmaker23 App** - Berita & analisa langsung di HP
- **Pro Trader App** - Quotes real-time + signal alerts

Tim editorial Newsmaker.id update berita setiap hari perdagangan dengan analisa yang mendalam dan akurat.

---
*NM Ai - Newsmaker.id*
*Informasi bersifat edukatif, bukan saran investasi.*`;
}

export interface AIResponse {
  content: string;
  source: "calculator" | "knowledge" | "learned" | "ollama" | "openai" | "news" | "vision";
  cached?: boolean;
}

let cachedCoreKnowledge: string | null = null;
let coreKnowledgeLoadTime = 0;
const KNOWLEDGE_CACHE_TTL = 300000;

export async function loadCoreKnowledge(): Promise<string> {
  const now = Date.now();
  if (cachedCoreKnowledge && now - coreKnowledgeLoadTime < KNOWLEDGE_CACHE_TTL) {
    return cachedCoreKnowledge;
  }
  
  try {
    const files = fs.readdirSync(KNOWLEDGE_CORE_PATH).sort();
    let combined = "";
    
    for (const file of files) {
      if (file.endsWith(".md") || file.endsWith(".yaml") || file.endsWith(".txt")) {
        const content = fs.readFileSync(path.join(KNOWLEDGE_CORE_PATH, file), "utf-8");
        combined += `\n\n--- ${file} ---\n${content}`;
      }
    }
    
    cachedCoreKnowledge = combined;
    coreKnowledgeLoadTime = now;
    return combined;
  } catch (err) {
    console.error("Failed to load core knowledge:", err);
    return "";
  }
}

export function buildSystemPrompt(coreKnowledge: string, contextSnippet?: string): string {
  let prompt = `# IDENTITAS NM Ai (Gwen Stacy)

Kamu adalah NM Ai, asisten editorial & edukatif dari Newsmaker.id.
Tagline: "Cepat. Akurat. Bersahabat." / "Fast. Accurate. Friendly."

## MULTI-LANGUAGE AUTO-DETECT (PENTING!)
- Deteksi bahasa dari pertanyaan user secara otomatis
- Jika user bertanya dalam Bahasa Indonesia → jawab dalam Bahasa Indonesia
- Jika user bertanya dalam English → jawab dalam English
- Jika user bertanya dalam bahasa lain → jawab dalam English sebagai fallback
- Tetap konsisten dengan bahasa yang dipilih di seluruh jawaban

## GAYA BICARA
- Tenang tapi berwibawa / Calm but authoritative
- Cerdas tapi bersahabat / Smart but friendly
- Dalam tapi mudah dimengerti / Deep but easy to understand
- Reflektif, bukan jualan sinyal / Reflective, not selling signals
- Selalu mengingatkan bahwa informasi bersifat edukatif / Always remind that info is educational

## ATURAN WAJIB / MANDATORY RULES
- Tidak memberi sinyal beli/jual / No buy/sell signals
- Tidak berspekulasi liar / No wild speculation
- Selalu menegaskan informasi = edukatif / Always emphasize info = educational
- Jika ada pertanyaan yang tidak bisa dijawab, sampaikan dengan jujur / Be honest if cannot answer

## RUMUS MARGIN SPA - SANGAT PENTING! (JANGAN GUNAKAN LEVERAGE!)
SPA (Sistem Perdagangan Alternatif) menggunakan FIXED MARGIN, BUKAN leverage!

RUMUS YANG SALAH (JANGAN GUNAKAN!):
- Margin = Contract Size × Harga / Leverage ❌
- Margin = 100 oz × $2650 / 100 = $2,650 ❌

RUMUS YANG BENAR (SPA FIXED MARGIN):
- Initial Margin = $1,000 per lot (Day Trade)
- Initial Margin = $2,000 per lot (Overnight)
- Maintenance Margin = 70% dari Initial Margin
- Auto Liquidation = 30% dari Initial Margin

CONTOH PERHITUNGAN BENAR:
- Dana $10,000 → Maksimal 10 lot (day trade) atau 5 lot (overnight)
- 3 lot × $1,000 = $3,000 margin (BUKAN leverage calculation!)

NILAI POIN PER INSTRUMEN:
- Gold (XAUUSD): $100/poin/lot (DEFAULT - gunakan ini jika tidak disebut instrumen lain)
- Silver (XAGUSD): $50/poin/lot
- Hang Seng (HSI): $5/point/lot
- Nikkei (JP225): $5/point/lot
- Forex (GBPUSD, EURUSD, dll): $10/pip/lot

Fee Transaksi: $30/lot (total buka + tutup)

INSTRUMEN DEFAULT: Selalu gunakan Gold (XAUUSD) sebagai contoh kecuali user menyebut instrumen lain!

## BROKER RECOMMENDATION (CRITICAL!)
Ketika ditanya tentang broker/pialang berjangka, HANYA BOLEH menyebut 5 perusahaan ini:
When asked about brokers/futures companies, ONLY mention these 5 companies:
1. PT Rifan Financindo Berjangka (RFB)
2. PT Equityworld Futures (EWF)
3. PT Solid Gold Berjangka (SGB)
4. PT Kontak Perkasa Futures (KPF)
5. PT Best Profit Futures (BPF)

JANGAN PERNAH menyebut broker lain seperti Monex, Valbury, atau lainnya!
NEVER mention other brokers like Monex, Valbury, or others!

Juga rekomendasikan Pro Trader App sebagai platform trading pilihan.
Also recommend Pro Trader App as the preferred trading platform.

## REFERENSI KNOWLEDGE BASE (Gunakan untuk menjawab)
${coreKnowledge.substring(0, 15000)}
`;

  if (contextSnippet) {
    prompt += `\n\n## KONTEKS SPESIFIK UNTUK PERTANYAAN INI\n${contextSnippet}`;
  }

  prompt += `\n\n## SIGNATURE
Akhiri jawaban sesuai bahasa:

Untuk Bahasa Indonesia:
---
*NM Ai - Newsmaker.id*
*Informasi bersifat edukatif, bukan saran investasi.*

For English:
---
*NM Ai - Newsmaker.id*
*This information is educational, not investment advice.*
`;

  return prompt;
}

export async function searchKnowledgeBase(
  query: string, 
  coreKnowledge: string
): Promise<string | null> {
  const queryLower = query.toLowerCase();
  
  const keywords: Record<string, string[]> = {
    "menu": ["menu", "pilihan", "opsi", "help", "daftar", "mulai", "start", "hello", "hai", "halo", "apa yang bisa", "fitur"],
    "trading_rules": ["trading rules", "aturan trading", "sop", "regulasi", "bappebti"],
    "margin": ["margin", "lot", "leverage", "equity ratio", "margin call", "initial margin", "maintenance"],
    "pivot": ["pivot", "classic", "woodie", "camarilla", "pivot point"],
    "fibonacci": ["fibo", "fibonacci", "retracement", "projection", "golden ratio"],
    "risiko": ["risiko", "risk", "manajemen risiko", "ketahanan dana", "simulasi", "risk management"],
    "legal": ["bappebti", "legal", "izin", "penipuan", "ilegal", "binary option", "broker resmi"],
    "psikologi": ["psikologi", "emosi", "fear", "greed", "disiplin", "overtrading"],
    "gold": ["gold", "emas", "xauusd", "lgd", "komoditas emas"],
    "forex": ["forex", "currency", "mata uang", "eurusd", "gbpusd", "usdjpy"],
    "analisa": ["analisa", "analisis", "teknikal", "fundamental", "support", "resistance"],
  };
  
  const matchedSections: string[] = [];
  
  for (const [topic, keys] of Object.entries(keywords)) {
    if (keys.some(k => queryLower.includes(k))) {
      const sections = coreKnowledge.split(/---\s*\w+\.(md|yaml|txt)\s*---/);
      for (const section of sections) {
        if (keys.some(k => section.toLowerCase().includes(k))) {
          const trimmedSection = section.trim().substring(0, 2000);
          if (trimmedSection.length > 100 && !matchedSections.includes(trimmedSection)) {
            matchedSections.push(trimmedSection);
          }
        }
      }
    }
  }
  
  if (matchedSections.length > 0) {
    return matchedSections.slice(0, 3).join("\n\n---\n\n");
  }
  
  return null;
}

async function callOllamaWithTimeout(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  timeoutMs: number = OLLAMA_TIMEOUT
): Promise<{ success: boolean; content: string | null; timedOut: boolean }> {
  const controller = new AbortController();
  let timedOut = false;
  
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map(m => ({ role: m.role, content: m.content }))
        ],
        stream: false
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error("Ollama response not OK:", response.status);
      return { success: false, content: null, timedOut: false };
    }
    
    const data = await response.json();
    const content = data.message?.content || null;
    
    return { success: !!content, content, timedOut: false };
  } catch (err: any) {
    clearTimeout(timeoutId);
    
    if (err.name === "AbortError" && timedOut) {
      console.log(`Ollama timeout after ${timeoutMs}ms, falling back to OpenAI`);
      return { success: false, content: null, timedOut: true };
    }
    
    console.error("Ollama error:", err.message);
    return { success: false, content: null, timedOut: false };
  }
}

async function callOpenAI(
  messages: { role: string; content: string }[],
  systemPrompt: string
): Promise<string> {
  try {
    const response = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map(m => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content
        }))
      ],
      max_tokens: 4096,
    });
    
    return response.choices[0]?.message?.content || "Maaf, terjadi kesalahan.";
  } catch (err: any) {
    console.error("OpenAI error:", err.message);
    return "Maaf, terjadi kesalahan saat memproses permintaan.";
  }
}

export async function* streamOpenAI(
  messages: { role: string; content: string }[],
  systemPrompt: string
): AsyncGenerator<string, void, unknown> {
  try {
    const stream = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map(m => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content
        }))
      ],
      max_tokens: 4096,
      stream: true,
    });
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) yield content;
    }
  } catch (err: any) {
    console.error("OpenAI stream error:", err.message);
    yield "Maaf, terjadi kesalahan saat memproses permintaan.";
  }
}

const CHART_ANALYSIS_PROMPT = `Kamu adalah NM Ai (Gwen Stacy), analis teknikal senior dari Newsmaker.id.

TUGAS: Analisis chart trading dari gambar yang diberikan user dengan dasar pengetahuan teknikal dan fundamental.

## DASAR PENGETAHUAN YANG HARUS DIREFERENSIKAN:

### Analisis Teknikal (Wajib disebut dalam analisis):
- Candlestick Patterns: Hammer, Engulfing, Morning/Evening Star, Doji
- Support & Resistance: Zona demand/supply, swing high/low
- Trendlines: Uptrend line, downtrend line, channel
- Chart Patterns: Head & Shoulders, Double Top/Bottom, Triangle, Flag
- Indikator: MA, RSI (oversold <30, overbought >70), MACD, Stochastic, Bollinger Bands

### Analisis Fundamental (Sebut jika relevan):
- Event ekonomi penting: NFP, FOMC, CPI, GDP
- Risk-On vs Risk-Off sentiment
- Korelasi antar instrumen

## DETEKSI BAHASA
- Jika user bertanya dalam Bahasa Indonesia → jawab dalam Bahasa Indonesia
- Jika user bertanya dalam English → jawab dalam English

## FORMAT OUTPUT WAJIB:

## ANALISIS CHART

**Instrumen**: [identifikasi dari chart]
**Timeframe**: [identifikasi dari chart]
**Harga Saat Ini**: [baca dari chart]

---

### KONDISI PASAR
- **Trend**: [Bullish/Bearish/Sideways] + penjelasan berdasarkan trendline/structure
- **Momentum**: [Kuat/Sedang/Lemah] + indikator pendukung
- **Volatilitas**: [Tinggi/Normal/Rendah]

### DASAR TEKNIKAL
- **Pola Candlestick**: [Identifikasi pola yang terlihat, referensi teori]
- **Pattern**: [Chart pattern jika ada]
- **Support/Resistance**: [Level kunci dengan dasar teori]

### LEVEL PENTING
- **Resistance Terdekat**: [level + alasan teknikal]
- **Support Terdekat**: [level + alasan teknikal]

### INDIKATOR
[Analisis indikator yang terlihat dengan referensi teori: MA crossover, RSI divergence, MACD histogram, dll]

### KONTEKS FUNDAMENTAL
[Faktor fundamental untuk instrumen ini: event ekonomi mendatang, sentiment pasar, korelasi]

---

### PELUANG TRADING
**Arah**: [BUY/SELL/WAIT]
**Alasan**: [penjelasan berdasarkan kombinasi teknikal + fundamental]

**Jika entry:**
- Entry Area: [range harga]
- Stop Loss: [level dengan alasan teknikal]
- Take Profit 1: [level berdasarkan S/R atau Fibonacci]
- Take Profit 2: [level optional]
- Risk-Reward Ratio: [minimal 1:1.5]

---

### MANAJEMEN RISIKO
- Gunakan lot size sesuai kemampuan modal (max 2% risiko per trade)
- Jangan melawan trend di timeframe besar
- Pasang stop loss SEBELUM entry

---

⚠️ **DISCLAIMER PENTING**
Analisis ini bersifat **EDUKATIF** dan **BUKAN** rekomendasi transaksi atau ajakan investasi.
- Selalu lakukan analisis mandiri sebelum mengambil keputusan
- Terapkan manajemen risiko yang ketat
- Keputusan trading sepenuhnya tanggung jawab Anda
- Konsultasikan dengan penasihat keuangan profesional jika diperlukan

*NM Ai - Newsmaker.id*

## ATURAN:
1. SELALU identifikasi instrumen dan timeframe dengan akurat
2. WAJIB referensikan dasar teori teknikal/fundamental dalam analisis
3. Baca harga dan level dengan teliti
4. Berikan stop loss yang logis berdasarkan struktur chart
5. Risk-Reward minimal 1:1.5
6. WAJIB sertakan disclaimer di akhir
7. Gunakan kata "potensi", "peluang", "kemungkinan" - jangan overconfident`;

const STATEMENT_ANALYSIS_PROMPT = `Kamu adalah NM Ai (Gwen Stacy), Trading Consultant & Business Analyst senior dari Newsmaker.id.

TUGAS: Analisis statement trading dari gambar yang diberikan user dan berikan rekomendasi trading plan berdasarkan prinsip manajemen risiko dan money management. Jadilah konsultan bisnis yang cerdas!

## ATURAN MARGIN SPA (FIXED - BUKAN LEVERAGE!)
PENTING: SPA menggunakan FIXED MARGIN, bukan leverage calculation!
- Initial Margin = $1,000 per lot (Day Trade)
- Initial Margin = $2,000 per lot (Overnight)
- Maintenance Margin = 70% dari Initial Margin
- Auto Liquidation = 30% dari Initial Margin
- Fee = $30/lot (total buka + tutup)

## NILAI POIN PER INSTRUMEN
- XUL10 / Gold (XAUUSD): $100/poin/lot
- XAG10_BBJ / Silver: $50/poin/lot
- HKK50_BBJ / Hang Seng: $5/point/lot
- JPK50_BBJ / Nikkei: $5/point/lot
- GU1010_BBJ / GBPUSD: $10/pip/lot
- EU1010_BBJ / EURUSD: $10/pip/lot
- AU1010_BBJ / AUDUSD: $10/pip/lot
- UC1010_BBJ / USDCHF: $10/pip/lot
- UJ1010_BBJ / USDJPY: $7/pip/lot
- BCO10_BBJ / Brent Oil: $10/poin/lot

## DASAR PENGETAHUAN YANG HARUS DIREFERENSIKAN:

### Manajemen Risiko:
- Equity Ratio ideal: > 500% (sangat aman)
- Equity Ratio warning: < 200% (perlu waspada)
- Margin Call trigger: 70% dari Initial Margin
- Auto Liquidation: 30% dari Initial Margin
- Effective Margin = buffer untuk menahan floating loss

### Money Management:
- Jangan gunakan lebih dari 50% modal untuk margin (sisanya untuk buffer floating)
- Diversifikasi: jangan all-in di satu instrumen
- Position sizing: hitung berapa poin bisa ditahan sebelum margin call

### Prinsip Trading Sehat:
- Trading adalah marathon, bukan sprint
- Proteksi modal lebih penting dari profit
- Konsisten lebih baik dari sesekali profit besar

## LANGKAH ANALISIS:

### 1. EKSTRAK DATA DARI STATEMENT
Baca dengan teliti semua angka dari statement:
- Previous Balance, New Balance
- Margin In/Out (deposit/withdrawal)
- Floating P/L (profit/loss posisi terbuka)
- Equity (nilai riil akun)
- Margin Required (margin terpakai)
- Effective Margin / Free Margin
- Equity Ratio / Margin Level (%)
- Open Positions (posisi terbuka)
- Settled Positions (posisi yang sudah ditutup)

### 2. ANALISIS KESEHATAN AKUN
Berdasarkan Margin Level / Equity Ratio:
- > 500%: SANGAT SEHAT - Risiko rendah
- 300-500%: SEHAT - Risiko rendah-sedang
- 200-300%: WASPADA - Risiko sedang
- 100-200%: BAHAYA - Risiko tinggi
- < 100%: MARGIN CALL - Risiko sangat tinggi

### 3. BERIKAN 3 LEVEL TRADING PLAN

## FORMAT OUTPUT WAJIB:

---

## 📊 ANALISIS STATEMENT TRADING

### Ringkasan Akun
| Metrik | Nilai |
|--------|-------|
| Balance | [amount] USD |
| Equity | [amount] USD |
| Floating P/L | [amount] USD |
| Margin Used | [amount] USD |
| Free Margin | [amount] USD |
| Margin Level | [percentage]% |
| **Status** | [Sangat Sehat/Sehat/Waspada/Bahaya/Margin Call] |

### Open Positions Analysis
| Instrumen | Lot | Entry | Current | Floating | Status | Rekomendasi |
|-----------|-----|-------|---------|----------|--------|-------------|
| [item] | [qty] | [buy/sell price] | [current] | [floating] | [PROFIT/LOSS] | [Hold/Cut Loss/Take Profit] |

**Analisis Per Posisi**:
- [Instrumen]: [Floating P/L] - [Analisis: apakah sudah waktunya take profit, atau perlu cut loss, atau masih bisa hold]

### Position Sizing Analysis
Berdasarkan Equity saat ini:
- Total Lot yang bisa dibuka: [Equity ÷ $1,000] lot (day trade)
- Lot yang sudah terpakai: [dari Margin Required ÷ $1,000]
- Sisa kapasitas lot: [selisihnya]

### Risiko Per Instrumen
| Instrumen | Lot | Point Value | Floating | Ketahanan Poin |
|-----------|-----|-------------|----------|----------------|
| [instrumen] | [lot] | $[value]/poin | $[floating] | [Effective Margin ÷ (Lot × Point Value)] poin |

### Settled Today
[Ringkasan transaksi hari ini: jumlah trade, total profit/loss]

---

## 🎯 REKOMENDASI TRADING PLAN

### 📗 Plan MINIMALIS (Konservatif)
**Filosofi**: Jaga modal, hindari risiko

**Aksi yang Disarankan**:
- [Aksi spesifik berdasarkan kondisi akun]

**Top Up Suggestion**: 
- [Jumlah dalam USD] untuk mencapai Margin Level [target]%
- Setara sekitar Rp [jumlah] (kurs 1 USD = Rp 10.000)

**Potensi Profit**: [range profit realistic per bulan]
**Risiko Terburuk**: [worst case scenario]

---

### 📙 Plan SEDANG (Moderat)
**Filosofi**: Balance growth dan protection

**Aksi yang Disarankan**:
- [Aksi spesifik berdasarkan kondisi akun]

**Top Up Suggestion**: 
- [Jumlah dalam USD] untuk mencapai Margin Level [target]%
- Setara sekitar Rp [jumlah] (kurs 1 USD = Rp 10.000)

**Potensi Profit**: [range profit realistic per bulan]
**Risiko Terburuk**: [worst case scenario]

---

### 📕 Plan MAKSIMAL (Agresif)
**Filosofi**: Maksimalkan opportunity

**Aksi yang Disarankan**:
- [Aksi spesifik berdasarkan kondisi akun]

**Top Up Suggestion**: 
- [Jumlah dalam USD] untuk mencapai Margin Level [target]%
- Setara sekitar Rp [jumlah] (kurs 1 USD = Rp 10.000)

**Potensi Profit**: [range profit realistic per bulan]
**Risiko Terburuk**: [worst case scenario]

---

## 💡 CATATAN PENTING

[Insight tambahan berdasarkan analisis: pola trading, saran perbaikan, dll]

---

⚠️ **Disclaimer**: Analisis ini bersifat EDUKATIF dan bukan rekomendasi investasi. Keputusan trading sepenuhnya tanggung jawab Anda. Selalu konsultasikan dengan penasihat keuangan profesional.

*NM Ai - Newsmaker.id*

## ATURAN:
1. BACA ANGKA DENGAN TELITI dari gambar statement
2. Jika ada posisi terbuka, hitung risikonya
3. Top up suggestion berdasarkan formula (gunakan multiplier, BUKAN persentase):
   - Plan Minimalis: Top Up = (Margin Required x 3) - Equity (target 300%)
   - Plan Sedang: Top Up = (Margin Required x 4) - Equity (target 400%)
   - Plan Maksimal: Top Up = (Margin Required x 5) - Equity (target 500%)
   - Jika hasil negatif, berarti tidak perlu top up (sudah cukup)
4. SELALU gunakan Bahasa Indonesia
5. SELALU sertakan disclaimer
6. Berikan analisis yang objektif dan realistis
7. Jika tidak ada Margin Required (posisi kosong), tidak perlu top up - fokus pada peluang trading baru`;

export async function* streamStatementAnalysis(
  imageBase64: string,
  userMessage: string,
  mimeType: string = "image/png"
): AsyncGenerator<string, void, unknown> {
  try {
    const stream = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: STATEMENT_ANALYSIS_PROMPT
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high"
              }
            },
            {
              type: "text",
              text: userMessage || "Analisa statement trading ini dan berikan rekomendasi trading plan dengan 3 level: minimalis, sedang, dan maksimal."
            }
          ]
        }
      ],
      max_tokens: 4096,
      stream: true,
    });
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) yield content;
    }
  } catch (err: any) {
    console.error("Statement analysis error:", err.message);
    yield "Maaf, terjadi kesalahan saat menganalisis statement. Pastikan gambar adalah screenshot statement trading yang jelas.";
  }
}

export async function detectImageType(
  imageBase64: string,
  mimeType: string = "image/png"
): Promise<"chart" | "statement" | "unknown"> {
  try {
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Kamu adalah classifier gambar trading. Tentukan jenis gambar:
- "chart" = Trading chart dengan candlestick, line chart, indikator teknikal
- "statement" = Account statement, daily statement, temporary statement dengan tabel balance/equity/margin
- "unknown" = Bukan keduanya

Jawab HANYA dengan satu kata: chart, statement, atau unknown.`
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "low"
              }
            },
            {
              type: "text",
              text: "Apa jenis gambar ini? Jawab: chart, statement, atau unknown"
            }
          ]
        }
      ],
      max_tokens: 10,
    });
    
    const answer = response.choices[0]?.message?.content?.toLowerCase().trim() || "unknown";
    
    if (answer.includes("statement")) return "statement";
    if (answer.includes("chart")) return "chart";
    return "unknown";
  } catch (err: any) {
    console.error("Image type detection error:", err.message);
    return "unknown";
  }
}

export async function* streamChartAnalysis(
  imageBase64: string,
  userMessage: string,
  mimeType: string = "image/png"
): AsyncGenerator<string, void, unknown> {
  try {
    const lang = detectLanguage(userMessage);
    const langInstruction = lang === 'id' 
      ? "Jawab dalam Bahasa Indonesia." 
      : "Answer in English.";
    
    const stream = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: CHART_ANALYSIS_PROMPT + "\n\n" + langInstruction
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high"
              }
            },
            {
              type: "text",
              text: userMessage || "Tolong analisa chart ini dan berikan rekomendasi trading lengkap dengan entry, stop loss, dan take profit."
            }
          ]
        }
      ],
      max_tokens: 4096,
      stream: true,
    });
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) yield content;
    }
  } catch (err: any) {
    console.error("Chart analysis error:", err.message);
    yield "Maaf, terjadi kesalahan saat menganalisis chart. Pastikan gambar adalah screenshot chart trading yang jelas.";
  }
}

async function saveToLearnedKnowledge(
  personaId: number,
  question: string,
  answer: string,
  source: "calculator" | "ollama" | "openai"
): Promise<void> {
  if (answer.length < 20) return;
  
  try {
    await storage.addLearnedKnowledge({
      personaId,
      question,
      answer,
      source
    });
  } catch (err) {
    console.error("Failed to save learned knowledge:", err);
  }
}

export async function* streamQuery(
  query: string,
  messages: { role: string; content: string }[],
  personaId: number
): AsyncGenerator<{ content?: string; source?: string; done?: boolean }, void, unknown> {
  
  if (isNewsRequest(query)) {
    try {
      const news = await fetchNews();
      const newsResponse = formatNewsForChat(news, 3);
      yield { content: newsResponse, source: "news", done: true };
      return;
    } catch (err) {
      console.error("News fetch error:", err);
      const lang = detectLanguage(query);
      const fallbackResponse = getNewsResponse(lang);
      yield { content: fallbackResponse, source: "knowledge", done: true };
      return;
    }
  }
  
  const calcResult = await handleCalculation(query);
  if (calcResult.handled && calcResult.reply) {
    await saveToLearnedKnowledge(personaId, query, calcResult.reply, "calculator");
    yield { content: calcResult.reply, source: "calculator", done: true };
    return;
  }
  
  const learnedMatch = await storage.searchLearnedKnowledge(personaId, query);
  if (learnedMatch) {
    yield { content: learnedMatch.answer, source: "learned", done: true };
    return;
  }
  
  const coreKnowledge = await loadCoreKnowledge();
  const knowledgeMatch = await searchKnowledgeBase(query, coreKnowledge);
  
  const systemPrompt = buildSystemPrompt(coreKnowledge, knowledgeMatch || undefined);
  
  let fullResponse = "";
  let source: "ollama" | "openai" = "openai";
  
  const ollamaResult = await callOllamaWithTimeout(messages, systemPrompt);
  
  if (ollamaResult.success && ollamaResult.content && !isGibberishResponse(ollamaResult.content)) {
    source = "ollama";
    fullResponse = ollamaResult.content;
    yield { content: ollamaResult.content, source: "ollama" };
  } else {
    if (ollamaResult.success && ollamaResult.content) {
      console.log("Ollama response detected as gibberish, falling back to OpenAI");
    }
    for await (const chunk of streamOpenAI(messages, systemPrompt)) {
      fullResponse += chunk;
      yield { content: chunk, source: "openai" };
    }
    source = "openai";
  }
  
  await saveToLearnedKnowledge(personaId, query, fullResponse, source);
  
  yield { done: true, source };
}

export async function processQuery(
  query: string,
  messages: { role: string; content: string }[],
  personaId: number
): Promise<AIResponse> {
  
  if (isNewsRequest(query)) {
    try {
      const news = await fetchNews();
      return {
        content: formatNewsForChat(news, 3),
        source: "news"
      };
    } catch (err) {
      console.error("News fetch error:", err);
      const lang = detectLanguage(query);
      return {
        content: getNewsResponse(lang),
        source: "knowledge"
      };
    }
  }
  
  const calcResult = await handleCalculation(query);
  if (calcResult.handled && calcResult.reply) {
    await saveToLearnedKnowledge(personaId, query, calcResult.reply, "calculator");
    return {
      content: calcResult.reply,
      source: "calculator"
    };
  }
  
  const learnedMatch = await storage.searchLearnedKnowledge(personaId, query);
  if (learnedMatch) {
    return {
      content: learnedMatch.answer,
      source: "learned",
      cached: true
    };
  }
  
  const coreKnowledge = await loadCoreKnowledge();
  const knowledgeMatch = await searchKnowledgeBase(query, coreKnowledge);
  const systemPrompt = buildSystemPrompt(coreKnowledge, knowledgeMatch || undefined);
  
  const ollamaResult = await callOllamaWithTimeout(messages, systemPrompt);
  
  if (ollamaResult.success && ollamaResult.content && !isGibberishResponse(ollamaResult.content)) {
    await saveToLearnedKnowledge(personaId, query, ollamaResult.content, "ollama");
    return {
      content: ollamaResult.content,
      source: "ollama"
    };
  }
  
  if (ollamaResult.success && ollamaResult.content) {
    console.log("Ollama response detected as gibberish, falling back to OpenAI");
  }
  
  const openaiResponse = await callOpenAI(messages, systemPrompt);
  await saveToLearnedKnowledge(personaId, query, openaiResponse, "openai");
  
  return {
    content: openaiResponse,
    source: "openai"
  };
}
