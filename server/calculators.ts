import {
  calcClassic,
  calcWoodie,
  calcCamarilla,
  calcFibUp,
  calcFibDown,
  parseHighLowForFib,
  parseOHLCFromPrompt,
} from "./utils/pivotFib";

import { buildTradingRulesTableThreeCols, GenericMarginConfig } from "./utils/tradingRules";
import { buildCalendarTable, CalendarEventRow } from "./utils/calendarContext";
import { formatDateIso, detectRequestedDate, buildCalendarUrl } from "./utils/dateUtils";
import {
  InstrumentKey,
  INSTRUMENT_LABEL,
  detectInstrumentFromPrompt,
  detectInstrumentsFromPromptMulti,
  pickQuoteForInstrument,
} from "./utils/instrumentUtils";

import { INDEX_MARGIN_CONFIG } from "./config/indexMarginConfig";
import { COMMODITY_MARGIN_CONFIG } from "./config/commodityMarginConfig";
import { CURRENCY_MARGIN_CONFIG } from "./config/currencyMarginConfig";
import { fetchNews, formatNewsForChat } from "./newsFetcher";

const QUOTES_API_URL = process.env.QUOTES_API_URL || "https://endpoapi-production-3202.up.railway.app/api/live-quotes";
const CALENDAR_API_URL = process.env.CALENDAR_API_URL || "https://endpoapi-production-3202.up.railway.app/api/calendar/this-week";

export interface CalculatorResult {
  handled: boolean;
  reply?: string;
}

export async function handleCalculation(userPrompt: string): Promise<CalculatorResult> {
  const lowerPrompt = userPrompt.toLowerCase();

  if (isTradingRulesTableQuestion(lowerPrompt)) {
    return { handled: true, reply: buildTradingRulesTable() };
  }

  if (isTradingRulesQuestion(lowerPrompt)) {
    return { handled: true, reply: buildTradingRulesNarrative() };
  }

  const fibResult = handleFibonacci(userPrompt, lowerPrompt);
  if (fibResult) return { handled: true, reply: fibResult };

  const pivotResult = handlePivot(userPrompt, lowerPrompt);
  if (pivotResult) return { handled: true, reply: pivotResult };

  if (isCalendarQuestion(lowerPrompt)) {
    const calendarReply = await handleCalendar(userPrompt, lowerPrompt);
    if (calendarReply) return { handled: true, reply: calendarReply };
  }

  if (isPriceQuestion(lowerPrompt)) {
    const priceReply = await handlePriceQuote(userPrompt);
    if (priceReply) return { handled: true, reply: priceReply };
  }

  if (isKetahananQuestion(lowerPrompt)) {
    const ketahananReply = await handleKetahananCalculation(userPrompt);
    if (ketahananReply) return { handled: true, reply: ketahananReply };
  }

  if (isMarginQuestion(lowerPrompt)) {
    const marginReply = await handleMarginCalculation(userPrompt);
    if (marginReply) return { handled: true, reply: marginReply };
  }

  if (isRiskRewardQuestion(lowerPrompt)) {
    const rrReply = handleRiskRewardCalculation(userPrompt);
    if (rrReply) return { handled: true, reply: rrReply };
  }

  if (isBreakevenQuestion(lowerPrompt)) {
    const beReply = handleBreakevenCalculation(userPrompt);
    if (beReply) return { handled: true, reply: beReply };
  }

  if (isPositionSizeQuestion(lowerPrompt)) {
    const psReply = handlePositionSizeCalculation(userPrompt);
    if (psReply) return { handled: true, reply: psReply };
  }

  return { handled: false };
}

function isTradingRulesQuestion(lowerPrompt: string): boolean {
  return lowerPrompt.includes("trading rules") ||
    lowerPrompt.includes("trading rule") ||
    lowerPrompt.includes("aturan trading") ||
    lowerPrompt.includes("regulasi trading");
}

function isTradingRulesTableQuestion(lowerPrompt: string): boolean {
  return isTradingRulesQuestion(lowerPrompt) &&
    (lowerPrompt.includes("tabel") || lowerPrompt.includes("table"));
}

function isCalendarQuestion(lowerPrompt: string): boolean {
  return lowerPrompt.includes("kalender ekonomi") ||
    lowerPrompt.includes("economic calendar") ||
    lowerPrompt.includes("calendar ekonomi") ||
    lowerPrompt.includes("jadwal berita") ||
    lowerPrompt.includes("kalender hari ini") ||
    lowerPrompt.includes("calendar hari ini") ||
    (lowerPrompt.includes("kalender") && (lowerPrompt.includes("hari ini") || lowerPrompt.includes("besok") || lowerPrompt.includes("minggu ini")));
}

function isPriceQuestion(lowerPrompt: string): boolean {
  if (lowerPrompt.includes("margin") || lowerPrompt.includes("leverage")) {
    return false;
  }
  
  const priceKeywords = [
    "berapa harga", "harga berapa", "harga sekarang",
    "harga emas", "harga gold", "harga xau", "harga xauusd",
    "harga perak", "harga silver", "harga minyak", "harga oil",
    "harga hangseng", "harga hsi", "harga nikkei",
    "harga eurusd", "harga gbpusd", "harga usdjpy", "harga audusd",
    "price ", "quote ", "quotes",
    "xau berapa", "gold berapa", "emas berapa",
    "silver berapa", "perak berapa", "oil berapa", "minyak berapa"
  ];
  
  return priceKeywords.some(kw => lowerPrompt.includes(kw));
}

function isKetahananQuestion(lowerPrompt: string): boolean {
  return lowerPrompt.includes("ketahanan") || 
    (lowerPrompt.includes("berapa") && lowerPrompt.includes("kuat") && lowerPrompt.includes("lot"));
}

function isMarginQuestion(lowerPrompt: string): boolean {
  // Exclude pivot and fibonacci questions
  if (lowerPrompt.includes("pivot") || lowerPrompt.includes("fibonacci") || lowerPrompt.includes("fibo")) {
    return false;
  }
  // Exclude ketahanan questions - they have dedicated handler
  if (isKetahananQuestion(lowerPrompt)) {
    return false;
  }
  // Exclude risk reward questions
  if (lowerPrompt.includes("risk") && lowerPrompt.includes("reward")) {
    return false;
  }
  // Exclude breakeven questions
  if (lowerPrompt.includes("breakeven") || lowerPrompt.includes("balik modal") || lowerPrompt.includes("impas")) {
    return false;
  }
  // Exclude position size questions
  if (lowerPrompt.includes("position size") || lowerPrompt.includes("ukuran posisi")) {
    return false;
  }
  
  const hasMarginKeyword = lowerPrompt.includes("margin") || 
    lowerPrompt.includes("simulasi") ||
    (lowerPrompt.includes("hitung") && (lowerPrompt.includes("lot") || lowerPrompt.includes("margin"))) ||
    lowerPrompt.includes("kalkulasi");
  
  const hasLotDanaQuestion = (lowerPrompt.includes("lot") || lowerPrompt.includes("dana") || lowerPrompt.includes("modal")) &&
    (lowerPrompt.includes("berapa") || lowerPrompt.includes("brp") || lowerPrompt.includes("masuk") || lowerPrompt.includes("punya"));
  
  const hasInstrument = lowerPrompt.includes("xauusd") ||
    lowerPrompt.includes("emas") ||
    lowerPrompt.includes("gold") ||
    lowerPrompt.includes("xau") ||
    lowerPrompt.includes("xag") ||
    lowerPrompt.includes("silver") ||
    lowerPrompt.includes("perak") ||
    lowerPrompt.includes("bco") ||
    lowerPrompt.includes("oil") ||
    lowerPrompt.includes("minyak") ||
    lowerPrompt.includes("hangseng") ||
    lowerPrompt.includes("hang seng") ||
    lowerPrompt.includes("hsi") ||
    lowerPrompt.includes("hongkong") ||
    lowerPrompt.includes("nikkei") ||
    lowerPrompt.includes("jp225") ||
    lowerPrompt.includes("gbpusd") ||
    lowerPrompt.includes("eurusd") ||
    lowerPrompt.includes("audusd") ||
    lowerPrompt.includes("usdjpy") ||
    lowerPrompt.includes("usdchf") ||
    lowerPrompt.includes("forex") ||
    lowerPrompt.includes("lot");
  
  return (hasMarginKeyword && hasInstrument) || hasLotDanaQuestion;
}

