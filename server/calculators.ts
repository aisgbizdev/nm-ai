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
    lowerPrompt.includes("jadwal berita");
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
  return lowerPrompt.includes("margin") &&
    (lowerPrompt.includes("xauusd") ||
      lowerPrompt.includes("emas") ||
      lowerPrompt.includes("gold") ||
      lowerPrompt.includes("lot"));
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

  result += `\n---\n*NM Ai - Newsmaker.id*`;
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

    return `# Kalender Ekonomi (${targetDate})

${calendarTable}

---
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
    const quote = quotes.find((q: any) => {
      const qSymbol = (q.symbol || "").toUpperCase();
      return qSymbol.includes(symbolUpper) || 
             qSymbol.includes("XAU") || 
             qSymbol.includes("GOLD") ||
             qSymbol.includes("LGD");
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
  const lotMatch = userPrompt.match(/(\d+(?:\.\d+)?)\s*lot/i);
  const lot = lotMatch ? parseFloat(lotMatch[1]) : 1;
  
  const lowerPrompt = userPrompt.toLowerCase();
  const isOvernight = lowerPrompt.includes("overnight") || lowerPrompt.includes("swing");
  const isDayTrade = lowerPrompt.includes("daytrade") || lowerPrompt.includes("day trade") || lowerPrompt.includes("intraday");
  
  const marginDayTrade = 1000;
  const marginOvernight = 2000;
  
  const marginPerLot = isOvernight ? marginOvernight : marginDayTrade;
  const marginType = isOvernight ? "Overnight" : "Day Trade";
  const totalMargin = marginPerLot * lot;
  const maintenanceMargin = totalMargin * 0.7;
  const autoLiquidation = totalMargin * 0.3;
  
  let currentPrice = await fetchRealTimePrice("XAU");
  let priceSource = "real-time";
  
  if (!currentPrice) {
    currentPrice = 2650;
    priceSource = "estimasi";
  }
  
  const contractSize = 100;
  const contractValue = currentPrice * contractSize * lot;
  
  return `# Simulasi Margin XAUUSD (Gold)

## Spesifikasi Kontrak SPA
| Parameter | Nilai |
|-----------|-------|
| Trade Code | XUL10 (Fixed Rate) / XULF (Floating Rate) |
| Contract Size | 100 Troy Ounce |
| Harga Saat Ini (${priceSource}) | **$${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}** |

## Input Trading
| Parameter | Nilai |
|-----------|-------|
| Jumlah Lot | ${lot} lot |
| Tipe Trading | ${marginType} |

## Margin Requirement (Trading Rules NM Standard)
| Jenis Margin | Per Lot | Total (${lot} lot) |
|--------------|---------|-------------------|
| Initial Margin (${marginType}) | $${marginPerLot.toLocaleString()} | **$${totalMargin.toLocaleString()}** |
| Maintenance Margin (70%) | $${(marginPerLot * 0.7).toLocaleString()} | $${maintenanceMargin.toLocaleString()} |
| Auto Liquidation (30%) | $${(marginPerLot * 0.3).toLocaleString()} | $${autoLiquidation.toLocaleString()} |

## Nilai Kontrak
- Contract Value: ${lot} lot × 100 oz × $${currentPrice.toLocaleString()} = **$${contractValue.toLocaleString()}**
- Facility Fee: $15/lot/side (buka + tutup = $30/lot)

## Catatan Penting
- Margin Call terjadi jika equity turun di bawah **70%** dari Initial Margin
- Posisi akan di-liquidasi otomatis jika equity menyentuh **30%** dari Initial Margin
- Overnight dikenakan rollover fee $5/lot/malam + PPN 11%

---
*NM Ai - Newsmaker.id*
*Perhitungan berdasarkan Trading Rules SPA, bersifat edukatif.*`;
}
