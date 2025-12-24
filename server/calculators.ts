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

const QUOTES_API_URL = process.env.QUOTES_API_URL || "https://endpoapi-production-3202.up.railway.app/api/quotes";
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

  if (isMarginQuestion(lowerPrompt)) {
    const marginReply = await handleMarginCalculation(userPrompt);
    if (marginReply) return { handled: true, reply: marginReply };
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

function isMarginQuestion(lowerPrompt: string): boolean {
  const hasMarginKeyword = lowerPrompt.includes("margin") || 
    lowerPrompt.includes("simulasi") ||
    lowerPrompt.includes("hitung") ||
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
  if (!HL) return null;

  const { H, L } = HL;
  const isDownTrend = /downtren|downtrend|tren turun|turun/.test(lowerPrompt);
  const mode = isDownTrend ? "down" : "up";
  
  const up = calcFibUp({ H, L });
  const down = calcFibDown({ H, L });
  const D = H - L;
  
  const fmt = (n: number) => n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let result = `## Fibonacci ${mode === "down" ? "Downtrend" : "Uptrend"}

- **High (H)**: ${fmt(H)}
- **Low (L)**: ${fmt(L)}
- **Range (D)**: ${fmt(D)}

| Level | Retracement | Projection |
|-------|-------------|------------|
`;

  const levels = ["23.60%", "38.20%", "50.00%", "61.80%", "78.60%"];
  const projLevels = ["138.20%", "150.00%", "161.80%", "200.00%", "238.20%"];
  
  const data = mode === "down" ? down : up;
  for (let i = 0; i < levels.length; i++) {
    result += `| ${levels[i]} | ${fmt(data.retr[levels[i]])} | ${fmt(data.proj[projLevels[i]])} |\n`;
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
  if (!ohlc) return null;

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
| R3 | ${fmt(classic.R3)} | ${fmt(woodie.R3)} | ${fmt(camarilla.R3)} |
| R2 | ${fmt(classic.R2)} | ${fmt(woodie.R2)} | ${fmt(camarilla.R2)} |
| R1 | ${fmt(classic.R1)} | ${fmt(woodie.R1)} | ${fmt(camarilla.R1)} |
| Pivot | ${fmt(classic.P)} | ${fmt(woodie.P)} | ${fmt(camarilla.P)} |
| S1 | ${fmt(classic.S1)} | ${fmt(woodie.S1)} | ${fmt(camarilla.S1)} |
| S2 | ${fmt(classic.S2)} | ${fmt(woodie.S2)} | ${fmt(camarilla.S2)} |
| S3 | ${fmt(classic.S3)} | ${fmt(woodie.S3)} | ${fmt(camarilla.S3)} |

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
    
    if (!response.ok) return null;
    
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
    return null;
  }
}

async function handlePriceQuote(userPrompt: string): Promise<string | null> {
  try {
    const response = await fetch(QUOTES_API_URL, { method: "GET", cache: "no-store" });
    if (!response.ok) {
      console.error("Quote API not ok:", response.status);
      return null;
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
    return null;
  }
}

async function fetchRealTimePrice(symbol: string): Promise<number | null> {
  try {
    const response = await fetch(QUOTES_API_URL, { method: "GET", cache: "no-store" });
    if (!response.ok) return null;
    
    const data = await response.json();
    const quotes = Array.isArray(data.data) ? data.data : [];
    
    const symbolUpper = symbol.toUpperCase();
    
    // Find quote matching the specific symbol
    const quote = quotes.find((q: any) => {
      const qSymbol = (q.symbol || "").toUpperCase();
      
      // Specific matching for each instrument type
      if (symbolUpper === "XAU" || symbolUpper === "GOLD") {
        return qSymbol.includes("XAU") || qSymbol.includes("GOLD") || qSymbol.includes("LGD");
      }
      if (symbolUpper === "XAG" || symbolUpper === "SILVER") {
        return qSymbol.includes("XAG") || qSymbol.includes("SILVER") || qSymbol.includes("LSI");
      }
      if (symbolUpper === "BCO" || symbolUpper === "OIL") {
        return qSymbol.includes("BCO") || qSymbol.includes("OIL") || qSymbol.includes("LCO");
      }
      if (symbolUpper === "HSI") {
        return qSymbol.includes("HSI") || qSymbol.includes("HANG");
      }
      if (symbolUpper === "NIKKEI" || symbolUpper === "JP225") {
        return qSymbol.includes("NIKKEI") || qSymbol.includes("JP225") || qSymbol.includes("JPN");
      }
      // Forex pairs - exact match preferred
      if (symbolUpper === "GBP") {
        return qSymbol.includes("GBP");
      }
      if (symbolUpper === "EUR") {
        return qSymbol.includes("EUR") && !qSymbol.includes("EURO50");
      }
      if (symbolUpper === "AUD") {
        return qSymbol.includes("AUD");
      }
      if (symbolUpper === "JPY") {
        return qSymbol.includes("JPY") || qSymbol.includes("USDJPY");
      }
      if (symbolUpper === "CHF") {
        return qSymbol.includes("CHF") || qSymbol.includes("USDCHF");
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