function buildTradingRulesTable(): string {
  const indexTableMd = buildTradingRulesTableThreeCols("Index & Global Index", INDEX_MARGIN_CONFIG as GenericMarginConfig);
  const commodityTableMd = buildTradingRulesTableThreeCols("Commodity (Gold, Silver, Oil)", COMMODITY_MARGIN_CONFIG as GenericMarginConfig);
  const currencyTableMd = buildTradingRulesTableThreeCols("Currency (Forex Pairs)", CURRENCY_MARGIN_CONFIG as GenericMarginConfig);

  return `# Trading Rules NM Standard

### 1. Index & Global Index
${indexTableMd}

---

### 2. Commodity (Gold, Silver, Oil)
${commodityTableMd}

---

### 3. Currency (Forex Pairs)
${currencyTableMd}

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Hitung margin untuk 2 lot gold"
2. "Berapa lot ideal untuk modal $10,000?"
3. "Jelaskan apa itu margin call"

---
*NM Ai - Newsmaker.id*
*Informasi bersifat edukatif, bukan saran investasi.*`;
}

function buildTradingRulesNarrative(): string {
  return `# Trading Rules NM Standard

## Dasar Regulasi
Berdasarkan:
- Peraturan BAPPEBTI No. 6 Tahun 2023
- Peraturan Kepala Bappebti No. 5 Tahun 2017

## Pokok Aturan SPA

**Definisi SPA**
Transaksi derivatif di luar Bursa Berjangka yang dilakukan secara bilateral, dengan margin dan kliring di Lembaga Kliring Berjangka.

**Jenis Kontrak**
- Rolling Contract: diperpanjang otomatis setiap hari
- Day Trading: posisi dibuka dan ditutup di hari yang sama
- Overnight Trading: posisi ditahan ke hari berikutnya (kena biaya storage + PPN 11%)

**Margin**
- Deposit Margin: minimal USD 10.000
- Initial Margin: jaminan awal sesuai produk
- Maintenance Margin: 70% dari Initial Margin
- Margin Call: ketika dana < 70% Initial Margin
- Auto Liquidation: saat dana ≤ 30% Initial Margin

**Jenis Order**
- Market Order (MO): eksekusi di harga terbaik tersedia
- Limit Order (LO): harga lebih baik dari pasar
- Stop Order (SO): untuk membatasi kerugian
- OCO: kombinasi Limit & Stop

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Hitung margin untuk 3 lot gold"
2. "Apa itu auto liquidation?"
3. "Simulasi trading dengan modal $5,000"

---
*NM Ai - Newsmaker.id*
*Informasi bersifat edukatif, bukan saran investasi.*`;
}

function handleFibonacci(userPrompt: string, lowerPrompt: string): string | null {
  if (!lowerPrompt.includes("fibo") && !lowerPrompt.includes("fibonacci")) return null;

  const HL = parseHighLowForFib(userPrompt);
  if (!HL) {
    // Return instruction when fibonacci is requested but no data
    return `# Fibonacci Calculator

Untuk menghitung level Fibonacci, saya butuh data High dan Low.

**Format:**
\`\`\`
Hitung fibonacci high 2680 low 2640
\`\`\`

**Keterangan:**
- **High**: Harga tertinggi periode
- **Low**: Harga terendah periode
- Tambahkan "downtrend" untuk proyeksi turun

**Level yang dihitung:**
- Retracement: 23.6%, 38.2%, 50%, 61.8%, 78.6%
- Projection: 138.2%, 150%, 161.8%, 200%, 238.2%

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Hitung fibonacci high 2680 low 2640"
2. "Hitung pivot OHLC 2650, 2680, 2640, 2670"
3. "Tampilkan harga gold sekarang"

---
*NM Ai - Newsmaker.id*`;
  }

  const { H, L } = HL;
  const isDownTrend = /downtren|downtrend|tren turun|turun/.test(lowerPrompt);
  const mode = isDownTrend ? "down" : "up";
  
  // Detect if user wants retracement only or projection only
  const wantsRetracement = /retrace|retracement|retr/.test(lowerPrompt);
  const wantsProjection = /project|projection|proj|extension|ext/.test(lowerPrompt);
  
  // If neither specified, show both. If one specified, show only that one.
  const showRetracement = !wantsProjection || wantsRetracement;
  const showProjection = !wantsRetracement || wantsProjection;
  
  const up = calcFibUp({ H, L });
  const down = calcFibDown({ H, L });
  const D = H - L;
  
  const fmt = (n: number) => n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let result = `## Fibonacci ${mode === "down" ? "Downtrend" : "Uptrend"}${wantsRetracement && !wantsProjection ? " - Retracement" : ""}${wantsProjection && !wantsRetracement ? " - Projection" : ""}

- **Price (A)**: ${mode === "down" ? fmt(H) : fmt(L)}
- **Price (B)**: ${mode === "down" ? fmt(L) : fmt(H)}
- **Range**: ${fmt(D)}

`;

  // Uptrend: 23.60% to 78.60%, Downtrend: 78.60% to 23.60%
  const upLevels = ["23.60%", "38.20%", "50.00%", "61.80%", "78.60%"];
  const downLevels = ["78.60%", "61.80%", "50.00%", "38.20%", "23.60%"];
  const projLevels = ["138.20%", "150.00%", "161.80%", "200.00%", "238.20%", "261.80%"];
  
  const retrLevels = mode === "down" ? downLevels : upLevels;
  const data = mode === "down" ? down : up;
  
  // Show only retracement
  if (showRetracement && !showProjection) {
    result += `| Retracement | Level |
|-------------|-------|
`;
    for (const level of retrLevels) {
      result += `| ${level} | ${fmt(data.retr[level])} |\n`;
    }
  }
  // Show only projection
  else if (showProjection && !showRetracement) {
    result += `| Projection | Level |
|------------|-------|
`;
    for (const level of projLevels) {
      result += `| ${level} | ${fmt(data.proj[level])} |\n`;
    }
  }
  // Show both (default)
  else {
    result += `| Retracement | Level | Projection | Level |
|-------------|-------|------------|-------|
`;
    for (let i = 0; i < Math.max(retrLevels.length, projLevels.length); i++) {
      const retrLevel = retrLevels[i] || "";
      const retrValue = retrLevel ? fmt(data.retr[retrLevel]) : "";
      const projLevel = projLevels[i] || "";
      const projValue = projLevel ? fmt(data.proj[projLevel]) : "";
      result += `| ${retrLevel} | ${retrValue} | ${projLevel} | ${projValue} |\n`;
    }
  }

  result += `\n💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Hitung pivot point dengan data OHLC"
2. "Berapa margin untuk 2 lot gold?"
3. "Kalender ekonomi hari ini"

---
*NM Ai - Newsmaker.id*`;
  return result;
}

