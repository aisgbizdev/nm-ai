# GWEN STACY / NM AI - Application Blueprint
## AI-Powered Financial Trading Education Chatbot

> Dokumen ini berisi blueprint lengkap aplikasi NM AI (Gwen Stacy) dari Newsmaker.id.
> Gunakan dokumen ini sebagai panduan untuk membangun ulang aplikasi serupa.

---

## 1. GAMBARAN UMUM

**Nama Aplikasi**: NM AI (nama persona default: "Gwen Stacy")
**Platform**: Newsmaker.id
**Tujuan**: Chatbot AI untuk edukasi trading berjangka (futures) di Indonesia - meliputi forex, komoditas, indeks
**Tagline**: "Cepat. Akurat. Bersahabat." / "Fast. Accurate. Friendly."

### Apa yang Dilakukan Aplikasi Ini?
- Chatbot interaktif dengan streaming response (huruf demi huruf muncul)
- Menjawab pertanyaan seputar trading & investasi dalam Bahasa Indonesia dan English (auto-detect)
- Menyediakan kalkulator trading built-in (margin, pivot, fibonacci, position size, dll)
- Menganalisis gambar chart trading dan statement trading menggunakan AI Vision
- Menampilkan harga real-time dan kalender ekonomi
- Memberikan rekomendasi trading dengan level Entry, Stop Loss, Take Profit yang spesifik
- Sistem persona yang bisa dikustomisasi (system prompt, knowledge base)

### Batasan Topik
Bot HANYA menjawab tentang:
- Trading & Investasi (forex, komoditas, indeks, saham)
- Perdagangan Berjangka & Regulasi Bappebti
- Analisa Pasar (teknikal, fundamental)
- Pialang/Broker Berjangka
- Manajemen Risiko & Margin
- Berita Ekonomi & Finansial
- Kalender Ekonomi
- Edukasi Trading

Bot MENOLAK menjawab topik di luar trading (mobil, kuliner, hiburan, dll).

---

## 2. TECH STACK

### Frontend
| Teknologi | Fungsi |
|-----------|--------|
| React + TypeScript | Framework UI |
| Vite | Bundler & Dev Server |
| Wouter | Lightweight routing |
| TanStack React Query v5 | Server state management & caching |
| shadcn/ui + Radix | Component library |
| Tailwind CSS | Styling (dark theme deep navy/indigo) |
| Framer Motion | Animasi transisi |
| react-markdown + remark-gfm | Render markdown di chat |
| jsPDF | Export chat ke PDF |
| lucide-react | Icon library |

### Backend
| Teknologi | Fungsi |
|-----------|--------|
| Express.js + TypeScript | API server |
| Server-Sent Events (SSE) | Streaming response real-time |
| Multer | Upload file gambar |
| Zod | Schema validation |
| esbuild | Production build |

### AI / LLM
| Teknologi | Fungsi |
|-----------|--------|
| OpenAI GPT (gpt-4o default) | Primary LLM - streaming chat & vision analysis |
| Ollama (deepseek-r1) | Fallback local LLM (opsional) |

### Database
| Teknologi | Fungsi |
|-----------|--------|
| PostgreSQL (Neon) | Data storage |
| Drizzle ORM | ORM & migrations |
| drizzle-zod | Schema validation |

---

## 3. ARSITEKTUR SISTEM

### Flow Utama Chat
```
User Input → Frontend
  → POST /api/chat (SSE stream)
    → Backend menerima pesan
    → Simpan pesan user ke DB
    → Cek apakah pertanyaan tentang image analysis (tanpa gambar)
    → Cek apakah pertanyaan news/berita
    → Cek apakah terdeteksi sebagai kalkulator (handleCalculation)
    → Jika kalkulator cocok → return hasil langsung (tanpa LLM)
    → Jika bukan kalkulator → cek learned knowledge cache
    → Jika tidak ada cache → build system prompt + knowledge base
    → Fetch harga real-time + berita + kalender ekonomi
    → Coba Ollama dulu (dengan timeout 7 detik)
    → Jika Ollama gagal/gibberish → fallback ke OpenAI (streaming)
    → Tambahkan follow-up questions di akhir
    → Simpan ke learned knowledge untuk cache
    → Stream response ke frontend via SSE
```