function handlePivot(userPrompt: string, lowerPrompt: string): string | null {
  if (!lowerPrompt.includes("pivot")) return null;

  const ohlc = parseOHLCFromPrompt(userPrompt);
  if (!ohlc) {
    // Return instruction when pivot is requested but no OHLC data
    return `# Pivot Point Calculator

Untuk menghitung pivot point, saya butuh data OHLC (Open, High, Low, Close).

**Format:**
\`\`\`
Hitung pivot point OHLC 2650, 2680, 2640, 2670
\`\`\`

**Keterangan:**
- **Open**: Harga pembukaan
- **High**: Harga tertinggi
- **Low**: Harga terendah  
- **Close**: Harga penutupan

**Metode yang tersedia:**
- Classic Pivot
- Woodie Pivot
- Camarilla Pivot

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Hitung pivot OHLC 2650, 2680, 2640, 2670"
2. "Hitung fibonacci high 2680 low 2640"
3. "Tampilkan harga gold sekarang"

---
*NM Ai - Newsmaker.id*`;
  }

  const { O, H, L, C } = ohlc;
  const classic = calcClassic({ H, L, C });
  const woodie = calcWoodie({ O, H, L });
  const camarilla = calcCamarilla({ H, L, C });

  const fmt = (n: number) => n.toFixed(2);

  return `## Pivot Point Calculation

- **Open**: ${fmt(O)}
- **High**: ${fmt(H)}
- **Low**: ${fmt(L)}
- **Close**: ${fmt(C)}

| Level | Classic | Woodie | Camarilla |
|-------|---------|--------|-----------|
| R4 | ${fmt(classic.R4)} | ${fmt(woodie.R4)} | ${fmt(camarilla.R4)} |
| R3 | ${fmt(classic.R3)} | ${fmt(woodie.R3)} | ${fmt(camarilla.R3)} |
| R2 | ${fmt(classic.R2)} | ${fmt(woodie.R2)} | ${fmt(camarilla.R2)} |
| R1 | ${fmt(classic.R1)} | ${fmt(woodie.R1)} | ${fmt(camarilla.R1)} |
| Pivot | ${fmt(classic.P)} | ${fmt(woodie.P)} | ${fmt(camarilla.P)} |
| S1 | ${fmt(classic.S1)} | ${fmt(woodie.S1)} | ${fmt(camarilla.S1)} |
| S2 | ${fmt(classic.S2)} | ${fmt(woodie.S2)} | ${fmt(camarilla.S2)} |
| S3 | ${fmt(classic.S3)} | ${fmt(woodie.S3)} | ${fmt(camarilla.S3)} |
| S4 | ${fmt(classic.S4)} | ${fmt(woodie.S4)} | ${fmt(camarilla.S4)} |

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Hitung fibonacci dengan high low ini"
2. "Berapa lot ideal untuk modal $10,000?"
3. "Tampilkan harga gold sekarang"

---
*NM Ai - Newsmaker.id*`;
}

async function handleCalendar(userPrompt: string, lowerPrompt: string): Promise<string | null> {
  try {
    const nowJakarta = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const todayIso = formatDateIso(nowJakarta);
    const targetDate = detectRequestedDate(userPrompt) || todayIso;
    
    const calendarUrl = buildCalendarUrl(CALENDAR_API_URL, targetDate);
    const response = await fetch(calendarUrl, { method: "GET", cache: "no-store" });
    
    if (!response.ok) {
      console.error("Calendar API not ok:", response.status);
      return `# Kalender Ekonomi

⚠️ **Maaf, data kalender sedang tidak tersedia.**

Server kalender ekonomi sedang dalam pemeliharaan atau mengalami gangguan sementara.

**Alternatif:**
- Kunjungi [newsmaker.id](https://newsmaker.id) untuk jadwal berita ekonomi

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Harga gold sekarang berapa?"
2. "Hitung margin untuk 2 lot gold"
3. "Jelaskan tentang high impact news"

---
*NM Ai - Newsmaker.id*`;
    }
    
    const data = await response.json();
    const events = Array.isArray(data.data) ? data.data.slice(0, 20) : [];
    
    if (events.length === 0) {
      return `# Kalender Ekonomi (${targetDate})

Tidak ada event ekonomi terdaftar untuk tanggal ini.

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Kalender ekonomi minggu ini"
2. "Tampilkan berita terbaru"
3. "Harga gold sekarang berapa?"

---
*NM Ai - Newsmaker.id*`;
    }

    const wantsHighImpact = lowerPrompt.includes("high impact") || lowerPrompt.includes("dampak tinggi");
    const filtered = wantsHighImpact 
      ? events.filter((e: any) => e.impact?.includes("★★★") || e.impact?.toLowerCase().includes("high"))
      : events;

    const calendarTable = buildCalendarTable(filtered.map((ev: any) => ({
      date: targetDate,
      time: ev.time ?? "-",
      currency: ev.currency ?? "-",
      impact: ev.impact ?? "-",
      event: ev.event ?? "-",
      previous: ev.previous ?? "-",
      forecast: ev.forecast ?? "-",
      actual: ev.actual ?? "",
    })));

    // Fetch latest news to show below calendar
    let newsSection = "";
    try {
      const news = await fetchNews();
      if (news && news.length > 0) {
        newsSection = `\n---\n\n## Berita Terkini\n\n`;
        const limitedNews = news.slice(0, 3);
        limitedNews.forEach((item, index) => {
          // Use publishedAt directly as string since API already provides formatted WIB time
          const dateStr = item.publishedAt || "";
          newsSection += `**${index + 1}. ${item.title}** `;
          if (item.excerpt) {
            newsSection += `${item.excerpt.slice(0, 100)}... `;
          }
          newsSection += `*${dateStr} WIB* | ${item.category || "Market"}`;
          if (item.url) {
            newsSection += ` [Baca selengkapnya](${item.url})`;
          }
          newsSection += `\n\n`;
        });
      }
    } catch (newsErr) {
      console.error("News fetch for calendar failed:", newsErr);
    }

    return `# Kalender Ekonomi (${targetDate})

${calendarTable}
${newsSection}
💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Tampilkan harga gold sekarang"
2. "Berapa lot ideal untuk modal $10,000?"
3. "Jelaskan cara baca dampak berita ekonomi"

---
*Sumber: Newsmaker.id - Berita trading & investasi terpercaya*

Untuk update real-time, kunjungi:
- Website: [Newsmaker.id](https://newsmaker.id)
- TikTok: [@newsmaker23_talk](https://tiktok.com/@newsmaker23_talk)

*NM Ai - Newsmaker.id*`;
  } catch (err) {
    console.error("Calendar fetch error:", err);
    return `# Kalender Ekonomi

⚠️ **Maaf, data kalender sedang tidak tersedia.**

Server kalender ekonomi sedang dalam pemeliharaan atau mengalami gangguan sementara.

**Alternatif:**
- Kunjungi [newsmaker.id](https://newsmaker.id) untuk jadwal berita ekonomi

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Harga gold sekarang berapa?"
2. "Hitung margin untuk 2 lot gold"
3. "Jelaskan tentang high impact news"

---
*NM Ai - Newsmaker.id*`;
  }
}

async function handlePriceQuote(userPrompt: string): Promise<string | null> {
  try {
    const response = await fetch(QUOTES_API_URL, { method: "GET", cache: "no-store" });
    if (!response.ok) {
      console.error("Quote API not ok:", response.status);
      return `# Harga Real-Time

⚠️ **Maaf, data harga sedang tidak tersedia.**

Server harga sedang dalam pemeliharaan atau mengalami gangguan sementara.

**Alternatif:**
- Cek langsung di platform trading Anda
- Kunjungi [newsmaker.id](https://newsmaker.id) untuk update terbaru

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Hitung margin untuk 2 lot gold"
2. "Kalender ekonomi hari ini"
3. "Jelaskan trading rules SPA"

---
*NM Ai - Newsmaker.id*`;
    }

    const data = await response.json();
    const quotes = Array.isArray(data.data) ? data.data : [];
    const updatedAt = data.updatedAt ? new Date(data.updatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "-";
    
    const instrument = detectInstrumentFromPrompt(userPrompt);
    const quote = pickQuoteForInstrument(quotes, instrument);
    
    if (!quote) {
      const allSymbols = quotes.map((q: any) => q.symbol).join(", ");
      return `Maaf, data harga untuk instrumen tersebut tidak tersedia saat ini.

Instrumen yang tersedia: ${allSymbols}

---
*NM Ai - Newsmaker.id*`;
    }

    const label = INSTRUMENT_LABEL[instrument] || { name: quote.symbol, unit: "unit" };
    const change = quote.valueChange >= 0 ? `+${quote.valueChange}` : `${quote.valueChange}`;
    const pctChange = quote.percentChange >= 0 ? `+${quote.percentChange}%` : `${quote.percentChange}%`;
    
    return `# Harga ${label.name} (${quote.symbol})

| Data | Nilai |
|------|-------|
| Last | **${quote.last}** |
| High | ${quote.high || "-"} |
| Low | ${quote.low || "-"} |
| Open | ${quote.open || "-"} |
| Prev Close | ${quote.prevClose || "-"} |
| Change | ${change} (${pctChange}) |

*Update terakhir: ${updatedAt}*
*Data dari sistem Newsmaker, bersifat indikatif.*

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Hitung margin untuk 2 lot ${label.name}"
2. "Kalender ekonomi hari ini"
3. "Berapa lot ideal untuk modal saya?"

---
*NM Ai - Newsmaker.id*`;
  } catch (err) {
    console.error("Quote fetch error:", err);
    return `# Harga Real-Time

⚠️ **Maaf, terjadi kesalahan saat mengambil data harga.**

Silakan coba lagi dalam beberapa saat.

**Alternatif:**
- Cek langsung di platform trading Anda
- Kunjungi [newsmaker.id](https://newsmaker.id) untuk update terbaru

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Hitung margin untuk 2 lot gold"
2. "Kalender ekonomi hari ini"
3. "Jelaskan trading rules SPA"

---
*NM Ai - Newsmaker.id*`;
  }
}

async function fetchRealTimePrice(symbol: string): Promise<number | null> {
  try {
    const response = await fetch(QUOTES_API_URL, { method: "GET", cache: "no-store" });
    if (!response.ok) return null;
    
    const data = await response.json();
    const quotes = Array.isArray(data.data) ? data.data : [];
    
    const symbolUpper = symbol.toUpperCase();
    
    // Find quote matching the specific symbol based on actual API response format
    // API returns: XUL10 (Gold), BCO10_BBJ (Oil), HKK50_BBJ (HSI), JPK50_BBJ (Nikkei)
    // AU10F_BBJ (AUDUSD), EU10F_BBJ (EURUSD), GU10F_BBJ (GBPUSD), UC10F_BBJ (USDCHF), UJ10F_BBJ (USDJPY)
    const quote = quotes.find((q: any) => {
      const qSymbol = (q.symbol || "").toUpperCase();
      
      // Commodities - match actual API symbols
      if (symbolUpper === "XAU" || symbolUpper === "GOLD") {
        return qSymbol.includes("XUL") || qSymbol.includes("XAU") || qSymbol.includes("GOLD");
      }
      if (symbolUpper === "XAG" || symbolUpper === "SILVER") {
        return qSymbol.includes("XAG") || qSymbol.includes("SILVER") || qSymbol.includes("LSI");
      }
      if (symbolUpper === "BCO" || symbolUpper === "OIL") {
        return qSymbol.includes("BCO");
      }
      // Indices - match actual API symbols
      if (symbolUpper === "HSI") {
        return qSymbol.includes("HKK50") || qSymbol.includes("HSI");
      }
      if (symbolUpper === "NKD" || symbolUpper === "NIKKEI" || symbolUpper === "JP225") {
        return qSymbol.includes("JPK50") || qSymbol.includes("JPN");
      }
      // Forex pairs - match actual API symbols (GU, EU, AU, UJ, UC format)
      if (symbolUpper === "GBP") {
        return qSymbol.includes("GU10") || qSymbol.includes("GBPUSD");
      }
      if (symbolUpper === "EUR") {
        return qSymbol.includes("EU10") || qSymbol.includes("EURUSD");
      }
      if (symbolUpper === "AUD") {
        return qSymbol.includes("AU10") || qSymbol.includes("AUDUSD");
      }
      if (symbolUpper === "JPY") {
        return qSymbol.includes("UJ10") || qSymbol.includes("USDJPY");
      }
      if (symbolUpper === "CHF") {
        return qSymbol.includes("UC10") || qSymbol.includes("USDCHF");
      }
      
      // Default: check if symbol is contained
      return qSymbol.includes(symbolUpper);
    });
    
    if (quote && quote.last) {
      return parseFloat(quote.last);
    }
    return null;
  } catch (err) {
    console.error("Failed to fetch real-time price:", err);
    return null;
  }
}

async function handleMarginCalculation(userPrompt: string): Promise<string | null> {
  const lowerPrompt = userPrompt.toLowerCase();
  
  // IMPORTANT: Check Gold (XAU) FIRST before other instruments to avoid false matches
  const isGold = lowerPrompt.includes("xauusd") || lowerPrompt.includes("xau") || lowerPrompt.includes("gold") || lowerPrompt.includes("emas");
  const isXAG = lowerPrompt.includes("xag") || lowerPrompt.includes("silver") || lowerPrompt.includes("perak");
  const isBCO = lowerPrompt.includes("bco") || lowerPrompt.includes("oil") || lowerPrompt.includes("minyak") || lowerPrompt.includes("brent");
  const isHSI = lowerPrompt.includes("hangseng") || lowerPrompt.includes("hang seng") || lowerPrompt.includes("hsi") || lowerPrompt.includes("hongkong") || lowerPrompt.includes("hk50");
  const isNikkei = lowerPrompt.includes("nikkei") || lowerPrompt.includes("jp225") || lowerPrompt.includes("jepang") || lowerPrompt.includes("japan");
  const isGBPUSD = lowerPrompt.includes("gbpusd") || lowerPrompt.includes("pound");
  const isEURUSD = lowerPrompt.includes("eurusd") || lowerPrompt.includes("euro");
  // AUDUSD: Must NOT match if XAU is present (avoid xau matching "au")
  const isAUDUSD = !isGold && (lowerPrompt.includes("audusd") || lowerPrompt.includes("aussie") || (lowerPrompt.includes(" au ") || lowerPrompt.endsWith(" au") || lowerPrompt.startsWith("au ")));
  const isUSDJPY = lowerPrompt.includes("usdjpy") || lowerPrompt.includes("yen");
  const isUSDCHF = lowerPrompt.includes("usdchf") || lowerPrompt.includes("swiss");
  const isForex = isGBPUSD || isEURUSD || isAUDUSD || isUSDJPY || isUSDCHF;
  const isIndex = isHSI || isNikkei;
  
  let instrumentName = "XAUUSD (Gold)";
  let tradeCode = "XUL10 / XULF";
  let contractSize = 100;
  let pointValue = 100;
  let minPriceMovement = "$0.01";
  let symbol = "XAU";
  let contractUnit = "Troy Ounce";
  let pointLabel = "poin";
  
  if (isXAG) {
    instrumentName = "XAGUSD (Silver)";
    tradeCode = "XAG10_BBJ / XAGF_BBJ";
    contractSize = 5000;
    pointValue = 50;
    minPriceMovement = "$0.001";
    symbol = "XAG";
    contractUnit = "Troy Ounce";
  } else if (isBCO) {
    instrumentName = "Brent Crude Oil";
    tradeCode = "BCO10_BBJ / BCOF_BBJ";
    contractSize = 1000;
    pointValue = 10;
    minPriceMovement = "$0.01";
    symbol = "BCO";
    contractUnit = "USD per Barrel";
  } else if (isHSI) {
    instrumentName = "Hang Seng Index (HK50)";
    tradeCode = "HKK50_BBJ / HKK5U_BBJ";
    contractSize = 5;
    pointValue = 5;
    minPriceMovement = "1 point";
    symbol = "HSI";
    contractUnit = "USD/point";
    pointLabel = "point";
  } else if (isNikkei) {
    instrumentName = "Nikkei 225 (JP225)";
    tradeCode = "JPK50_BBJ / JPK5U_BBJ";
    contractSize = 5;
    pointValue = 5;
    minPriceMovement = "5 points";
    symbol = "NKD";
    contractUnit = "USD/point";
    pointLabel = "point";
  } else if (isGBPUSD) {
    instrumentName = "GBPUSD (Pound)";
    tradeCode = "GU1010_BBJ / GU10F_BBJ";
    contractSize = 100000;
    pointValue = 10;
    minPriceMovement = "0.0001 (1 pip)";
    symbol = "GBP";
    contractUnit = "GBP";
    pointLabel = "pip";
  } else if (isEURUSD) {
    instrumentName = "EURUSD (Euro)";
    tradeCode = "EU1010_BBJ / EU10F_BBJ";
    contractSize = 100000;
    pointValue = 10;
    minPriceMovement = "0.0001 (1 pip)";
    symbol = "EUR";
    contractUnit = "EUR";
    pointLabel = "pip";
  } else if (isAUDUSD) {
    instrumentName = "AUDUSD (Aussie)";
    tradeCode = "AU1010_BBJ / AU10F_BBJ";
    contractSize = 100000;
    pointValue = 10;
    minPriceMovement = "0.0001 (1 pip)";
    symbol = "AUD";
    contractUnit = "AUD";
    pointLabel = "pip";
  } else if (isUSDJPY) {
    instrumentName = "USDJPY (Yen)";
    tradeCode = "UJ1010_BBJ / UJ10F_BBJ";
    contractSize = 100000;
    pointValue = 7;
    minPriceMovement = "0.01 (1 pip)";
    symbol = "JPY";
    contractUnit = "USD";
    pointLabel = "pip";
  } else if (isUSDCHF) {
    instrumentName = "USDCHF (Swiss)";
    tradeCode = "UC1010_BBJ / UC10F_BBJ";
    contractSize = 100000;
    pointValue = 10;
    minPriceMovement = "0.0001 (1 pip)";
    symbol = "CHF";
    contractUnit = "USD";
    pointLabel = "pip";
  }
  
  const danaMatch = userPrompt.match(/\$\s*([\d,]+(?:\.\d+)?)\s*k?/i) ||
    userPrompt.match(/([\d,]+(?:\.\d+)?)\s*(?:k|ribu|juta|jt)?\s*(?:dollar|dolar|usd)/i) ||
    userPrompt.match(/dana\s*([\d,]+)/i) ||
    userPrompt.match(/modal\s*([\d,]+)/i) ||
    userPrompt.match(/punya\s*([\d,]+)/i);
  
  let dana = 0;
  if (danaMatch) {
    let rawDana = parseFloat(danaMatch[1].replace(/,/g, ""));
    if (lowerPrompt.includes("k") && rawDana < 1000) rawDana *= 1000;
    dana = rawDana;
  }
  
  const lotMatch = userPrompt.match(/(\d+(?:\.\d+)?)\s*lot/i);
  const lot = lotMatch ? parseFloat(lotMatch[1]) : (dana > 0 ? Math.floor(dana / 1000) : 1);
  
  const isOvernight = lowerPrompt.includes("overnight") || lowerPrompt.includes("swing");
  
  const marginPerLot = 1000;
  const totalMargin = marginPerLot * lot;
  const maintenanceMargin = totalMargin * 0.7;
  const autoLiquidation = totalMargin * 0.3;
  const facilityFee = 30 * lot;
  
  let currentPrice = await fetchRealTimePrice(symbol);
  let priceSource = "real-time";
  
  if (!currentPrice) {
    if (isXAG) currentPrice = 30;
    else if (isBCO) currentPrice = 75;
    else if (isHSI) currentPrice = 19800;
    else if (isNikkei) currentPrice = 39000;
    else if (isGBPUSD) currentPrice = 1.2700;
    else if (isEURUSD) currentPrice = 1.0400;
    else if (isAUDUSD) currentPrice = 0.6200;
    else if (isUSDJPY) currentPrice = 157.00;
    else if (isUSDCHF) currentPrice = 0.9000;
    else currentPrice = 2650;
    priceSource = "estimasi";
  }
  
  const contractValue = isIndex ? (currentPrice * pointValue * lot) : (currentPrice * contractSize * lot);
  
  const effectiveMargin = dana > 0 ? dana - totalMargin : 0;
  const maxLots = dana > 0 ? Math.floor(dana / marginPerLot) : 0;
  const idealLotMin = dana > 0 ? Math.max(1, Math.floor(maxLots * 0.1)) : 0;
  const idealLotMax = dana > 0 ? Math.max(1, Math.floor(maxLots * 0.2)) : 0;
  const mediumLotMin = dana > 0 ? Math.max(1, Math.floor(maxLots * 0.3)) : 0;
  const mediumLotMax = dana > 0 ? Math.max(1, Math.floor(maxLots * 0.4)) : 0;
  const recommendedLots = dana > 0 ? idealLotMax : lot;
  
  const idealBuffer = dana - (idealLotMax * marginPerLot);
  const idealKetahanan = Math.floor(idealBuffer / (idealLotMax * pointValue));
  const mediumBuffer = dana - (mediumLotMax * marginPerLot);
  const mediumKetahanan = Math.floor(mediumBuffer / (mediumLotMax * pointValue));
  
  const danaSection = dana > 0 ? `## Analisis Dana Anda: $${dana.toLocaleString()} (Rp ${(dana * 10000).toLocaleString()})

| Parameter | Nilai |
|-----------|-------|
| Kapasitas Maksimal | ${maxLots} lot |
| **IDEAL (Low Risk)** | **${idealLotMin}-${idealLotMax} lot** (10-20%) |
| **MEDIUM Risk** | **${mediumLotMin}-${mediumLotMax} lot** (30-40%) |

### Rekomendasi Berdasarkan Risk Profile

| Risk Level | Lot | Margin Used | Buffer | Ketahanan |
|------------|-----|-------------|--------|-----------|
| **IDEAL** | ${idealLotMax} lot | $${(idealLotMax * marginPerLot).toLocaleString()} | $${idealBuffer.toLocaleString()} | ~${idealKetahanan} ${pointLabel} |
| **MEDIUM** | ${mediumLotMax} lot | $${(mediumLotMax * marginPerLot).toLocaleString()} | $${mediumBuffer.toLocaleString()} | ~${mediumKetahanan} ${pointLabel} |

> **IDEAL** = risiko rendah, ketahanan tinggi, cocok untuk pemula atau kondisi market tidak pasti.

` : "";

  const priceDecimals = isForex ? 4 : (isUSDJPY ? 2 : 2);
  const priceDisplay = isForex ? currentPrice.toFixed(priceDecimals) : currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2 });
  
  return `# Simulasi Trading ${instrumentName}

## Aturan Dasar SPA
| Parameter | Nilai |
|-----------|-------|
| **1 LOT** | **$1,000** (setara Rp 10 Juta) |
| **1 ${pointLabel}** | **$${pointValue}/lot** |
| Fee Transaksi | $30/lot (buka + tutup) |

## Spesifikasi Kontrak
| Parameter | Nilai |
|-----------|-------|
| Trade Code | ${tradeCode} |
| Contract Size | ${contractSize.toLocaleString()} ${contractUnit} |
| Min Price Movement | ${minPriceMovement} |
| Harga Saat Ini (${priceSource}) | **${isForex || isIndex ? "" : "$"}${priceDisplay}** |

${danaSection}## Simulasi untuk ${dana > 0 ? recommendedLots : lot} LOT
| Komponen | Perhitungan | Nilai |
|----------|-------------|-------|
| Initial Margin | ${dana > 0 ? recommendedLots : lot} lot × $1,000 | **$${((dana > 0 ? recommendedLots : lot) * marginPerLot).toLocaleString()}** |
| Maintenance Margin (70%) | $${((dana > 0 ? recommendedLots : lot) * marginPerLot).toLocaleString()} × 70% | $${((dana > 0 ? recommendedLots : lot) * marginPerLot * 0.7).toLocaleString()} |
| Auto Liquidation (30%) | $${((dana > 0 ? recommendedLots : lot) * marginPerLot).toLocaleString()} × 30% | $${((dana > 0 ? recommendedLots : lot) * marginPerLot * 0.3).toLocaleString()} |
| Fee Transaksi | ${dana > 0 ? recommendedLots : lot} lot × $30 | $${((dana > 0 ? recommendedLots : lot) * 30).toLocaleString()} |

## Contoh Perhitungan Profit/Loss (${dana > 0 ? recommendedLots : lot} lot)
| Pergerakan | Gross P/L | Net P/L (setelah fee) |
|------------|-----------|----------------------|
| +1 ${pointLabel} | +$${(pointValue * (dana > 0 ? recommendedLots : lot)).toLocaleString()} | +$${(pointValue * (dana > 0 ? recommendedLots : lot) - (dana > 0 ? recommendedLots : lot) * 30).toLocaleString()} |
| +3 ${pointLabel} | +$${(pointValue * 3 * (dana > 0 ? recommendedLots : lot)).toLocaleString()} | +$${(pointValue * 3 * (dana > 0 ? recommendedLots : lot) - (dana > 0 ? recommendedLots : lot) * 30).toLocaleString()} |
| +5 ${pointLabel} | +$${(pointValue * 5 * (dana > 0 ? recommendedLots : lot)).toLocaleString()} | +$${(pointValue * 5 * (dana > 0 ? recommendedLots : lot) - (dana > 0 ? recommendedLots : lot) * 30).toLocaleString()} |
| -3 ${pointLabel} | -$${(pointValue * 3 * (dana > 0 ? recommendedLots : lot)).toLocaleString()} | -$${(pointValue * 3 * (dana > 0 ? recommendedLots : lot) + (dana > 0 ? recommendedLots : lot) * 30).toLocaleString()} |

## Rumus Perhitungan
\`\`\`
Gross Profit = Lot × ${pointLabel.charAt(0).toUpperCase() + pointLabel.slice(1)} × $${pointValue}
Net Profit = Gross Profit - (Lot × $30)

Contoh: Buy ${dana > 0 ? recommendedLots : lot} Lot @ ${priceDisplay}, Sell @ ${isForex ? (currentPrice + 0.0003).toFixed(4) : (isIndex ? (currentPrice + 3).toFixed(0) : (currentPrice + 3).toFixed(2))} (+3 ${pointLabel})
Gross = ${dana > 0 ? recommendedLots : lot} × 3 × $${pointValue} = $${((dana > 0 ? recommendedLots : lot) * 3 * pointValue).toLocaleString()}
Net = $${((dana > 0 ? recommendedLots : lot) * 3 * pointValue).toLocaleString()} - $${(dana > 0 ? recommendedLots : lot) * 30} = $${((dana > 0 ? recommendedLots : lot) * 3 * pointValue - (dana > 0 ? recommendedLots : lot) * 30).toLocaleString()}
\`\`\`

## Level Margin
- **Margin Call**: Equity < 70% Initial Margin ($${((dana > 0 ? recommendedLots : lot) * marginPerLot * 0.7).toLocaleString()})
- **Auto Liquidation**: Equity ≤ 30% Initial Margin ($${((dana > 0 ? recommendedLots : lot) * marginPerLot * 0.3).toLocaleString()})
${isOvernight ? `- **Rollover Fee**: $5/lot/malam + PPN 11% = $5.55/lot` : ""}

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Berapa ketahanan dana saya dengan ${dana > 0 ? recommendedLots : lot} lot?"
2. "Kalender ekonomi hari ini ada apa saja?"
3. "Hitung pivot point ${instrumentName.split(" ")[0]}"

---
*NM Ai - Newsmaker.id*
*Perhitungan berdasarkan Trading Rules SPA BBJ/JFX, bersifat edukatif.*`;
}