### Flow Image Analysis
```
User Upload Gambar → Frontend
  → POST /api/analyze-chart (multipart + SSE stream)
    → Backend terima gambar (base64)
    → Detect tipe gambar: "chart" atau "statement" atau "unknown"
    → Jika chart → gunakan CHART_ANALYSIS_PROMPT + gpt-4o vision
    → Jika statement → gunakan STATEMENT_ANALYSIS_PROMPT + gpt-4o vision
    → Stream analisis ke frontend
    → Simpan ke DB sebagai message
```

### 3-Tier AI Engine (Prioritas)
1. **Tier 1: Calculator Engine** - Deteksi keyword, hitung langsung tanpa LLM (paling cepat)
2. **Tier 2: Ollama (Local LLM)** - Coba local model dengan timeout 7 detik
3. **Tier 3: OpenAI GPT** - Fallback utama, streaming response

### Gibberish Detection
Sebelum menerima response dari Ollama, cek:
- Panjang minimal 20 karakter
- Minimal 3 kata
- Minimal 50% kata bermakna (panjang >= 2 huruf)
- Mengandung kata Indonesia/English yang valid
- Tidak ada pola berulang (repeating pattern)
- Tidak lebih dari 10% karakter aneh

---

## 4. DATABASE SCHEMA

### Tabel: personas
```sql
CREATE TABLE personas (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,                    -- "Gwen Stacy"
  description TEXT,                      -- Deskripsi singkat
  system_prompt TEXT NOT NULL,           -- Instruksi "jiwa" AI
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabel: knowledge_files
```sql
CREATE TABLE knowledge_files (
  id SERIAL PRIMARY KEY,
  persona_id INTEGER REFERENCES personas(id) NOT NULL,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,                 -- Isi file teks
  file_type TEXT NOT NULL,               -- .md, .txt, etc.
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabel: chat_sessions
```sql
CREATE TABLE chat_sessions (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'gpt-5.1', -- "gpt-5.1" or "ollama"
  persona_id INTEGER REFERENCES personas(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Tabel: messages
```sql
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES chat_sessions(id) NOT NULL,
  role TEXT NOT NULL,                    -- "user", "assistant", "system"
  content TEXT NOT NULL,
  meta JSONB,                            -- Info tambahan (imageData, token usage)
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabel: learned_knowledge
```sql
CREATE TABLE learned_knowledge (
  id SERIAL PRIMARY KEY,
  persona_id INTEGER REFERENCES personas(id) NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  source TEXT NOT NULL,                  -- "ollama" or "openai" or "calculator"
  similarity TEXT,                       -- Untuk future semantic matching
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabel: message_feedback
```sql
CREATE TABLE message_feedback (
  id SERIAL PRIMARY KEY,
  message_id INTEGER REFERENCES messages(id) NOT NULL,
  feedback TEXT NOT NULL,                -- "up" or "down"
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 5. API ENDPOINTS

| Method | Path | Fungsi |
|--------|------|--------|
| GET | /api/personas | List semua persona |
| POST | /api/personas | Buat persona baru |
| PUT | /api/personas/:id | Update persona |
| POST | /api/personas/:id/knowledge | Upload knowledge file |
| GET | /api/personas/:id/knowledge | List knowledge files |
| GET | /api/sessions | List semua chat session |
| POST | /api/sessions | Buat session baru |
| GET | /api/sessions/:id | Get session + messages + persona |
| DELETE | /api/sessions/:id | Hapus session + messages |
| POST | /api/sessions/:id/messages | Tambah message ke session |
| POST | /api/chat | **Chat streaming (SSE)** - input: { message, sessionId } |
| POST | /api/analyze-chart | **Image analysis (SSE)** - input: FormData (images + sessionId + message) |
| POST | /api/messages/:messageId/feedback | Feedback thumbs up/down |

### SSE Streaming Format
```
data: {"content": "Halo", "source": "openai"}
data: {"content": " trader", "source": "openai"}
data: {"content": "!", "source": "openai"}
data: {"done": true, "source": "openai"}
```

---

## 6. FITUR KALKULATOR (TANPA LLM)

Semua kalkulator bekerja dengan deteksi keyword dari input user, lalu menghitung langsung tanpa memanggil AI.

### 6.1 Pivot Point Calculator
**Trigger**: keyword "pivot" + data OHLC atau nama instrumen
**Input**: Open, High, Low, Close (manual atau auto-fetch dari API)
**Output**: 3 metode sekaligus:
- Classic Pivot (PP, S1-S3, R1-R3)
- Woodie Pivot
- Camarilla Pivot

Menyertakan rekomendasi BUY/SELL berdasarkan posisi harga terhadap pivot:
- Harga > PP → BUY bias, Entry di atas PP, SL di bawah S1, TP di R1/R2/R3
- Harga < PP → SELL bias, Entry di bawah PP, SL di atas R1, TP di S1/S2/S3

**Target Variatif**:
| Gaya | Target |
|------|--------|
| Scalper | TP1 (level terdekat) |
| Medium/Swing | TP2 (level menengah) |
| Long Term | TP3 (level terjauh) |

### 6.2 Fibonacci Calculator
**Trigger**: keyword "fibo" atau "fibonacci" + High dan Low
**Input**: High, Low (manual), trend auto-detect (High > Low = uptrend)
**Output**:
- Level Fibonacci: 23.6%, 38.2%, 50%, 61.8%, 78.6%
- Rekomendasi BUY (uptrend) atau SELL (downtrend)

**Logika Uptrend**:
- SL di bawah Low (Low - buffer)
- Scalper TP: di sekitar High
- Medium TP: High + 38.2% × range
- Long Term TP: High + 61.8% × range

**Logika Downtrend**:
- SL di atas High (High + buffer)
- Scalper TP: di sekitar Low
- Medium TP: Low - 38.2% × range
- Long Term TP: Low - 61.8% × range

### 6.3 Margin Calculator
**Trigger**: keyword "margin" + instrumen atau lot + dana/modal
**Input**: Jumlah lot, instrumen, modal
**Output**:
- Initial Margin (Day Trade: $1,000/lot, Overnight: $3,000/lot) - FIXED, bukan leverage!
- Total Margin Required
- Buffer Ketahanan ($10,000/lot ideal)
- Effective Margin (sisa dana setelah margin)
- Ketahanan Poin (Effective Margin ÷ lot ÷ point value)

**Margin Rules SPA (Sistem Perdagangan Alternatif)**:
| Jenis | Margin/Lot |
|-------|-----------|
| Day Trade | $1,000 |
| Overnight | $3,000 |
| Hedged Pair | $300/pair |
| Buffer Ideal | $10,000/lot |
| Maintenance | 70% Initial |
| Auto Liquidation | 30% Initial |
| Fee | $30/lot (buka + tutup) |

### 6.4 Position Size Calculator
**Trigger**: keyword "position size" atau "ukuran posisi"
**Input**: Modal, risk %, stop loss distance
**Output**: Max lot yang aman
**Formula**: Max Lot = (Modal × Risk%) ÷ (SL poin × point value)

### 6.5 Breakeven Calculator
**Trigger**: keyword "breakeven" atau "balik modal" atau "impas"
**Input**: Loss amount, lot size
**Output**: Poin yang dibutuhkan untuk recover
**Formula**: Poin = Loss ÷ (lot × point value)

### 6.6 Risk:Reward Calculator
**Trigger**: keyword "risk reward" atau "risk:reward"
**Input**: Entry, Stop Loss, Take Profit
**Output**: R:R ratio, minimum win rate
**Formula**: R:R = (TP - Entry) ÷ (Entry - SL)

### 6.7 Ketahanan Dana Calculator
**Trigger**: keyword "ketahanan" + lot/modal
**Input**: Modal (equity), jumlah lot, instrumen
**Output**: Berapa poin dana bisa bertahan sebelum margin call

### 6.8 Price Quote
**Trigger**: keyword "harga berapa" + instrumen
**Output**: Harga real-time dari API, atau fallback price jika API tidak tersedia

### 6.9 Economic Calendar
**Trigger**: keyword "kalender ekonomi" atau "economic calendar"
**Output**: Tabel event ekonomi hari ini/minggu ini dari API external
**Fitur Tambahan**:
- Filter by impact (High/Medium/Low)
- Trading bias berdasarkan keyword event:
  - higherIsGood: GDP, retail sales, employment → jika actual > forecast = bullish
  - higherIsBad: unemployment, inflation, CPI → jika actual > forecast = bearish
  - Neutral jika event ambigu
  - Bias hanya ditampilkan jika deviation > 5%

### 6.10 Trading Rules Table
**Trigger**: keyword "trading rules" + "tabel"
**Output**: Tabel lengkap margin & aturan per instrumen (Index, Commodity, Currency)

### 6.11 Conversational Handlers
- Jika user tanya "lot ideal" tanpa menyebut modal → bot tanya balik "Berapa modal Anda?"
- Jika user tanya "berapa modal yang dibutuhkan" → bot tampilkan tabel rekomendasi ($3K-$20K)
- Jika user ketik angka "1", "2", "3" → expand ke pertanyaan follow-up yang ditawarkan sebelumnya

---

## 7. KNOWLEDGE BASE SYSTEM

### Struktur File
```
knowledge/
  core/
    00_system_instruction.md    -- Instruksi sistem utama
    01_market_menu.yaml         -- Menu interaktif
    02_context_lite.yaml        -- Konteks ringkas
    03_grand_manifesto.md       -- Manifesto lengkap
    04_market_hub.md            -- Hub pasar
    05_trading_rules.md         -- Aturan trading SPA
    06_risk_planner.md          -- Perencanaan risiko
    07_rsp_module.md            -- Modul RSP
    08_report_context.md        -- Konteks laporan
    09_user_protection.md       -- Perlindungan user
    10_legal_awareness.md       -- Kesadaran legal
    11_partner_brokers.md       -- Broker partner
    12_technical_analysis.md    -- Analisa teknikal
    13_popular_indicators.md    -- Indikator populer
    14_fundamental_analysis.md  -- Analisa fundamental
    15_forex_pairs_guide.md     -- Panduan forex
    16_commodities_guide.md     -- Panduan komoditas
    17_indices_guide.md         -- Panduan indeks
    18_trading_psychology.md    -- Psikologi trading
    19_money_management.md      -- Money management
    19_trading_calculation_examples.md -- Contoh kalkulasi
    20_trading_strategies.md    -- Strategi trading
    21_bappebti_faq.md          -- FAQ Bappebti
    22_trading_glossary.md      -- Glosarium trading
    23_common_mistakes.md       -- Kesalahan umum
    24_chart_analysis.md        -- Panduan analisa chart
    25_statement_analysis.md    -- Panduan analisa statement
```

### Cara Kerja
1. Semua file `.md`, `.yaml`, `.txt` di folder `knowledge/core/` di-load dan di-cache (TTL 5 menit)
2. Digabungkan menjadi satu string besar sebagai context untuk system prompt
3. Saat user bertanya, keyword matching dilakukan untuk menemukan section yang relevan
4. Section relevan disisipkan sebagai "konteks spesifik" ke system prompt
5. Maksimal 15,000 karakter dari knowledge base dimasukkan ke prompt (untuk hemat token)

### Keyword Matching
```
"menu" → section yang mengandung kata menu, pilihan, help
"margin" → section tentang margin, lot, leverage
"pivot" → section tentang pivot point
"fibonacci" → section tentang fibonacci
"risiko" → section tentang risk management
"legal" → section tentang bappebti, legalitas
"gold" → section tentang gold, emas, xauusd
"forex" → section tentang forex, currency
```

---

## 8. SYSTEM PROMPT (IDENTITAS AI)

### Identitas
- Nama: NM Ai (Gwen Stacy)
- Role: Asisten editorial & edukatif dari Newsmaker.id
- Gaya: Confident, data-driven, berwibawa tapi bersahabat

### Aturan Wajib
1. **Multi-language**: Auto-detect bahasa user (Indonesia/English), jawab dengan bahasa yang sama
2. **Ringkas**: Default 5-8 baris, kecuali user minta detail
3. **Data-driven**: Selalu mulai dari data/fakta, bukan teori generik
4. **Confident**: "Gold berpotensi test $X" bukan "mungkin bisa naik atau turun"
5. **Edukatif**: Selalu tegaskan informasi bersifat edukasi, bukan sinyal
6. **Real-time data**: Gunakan harga live dari API untuk contoh, JANGAN harga lama/generik
7. **OHLC-based analysis**: Level support/resistance WAJIB dari data High/Low, bukan angka bulat
8. **Broker terbatas**: Hanya boleh sebut 5 broker partner (RFB, EWF, SGB, KPF, BPF)
9. **SPA Margin**: Gunakan fixed margin ($1,000/lot day trade), BUKAN leverage-based
10. **Follow-up questions**: Selalu tambahkan 3 pertanyaan pancingan di akhir (format nomor)
11. **Signature**: Akhiri dengan "NM Ai - Newsmaker.id" + disclaimer

### Real-Time Data Injection
System prompt di-inject dengan:
- Tabel harga real-time (Gold, Silver, Oil, HSI, JP225, EUR/USD, GBP/USD, AUD/USD, USD/JPY)
- Data OHLC (Open, High, Low, Close) untuk Gold dan Oil
- Berita terkini dari Newsmaker.id (prioritas berita komoditas)
- Event kalender ekonomi high impact hari ini

---

## 9. IMAGE ANALYSIS (VISION)

### Chart Analysis
**Model**: gpt-4o (vision)
**Prompt kunci**:
- Baca harga PRESISI dari chart (5023.45, BUKAN 5000)
- Identifikasi trend (bullish/bearish/sideways)
- Baca indikator PRESISI (RSI value, MACD, Stochastic, BB)
- Level support/resistance dari swing high/low yang TERLIHAT
- JANGAN fabrikasi pattern yang tidak terlihat

**Output Format**:
1. Analisis Chart (instrumen, timeframe, harga terakhir)
2. Struktur Pasar (trend, momentum)
3. Level Kunci (resistance, support - presisi dari chart)
4. Pola Candlestick (hanya yang terlihat jelas)
5. Indikator (nilai presisi dari skala)
6. DUA OPSI TRADING:
   - Opsi A: Skenario BUY (entry, SL, TP variatif)
   - Opsi B: Skenario SELL (entry, SL, TP variatif)
7. Strategi Averaging (jika sudah punya posisi)
8. Rekomendasi berdasarkan kondisi
9. Kalkulasi Lot (tabel berdasarkan modal)

### Statement Analysis
**Model**: gpt-4o (vision)
**Output Format**:
1. Ringkasan Akun (balance, equity, floating P/L, margin level, status)
2. Deteksi Posisi (BUY/SELL, hedged/open, lot)
3. Analisa Market (trend, support, resistance)
4. Skenario Risiko (minimal, maksimal, target)
5. 5 OPSI AKSI:
   - Opsi A: Cut Loss Sebagian
   - Opsi B: Cut Loss Semua
   - Opsi C: Averaging (tambah posisi)
   - Opsi D: Clear Semua & Entry Fresh
   - Opsi E: Hold + Top Up (tabel top up level)

### Multi-Image Support
- Bisa upload beberapa gambar sekaligus
- Auto-detect apakah chart atau statement per gambar
- Gabungkan analisis jika ada chart + statement

---

## 10. FRONTEND ARCHITECTURE

### Halaman
| Route | Komponen | Fungsi |
|-------|----------|--------|
| / | ChatPage | Homepage - redirect ke last session atau tampil welcome |
| /chat/:id | ChatPage | Chat aktif dengan session tertentu |

### Komponen Utama

#### ChatPage (1000+ baris)
- Welcome screen dengan menu interaktif (8 kategori)
- Chat message list dengan markdown rendering
- Input area dengan textarea auto-resize
- Image upload (file picker + camera)
- Image preview sebelum kirim
- Streaming indicator (typing animation)
- Export chat (TXT, Markdown, PDF)
- Auto-scroll: setelah streaming selesai, scroll ke pesan user (bukan ke bawah)

#### ChatMessage
- Render markdown (headings, bold, lists, tables, code blocks)
- Avatar berbeda untuk user vs assistant
- Timestamp
- Quick reply buttons (dari follow-up questions)
- Feedback buttons (thumbs up/down) di pesan terakhir assistant
- "Kembali ke Menu" button di pesan terakhir

#### Sidebar
- Logo/branding
- "New Chat" button
- List chat history (scroll area)
- Delete session (per session)
- Settings button → SettingsModal

#### SettingsModal
- Edit persona system prompt
- Upload knowledge base files
- Manage persona settings

### Custom Hooks

#### useStreamChat
- Mengelola SSE streaming dari backend
- Buffer system: terima chunk dari server, tampilkan dengan typewriter effect (18ms delay)
- State: streamingContent, isStreaming, error
- Auto-invalidate query cache setelah stream selesai
- AbortController untuk cancel streaming

#### useSession / useSessions
- Fetch session data + messages dari API
- CRUD mutations untuk sessions
- Auto-refetch setelah mutation

### Auto-Scroll Logic
```
During streaming → scroll ke bawah (mengikuti teks baru)
After streaming selesai → scroll ke pesan USER (pertanyaan), bukan ke bawah
  - Supaya user bisa melihat pertanyaan + awal jawaban
  - User tinggal scroll ke bawah untuk baca seluruh jawaban
Guard: 500ms setelah stream end, jangan scroll ke bawah (mencegah race condition)
```

### Expand Number to Question
User bisa ketik angka "1", "2", "3" untuk memilih follow-up question.
System menyimpan follow-up questions terakhir per session dan meng-expand angka menjadi pertanyaan lengkap.

---

## 11. EXTERNAL APIs

### Live Quotes API
```
GET https://endpoapi-production-3202.up.railway.app/api/live-quotes
Response: { data: [{ symbol, last, high, low, open, prevClose }] }
Cache: 60 detik
```

**Symbol Mapping**:
| API Symbol | Internal Key |
|------------|-------------|
| XUL*/XAU* | XAUUSD (Gold) |
| XAG*/LSI* | XAGUSD (Silver) |
| BCO* | BCO (Brent Oil) |
| HKK50*/HSI* | HSI (Hang Seng) |
| JPK50*/JPN* | JP225 (Nikkei) |
| EU10*/EUR* | EURUSD |
| GU10*/GBP* | GBPUSD |
| AU10* | AUDUSD |
| UJ10* | USDJPY |
| UC10* | USDCHF |

### Economic Calendar API
```
GET https://endpoapi-production-3202.up.railway.app/api/calendar/this-week
Response: { data: [{ date, time, currency, impact, event, actual, forecast, previous }] }
Cache: 5 menit
```

### News API (via newsFetcher.ts)
- Fetch berita terkini dari sumber
- Format untuk chat display (judul + excerpt + link)
- Prioritas berita komoditas (gold, oil, silver)

---

## 12. ENVIRONMENT VARIABLES

| Variable | Fungsi | Default |
|----------|--------|---------|
| AI_INTEGRATIONS_OPENAI_API_KEY | OpenAI API key | (required) |
| AI_INTEGRATIONS_OPENAI_BASE_URL | OpenAI base URL | (from integration) |
| OPENAI_MODEL | Model OpenAI | gpt-4o |
| OLLAMA_BASE_URL | Ollama server URL | http://localhost:11434 |
| OLLAMA_MODEL | Ollama model name | deepseek-r1:1.5b |
| OLLAMA_TIMEOUT_MS | Ollama timeout | 7000 |
| QUOTES_API_URL | API harga real-time | (production URL) |
| CALENDAR_API_URL | API kalender ekonomi | (production URL) |
| DATABASE_URL | PostgreSQL connection | (required) |

---

## 13. MARGIN CONFIG (Per Instrumen)

### Commodity (Gold, Silver, Oil)
```typescript
{
  gold: { dayTrade: 1000, overnight: 3000, hedged: 300, pointValue: 100, contractSize: "100 oz" },
  silver: { dayTrade: 1000, overnight: 3000, hedged: 300, pointValue: 50, contractSize: "5000 oz" },
  oil: { dayTrade: 500, overnight: 1500, hedged: 150, pointValue: 10, contractSize: "1000 bbl" }
}
```

### Index (Hang Seng, Nikkei)
```typescript
{
  hangSeng: { dayTrade: 500, overnight: 1500, hedged: 150, pointValue: 5, contractSize: "HK$50" },
  nikkei: { dayTrade: 500, overnight: 1500, hedged: 150, pointValue: 5, contractSize: "JPY 500" }
}
```

### Currency (Forex Pairs)
```typescript
{
  eurUsd: { dayTrade: 500, overnight: 1500, hedged: 150, pointValue: 10, contractSize: "100K" },
  gbpUsd: { dayTrade: 500, overnight: 1500, hedged: 150, pointValue: 10, contractSize: "100K" },
  audUsd: { dayTrade: 500, overnight: 1500, hedged: 150, pointValue: 10, contractSize: "100K" },
  usdJpy: { dayTrade: 500, overnight: 1500, hedged: 150, pointValue: 7, contractSize: "100K" },
  usdChf: { dayTrade: 500, overnight: 1500, hedged: 150, pointValue: 10, contractSize: "100K" }
}
```

---

## 14. STYLING & THEME

### Color Scheme (Dark Theme)
- Background utama: Deep navy (#0a0e1a area)
- Card/panel: Slightly lighter navy
- Primary accent: Indigo/blue (#6366f1 area)
- Text primary: White/light gray
- Text secondary: Medium gray
- Text muted: Dark gray
- Links: Blue/purple highlight

### UI Characteristics
- Dark-only theme (tidak ada light mode toggle di chat)
- Rounded corners (rounded-xl untuk chat bubbles)
- Chat bubbles: user di kanan, assistant di kiri
- Markdown tables dengan border styling
- Code blocks dengan syntax highlighting
- Smooth animations (framer-motion) untuk message appear
- Typewriter effect untuk streaming (18ms per character)
- Quick reply buttons di bawah pesan terakhir assistant

---

## 15. KEY DESIGN DECISIONS

### Mengapa Calculator Engine Terpisah dari LLM?
- **Kecepatan**: Kalkulasi langsung tanpa menunggu API LLM (instant response)
- **Akurasi**: Rumus matematika pasti benar, LLM bisa salah hitung
- **Hemat Token**: Tidak perlu kirim context besar ke LLM untuk hitungan sederhana
- **Konsistensi**: Format output selalu sama

### Mengapa 3-Tier AI Engine?
- **Ollama First**: Lebih murah (free), lebih cepat untuk pertanyaan sederhana
- **OpenAI Fallback**: Lebih pintar untuk pertanyaan kompleks, analisis mendalam
- **Gibberish Check**: Ollama kadang generate text tidak bermakna → perlu validasi

### Mengapa Learned Knowledge Cache?
- Pertanyaan yang sama tidak perlu kirim ke LLM lagi
- Hemat API cost
- Response lebih cepat
- TAPI: Skip cache untuk pertanyaan yang butuh data real-time (harga, analisis, outlook)

### Mengapa Follow-Up Questions?
- Memandu user yang tidak tahu harus tanya apa
- User cukup ketik "1", "2", atau "3" (sangat mudah)
- Meningkatkan engagement dan retensi

### Mengapa Fixed Margin (SPA), Bukan Leverage?
- Sesuai regulasi Bappebti di Indonesia
- SPA (Sistem Perdagangan Alternatif) menggunakan fixed margin per lot
- BERBEDA dengan broker forex retail yang pakai leverage
- Ini adalah fitur edukasi khusus untuk pasar Indonesia

---

## 16. FILE STRUCTURE

```
├── client/
│   └── src/
│       ├── pages/
│       │   ├── ChatPage.tsx          -- Halaman chat utama (~1000 baris)
│       │   └── not-found.tsx         -- 404 page
│       ├── components/
│       │   ├── ChatMessage.tsx       -- Render pesan chat (~360 baris)
│       │   ├── Sidebar.tsx           -- Sidebar navigasi (~112 baris)
│       │   ├── SettingsModal.tsx     -- Modal pengaturan persona (~101 baris)
│       │   └── ui/                   -- shadcn/ui components
│       ├── hooks/
│       │   ├── use-stream-chat.ts    -- SSE streaming hook (~185 baris)
│       │   ├── use-chat.ts           -- Session & persona hooks (~149 baris)
│       │   ├── use-toast.ts          -- Toast notifications
│       │   └── use-mobile.tsx        -- Mobile detection
│       ├── lib/
│       │   ├── queryClient.ts        -- TanStack Query setup
│       │   └── utils.ts              -- cn() utility
│       ├── App.tsx                   -- Root with routing
│       └── index.css                 -- Global styles + Tailwind
├── server/
│   ├── ai-engine.ts                  -- AI engine utama (~1900 baris)
│   ├── calculators.ts                -- Kalkulator trading (~2240 baris)
│   ├── routes.ts                     -- API routes (~385 baris)
│   ├── storage.ts                    -- Database operations
│   ├── newsFetcher.ts                -- News fetching (~151 baris)
│   ├── utils/
│   │   ├── pivotFib.ts               -- Pivot & Fibonacci math
│   │   ├── tradingRules.ts           -- Trading rules table builder
│   │   ├── calendarContext.ts        -- Calendar formatting
│   │   ├── dateUtils.ts              -- Date utilities
│   │   ├── instrumentUtils.ts        -- Instrument detection & mapping
│   │   └── common.ts                 -- Shared utilities
│   └── config/
│       ├── indexMarginConfig.ts      -- Index margin rules
│       ├── commodityMarginConfig.ts  -- Commodity margin rules
│       └── currencyMarginConfig.ts   -- Currency margin rules
├── shared/
│   ├── schema.ts                     -- Drizzle DB schema + Zod types
│   └── routes.ts                     -- API route definitions + validation
├── knowledge/
│   └── core/                         -- 25+ knowledge base files (.md, .yaml)
├── migrations/                       -- Drizzle migration files
└── package.json
```

---

## 17. CARA MEMBANGUN ULANG

### Langkah-langkah:
1. Setup project React + Express + TypeScript + Vite
2. Setup PostgreSQL + Drizzle ORM
3. Buat database schema (personas, sessions, messages, knowledge, feedback)
4. Buat knowledge base files di folder `knowledge/core/`
5. Buat calculator engine (deteksi keyword → hitung → format output)
6. Setup OpenAI client + Ollama client
7. Buat AI engine dengan system prompt builder
8. Buat SSE streaming endpoint
9. Buat image analysis endpoints (chart + statement)
10. Buat frontend chat UI dengan streaming support
11. Buat sidebar dengan session management
12. Implementasi auto-scroll, quick reply, feedback
13. Tambahkan export chat (TXT, MD, PDF)
14. Testing semua kalkulator dan AI responses

### Yang Perlu Disiapkan:
- OpenAI API Key (untuk GPT-4o + Vision)
- PostgreSQL Database
- External API untuk harga real-time (atau buat sendiri)
- External API untuk kalender ekonomi (atau buat sendiri)
- Knowledge base content (markdown files tentang trading)
- Ollama server (opsional, untuk local inference)

---

*Dokumen ini dibuat sebagai blueprint lengkap aplikasi NM AI (Gwen Stacy) dari Newsmaker.id.*
*Gunakan sebagai referensi untuk membangun ulang atau membuat aplikasi serupa.*