// ============ KETAHANAN DANA CALCULATOR ============

async function handleKetahananCalculation(userPrompt: string): Promise<string | null> {
  const lowerPrompt = userPrompt.toLowerCase();
  
  // Parse lot from prompt
  const lotMatch = userPrompt.match(/(\d+(?:\.\d+)?)\s*lot/i);
  const lot = lotMatch ? parseFloat(lotMatch[1]) : 1;
  
  // Parse dana/modal if provided
  const danaMatch = userPrompt.match(/\$\s*([\d,]+(?:\.\d+)?)\s*k?/i) ||
    userPrompt.match(/([\d,]+(?:\.\d+)?)\s*(?:k|ribu|juta|jt)?\s*(?:dollar|dolar|usd)/i) ||
    userPrompt.match(/dana\s*([\d,]+)/i) ||
    userPrompt.match(/modal\s*([\d,]+)/i);
  
  let dana = 0;
  if (danaMatch) {
    let rawDana = parseFloat(danaMatch[1].replace(/,/g, ""));
    if (lowerPrompt.includes("k") && rawDana < 1000) rawDana *= 1000;
    dana = rawDana;
  }
  
  // Default values for Gold (most common)
  const marginPerLot = 1000;
  const pointValue = 100;
  const feePerLot = 30;
  
  const totalMargin = marginPerLot * lot;
  
  // Calculate ketahanan
  if (dana > 0) {
    // User provided capital
    const buffer = dana - totalMargin - (feePerLot * lot);
    const ketahanan = Math.floor(buffer / (lot * pointValue));
    const marginUsedPct = (totalMargin / dana) * 100;
    
    if (buffer <= 0) {
      return `# Analisis Ketahanan Dana

## Input Data
| Parameter | Nilai |
|-----------|-------|
| Modal | **$${dana.toLocaleString()}** |
| Posisi | ${lot} lot |
| Margin Required | $${totalMargin.toLocaleString()} |

## Hasil Analisis

⚠️ **Modal tidak cukup untuk ${lot} lot!**

| Analisis | Nilai |
|----------|-------|
| Modal Anda | $${dana.toLocaleString()} |
| Margin Required | $${totalMargin.toLocaleString()} |
| Selisih | -$${Math.abs(buffer).toLocaleString()} |

Anda membutuhkan minimal **$${totalMargin.toLocaleString()}** untuk membuka ${lot} lot.

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Berapa lot ideal untuk modal $${dana.toLocaleString()}?"
2. "Hitung margin untuk 0.5 lot gold"
3. "Jelaskan tentang margin call"

---
*NM Ai - Newsmaker.id*`;
    }
    
    return `# Analisis Ketahanan Dana

## Input Data
| Parameter | Nilai |
|-----------|-------|
| Modal | **$${dana.toLocaleString()}** |
| Posisi | **${lot} lot** XAUUSD |
| Margin per Lot | $${marginPerLot.toLocaleString()} |
| Value per Poin | $${pointValue}/lot |

## Perhitungan
| Komponen | Kalkulasi | Nilai |
|----------|-----------|-------|
| Total Margin | ${lot} × $${marginPerLot.toLocaleString()} | $${totalMargin.toLocaleString()} |
| Fee Transaksi | ${lot} × $${feePerLot} | $${(feePerLot * lot).toLocaleString()} |
| **Buffer (Sisa Dana)** | $${dana.toLocaleString()} - $${totalMargin.toLocaleString()} - $${(feePerLot * lot).toLocaleString()} | **$${buffer.toLocaleString()}** |

## Hasil Ketahanan
| Metrik | Nilai | Keterangan |
|--------|-------|------------|
| **Ketahanan** | **${ketahanan} poin** | Sebelum margin call |
| Loss per Poin | $${(lot * pointValue).toLocaleString()} | ${lot} lot × $${pointValue} |
| Margin Used | ${marginUsedPct.toFixed(1)}% | ${marginUsedPct <= 20 ? "Aman" : marginUsedPct <= 40 ? "Medium" : "Berisiko"} |

## Level Kritis
| Level | Trigger | Sisa Equity |
|-------|---------|-------------|
| Margin Call | Equity < 70% margin | $${(totalMargin * 0.7).toLocaleString()} |
| Auto Liquidation | Equity ≤ 30% margin | $${(totalMargin * 0.3).toLocaleString()} |

${ketahanan < 5 ? `> ⚠️ **PERINGATAN**: Ketahanan hanya ${ketahanan} poin sangat berisiko! Pertimbangkan untuk mengurangi lot.` : 
ketahanan < 10 ? `> ⚡ **Hati-hati**: Ketahanan ${ketahanan} poin termasuk rendah. Gunakan stop loss ketat.` : 
`> ✅ **Status**: Ketahanan ${ketahanan} poin cukup untuk trading dengan risk management yang baik.`}

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Berapa lot ideal untuk modal $${dana.toLocaleString()}?"
2. "Hitung position size dengan risk 2%"
3. "Kalender ekonomi hari ini"

---
*NM Ai - Newsmaker.id*
*Informasi bersifat edukatif, bukan saran investasi.*`;
  }
  
  // User only provided lot, ask for modal
  return `# Analisis Ketahanan Dana

Untuk menghitung ketahanan dana dengan ${lot} lot, saya butuh informasi modal Anda.

**Format:**
\`\`\`
Ketahanan dana $10,000 dengan ${lot} lot
\`\`\`

**Atau coba pertanyaan ini:**

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Ketahanan dana $10,000 dengan ${lot} lot"
2. "Berapa lot ideal untuk modal $5,000?"
3. "Hitung margin untuk ${lot} lot gold"

---
*NM Ai - Newsmaker.id*`;
}

// ============ NEW CALCULATORS ============

function isRiskRewardQuestion(lowerPrompt: string): boolean {
  return (lowerPrompt.includes("risk") && lowerPrompt.includes("reward")) ||
    lowerPrompt.includes("risiko reward") ||
    lowerPrompt.includes("rr ratio") ||
    lowerPrompt.includes("risk reward ratio") ||
    (lowerPrompt.includes("entry") && lowerPrompt.includes("sl") && lowerPrompt.includes("tp"));
}

function isBreakevenQuestion(lowerPrompt: string): boolean {
  return lowerPrompt.includes("breakeven") ||
    lowerPrompt.includes("break even") ||
    lowerPrompt.includes("balik modal") ||
    lowerPrompt.includes("impas") ||
    (lowerPrompt.includes("loss") && lowerPrompt.includes("recover"));
}

function isPositionSizeQuestion(lowerPrompt: string): boolean {
  return (lowerPrompt.includes("position size") || lowerPrompt.includes("ukuran posisi")) ||
    (lowerPrompt.includes("risk") && lowerPrompt.includes("%") && (lowerPrompt.includes("lot") || lowerPrompt.includes("berapa"))) ||
    (lowerPrompt.includes("risiko") && lowerPrompt.includes("%") && lowerPrompt.includes("lot"));
}

function handleRiskRewardCalculation(userPrompt: string): string | null {
  // Parse entry, stop loss, take profit from prompt
  const entryMatch = userPrompt.match(/entry\s*[:=]?\s*([\d,.]+)/i) || 
    userPrompt.match(/beli\s*(?:di|@)?\s*([\d,.]+)/i) ||
    userPrompt.match(/([\d,.]+)\s*entry/i);
  const slMatch = userPrompt.match(/sl\s*[:=]?\s*([\d,.]+)/i) ||
    userPrompt.match(/stop\s*loss\s*[:=]?\s*([\d,.]+)/i) ||
    userPrompt.match(/stoploss\s*[:=]?\s*([\d,.]+)/i);
  const tpMatch = userPrompt.match(/tp\s*[:=]?\s*([\d,.]+)/i) ||
    userPrompt.match(/take\s*profit\s*[:=]?\s*([\d,.]+)/i) ||
    userPrompt.match(/target\s*[:=]?\s*([\d,.]+)/i);
  
  if (!entryMatch || !slMatch || !tpMatch) {
    return `# Risk/Reward Calculator

Untuk menghitung Risk/Reward Ratio, saya butuh 3 data:

**Format:**
\`\`\`
Hitung RR entry 2650, SL 2645, TP 2665
\`\`\`

Atau:
- **Entry**: Harga masuk posisi
- **SL (Stop Loss)**: Harga cut loss
- **TP (Take Profit)**: Harga target profit

**Contoh:**
- "Hitung RR entry 2650, SL 2645, TP 2665"
- "Risk reward entry 1.0850 SL 1.0820 TP 1.0920"

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Hitung RR entry 2650, SL 2645, TP 2665"
2. "Berapa lot ideal untuk modal $10,000?"
3. "Hitung breakeven setelah loss $500"

---
*NM Ai - Newsmaker.id*`;
  }
  
  const entry = parseFloat(entryMatch[1].replace(/,/g, ""));
  const sl = parseFloat(slMatch[1].replace(/,/g, ""));
  const tp = parseFloat(tpMatch[1].replace(/,/g, ""));
  
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  
  // Guard against zero-distance SL/TP
  if (risk === 0 || reward === 0) {
    return `# Risk/Reward Calculator

⚠️ **Data tidak valid!**

| Parameter | Nilai |
|-----------|-------|
| Entry | ${entry} |
| Stop Loss | ${sl} |
| Take Profit | ${tp} |

**Masalah:**
${risk === 0 ? "- Entry sama dengan Stop Loss (risk = 0)" : ""}
${reward === 0 ? "- Entry sama dengan Take Profit (reward = 0)" : ""}

Pastikan:
- **SL** harus berbeda dari Entry
- **TP** harus berbeda dari Entry

**Contoh yang benar:**
- "Hitung RR entry 2650, SL 2645, TP 2665"

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Hitung RR entry 2650, SL 2645, TP 2665"
2. "Jelaskan risk reward ratio yang ideal"
3. "Berapa lot ideal untuk modal $10,000?"

---
*NM Ai - Newsmaker.id*`;
  }
  
  const rrRatio = reward / risk;
  
  const isLong = sl < entry;
  const direction = isLong ? "LONG (Buy)" : "SHORT (Sell)";
  
  let assessment = "";
  if (rrRatio >= 3) {
    assessment = "Excellent! RR 1:3+ adalah target ideal untuk swing trading.";
  } else if (rrRatio >= 2) {
    assessment = "Bagus! RR 1:2 adalah standar minimum yang baik.";
  } else if (rrRatio >= 1.5) {
    assessment = "Cukup. Pertimbangkan untuk mencari setup dengan RR lebih tinggi.";
  } else {
    assessment = "Kurang ideal. RR di bawah 1:1.5 berisiko tinggi.";
  }
  
  const winRateNeeded = (1 / (1 + rrRatio)) * 100;
  
  return `# Risk/Reward Calculator

## Input Data
| Parameter | Nilai |
|-----------|-------|
| Entry | **${entry.toLocaleString("en-US", { minimumFractionDigits: 2 })}** |
| Stop Loss | ${sl.toLocaleString("en-US", { minimumFractionDigits: 2 })} |
| Take Profit | ${tp.toLocaleString("en-US", { minimumFractionDigits: 2 })} |
| Arah | ${direction} |

## Hasil Kalkulasi
| Metrik | Nilai |
|--------|-------|
| Risk (jarak ke SL) | ${risk.toFixed(2)} poin |
| Reward (jarak ke TP) | ${reward.toFixed(2)} poin |
| **Risk:Reward Ratio** | **1:${rrRatio.toFixed(2)}** |
| Win Rate Minimum | ${winRateNeeded.toFixed(1)}% |

## Penilaian
${assessment}

> **Catatan**: Win Rate Minimum adalah persentase trade yang harus profit agar tetap BE (break even) dalam jangka panjang.

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Hitung margin untuk 2 lot gold"
2. "Jelaskan apa itu risk management"
3. "Berapa lot ideal untuk modal $5,000?"

---
*NM Ai - Newsmaker.id*
*Informasi bersifat edukatif, bukan saran investasi.*`;
}

function handleBreakevenCalculation(userPrompt: string): string | null {
  // Parse loss amount and lot size
  const lossMatch = userPrompt.match(/loss\s*(?:\$|usd)?\s*([\d,.]+)/i) ||
    userPrompt.match(/rugi\s*(?:\$|usd)?\s*([\d,.]+)/i) ||
    userPrompt.match(/\$\s*([\d,.]+)\s*loss/i) ||
    userPrompt.match(/([\d,.]+)\s*(?:dollar|dolar)/i);
  
  const lotMatch = userPrompt.match(/(\d+(?:\.\d+)?)\s*lot/i);
  
  if (!lossMatch) {
    return `# Breakeven Calculator

Untuk menghitung berapa poin yang dibutuhkan untuk balik modal, saya butuh:

**Format:**
\`\`\`
Hitung breakeven setelah loss $500 dengan 2 lot gold
\`\`\`

**Data yang dibutuhkan:**
- **Jumlah Loss**: Berapa kerugian yang mau di-recover
- **Lot Size**: Berapa lot yang akan dipakai (default: 1 lot)

**Contoh:**
- "Breakeven loss $300 dengan 1 lot"
- "Balik modal rugi $1000 pakai 2 lot gold"

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Hitung breakeven loss $500 dengan 2 lot"
2. "Hitung risk reward ratio"
3. "Berapa margin untuk 3 lot gold?"

---
*NM Ai - Newsmaker.id*`;
  }
  
  const loss = parseFloat(lossMatch[1].replace(/,/g, ""));
  const lot = lotMatch ? parseFloat(lotMatch[1]) : 1;
  
  // Gold default: $100/poin/lot
  const pointValue = 100;
  const fee = 30; // $30/lot
  
  // Calculate pips needed
  const grossNeeded = loss + (lot * fee);
  const pipsNeeded = grossNeeded / (lot * pointValue);
  
  return `# Breakeven Calculator

## Input Data
| Parameter | Nilai |
|-----------|-------|
| Kerugian yang mau di-recover | **$${loss.toLocaleString()}** |
| Lot Size | ${lot} lot |
| Instrumen | Gold (XAUUSD) |

## Perhitungan
| Komponen | Kalkulasi | Nilai |
|----------|-----------|-------|
| Loss yang harus di-recover | - | $${loss.toLocaleString()} |
| Fee Transaksi | ${lot} lot × $30 | $${(lot * fee).toLocaleString()} |
| **Total yang harus dicapai** | - | **$${grossNeeded.toLocaleString()}** |

## Hasil
| Metrik | Nilai |
|--------|-------|
| Value per Poin | ${lot} lot × $100 = $${(lot * pointValue).toLocaleString()} |
| **Poin yang dibutuhkan** | **${pipsNeeded.toFixed(2)} poin** |

## Catatan Penting
> ${pipsNeeded > 10 ? "⚠️ Target lebih dari 10 poin cukup ambisius. Pertimbangkan untuk split target atau terima loss sebagai bagian dari trading." : "✅ Target masih realistis untuk dicapai dalam kondisi market normal."}

**Tips Recovery:**
1. Jangan langsung revenge trade setelah loss
2. Tunggu setup yang valid sesuai trading plan
3. Pertimbangkan untuk membagi target recovery ke beberapa trade

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Hitung risk reward entry 2650 SL 2645 TP 2660"
2. "Berapa lot ideal untuk modal $10,000?"
3. "Jelaskan tentang trading psychology"

---
*NM Ai - Newsmaker.id*
*Informasi bersifat edukatif, bukan saran investasi.*`;
}

function handlePositionSizeCalculation(userPrompt: string): string | null {
  // Parse capital and risk percentage
  const capitalMatch = userPrompt.match(/\$\s*([\d,]+(?:\.\d+)?)/i) ||
    userPrompt.match(/([\d,]+)\s*(?:dollar|dolar|usd)/i) ||
    userPrompt.match(/modal\s*([\d,]+)/i) ||
    userPrompt.match(/dana\s*([\d,]+)/i);
  
  const riskPctMatch = userPrompt.match(/(\d+(?:\.\d+)?)\s*%/i) ||
    userPrompt.match(/risk\s*(\d+)/i) ||
    userPrompt.match(/risiko\s*(\d+)/i);
  
  const slMatch = userPrompt.match(/sl\s*[:=]?\s*(\d+)/i) ||
    userPrompt.match(/stop\s*loss\s*[:=]?\s*(\d+)/i) ||
    userPrompt.match(/(\d+)\s*(?:poin|pip|point)/i);
  
  if (!capitalMatch || !riskPctMatch) {
    return `# Position Size Calculator (by Risk %)

Untuk menghitung ukuran lot berdasarkan persentase risiko, saya butuh:

**Format:**
\`\`\`
Position size modal $10,000 risk 2% SL 5 poin
\`\`\`

**Data yang dibutuhkan:**
- **Modal**: Total dana trading Anda
- **Risk %**: Persentase risiko per trade (1-3% recommended)
- **Stop Loss**: Jarak SL dalam poin (optional, default 5 poin)

**Contoh:**
- "Position size $5000 risk 2% SL 3 poin"
- "Ukuran posisi modal $10,000 risiko 1%"

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Hitung position size $10,000 risk 2% SL 5 poin"
2. "Berapa lot ideal untuk modal $5,000?"
3. "Jelaskan tentang risk management"

---
*NM Ai - Newsmaker.id*`;
  }
  
  const capital = parseFloat(capitalMatch[1].replace(/,/g, ""));
  const riskPct = parseFloat(riskPctMatch[1]);
  const slPips = slMatch ? parseFloat(slMatch[1]) : 5; // Default 5 poin SL
  
  // Gold default: $100/poin/lot
  const pointValue = 100;
  const marginPerLot = 1000;
  const feePerLot = 30;
  
  // Calculate risk amount
  const riskAmount = capital * (riskPct / 100);
  
  // Calculate lot size based on risk
  // Correct formula: Risk = Lot × (SL pips × Point Value + Fee)
  // Lot = Risk / (SL pips × Point Value + Fee per lot)
  const riskPerLot = (slPips * pointValue) + feePerLot;
  const idealLot = riskAmount / riskPerLot;
  
  // If calculated lot is too small, return guidance
  if (idealLot < 0.1) {
    return `# Position Size Calculator

## Input Data
| Parameter | Nilai |
|-----------|-------|
| Modal | **$${capital.toLocaleString()}** |
| Risk per Trade | ${riskPct}% = $${riskAmount.toLocaleString()} |
| Stop Loss | ${slPips} poin |

## Hasil Analisis

⚠️ **Budget risiko tidak mencukupi untuk 0.1 lot minimum.**

| Analisis | Nilai |
|----------|-------|
| Risk per 0.1 lot | $${(0.1 * riskPerLot).toFixed(2)} |
| Budget risiko Anda | $${riskAmount.toFixed(2)} |
| Selisih | -$${(0.1 * riskPerLot - riskAmount).toFixed(2)} |

### Opsi yang Tersedia:
1. **Naikkan modal** - Minimal $${Math.ceil(0.1 * riskPerLot / (riskPct / 100)).toLocaleString()} untuk ${riskPct}% risk
2. **Naikkan risk %** - Pakai ${((0.1 * riskPerLot / capital) * 100).toFixed(1)}% untuk 0.1 lot
3. **Perkecil SL** - Kurangi jarak stop loss

> **Rekomendasi**: Jangan paksakan trading jika modal tidak memadai. Trading dengan lot minimum yang melebihi risk tolerance sangat berbahaya.

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Berapa lot ideal untuk modal $10,000?"
2. "Jelaskan tentang risk management"
3. "Simulasi trading dengan modal $5,000"

---
*NM Ai - Newsmaker.id*
*Informasi bersifat edukatif, bukan saran investasi.*`;
  }
  
  const roundedLot = Math.floor(idealLot * 10) / 10; // Round down to 0.1 lot
  
  const actualRisk = roundedLot * riskPerLot;
  const actualRiskPct = (actualRisk / capital) * 100;
  const marginRequired = roundedLot * marginPerLot;
  
  return `# Position Size Calculator

## Input Data
| Parameter | Nilai |
|-----------|-------|
| Modal | **$${capital.toLocaleString()}** |
| Risk per Trade | ${riskPct}% = $${riskAmount.toLocaleString()} |
| Stop Loss | ${slPips} poin |
| Instrumen | Gold (XAUUSD) |

## Perhitungan
| Komponen | Nilai |
|----------|-------|
| Max Risk Amount | $${riskAmount.toLocaleString()} |
| Value per Poin | $${pointValue}/lot |
| Fee Transaksi | $${feePerLot}/lot |

## Hasil Rekomendasi
| Metrik | Nilai |
|--------|-------|
| **Lot Size Ideal** | **${roundedLot.toFixed(1)} lot** |
| Margin Required | $${marginRequired.toLocaleString()} |
| Risk Aktual | $${actualRisk.toFixed(2)} (${actualRiskPct.toFixed(2)}%) |

## Skenario Jika SL Kena
| Komponen | Kalkulasi | Nilai |
|----------|-----------|-------|
| Loss dari pergerakan | ${roundedLot} × ${slPips} × $100 | -$${(roundedLot * slPips * pointValue).toLocaleString()} |
| Fee | ${roundedLot} × $30 | -$${(roundedLot * feePerLot).toFixed(2)} |
| **Total Loss** | - | **-$${actualRisk.toFixed(2)}** |

> ✅ Dengan risk ${riskPct}% per trade, Anda bisa mengalami ${Math.floor(100 / riskPct)} losing trades berturut-turut sebelum modal habis. Ini memberi ruang untuk recovery.

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Hitung margin untuk ${roundedLot} lot gold"
2. "Hitung risk reward ratio"
3. "Jelaskan tentang money management"

---
*NM Ai - Newsmaker.id*
*Informasi bersifat edukatif, bukan saran investasi.*`;
}
