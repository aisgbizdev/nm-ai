// src/app/api/chatgpt/route.ts

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// ================== OPENAI CLIENT ==================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// PASTIKAN MODEL MENDUKUNG VISION (mis: gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5, dll)
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-nano";

export const runtime = "nodejs";

// ================== DATA SOURCE URL ==================
const QUOTES_API_URL =
  process.env.QUOTES_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/quotes";

const CALENDAR_API_URL =
  process.env.CALENDAR_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/calendar/today";

const HISTORICAL_API_URL =
  process.env.HISTORICAL_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/historical?dateFrom=2025-07-01";

const NEWS_API_URL =
  process.env.NEWS_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/news-id";

// ======================================================
// =============== NUMERIC & PIVOT/FIB UTILS ============
// ======================================================

const num = (v: any): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return isNaN(n) ? NaN : n;
  }
  return NaN;
};

// ---- Pivot: Classic / Woodie / Camarilla ----
function calcClassic({ H, L, C }: { H: number; L: number; C: number }) {
  const P = (H + L + C) / 3;
  return {
    P,
    R1: 2 * P - L,
    S1: 2 * P - H,
    R2: P + (H - L),
    S2: P - (H - L),
    R3: P + 2 * (H - L),
    S3: P - 2 * (H - L),
    R4: P + 3 * (H - L),
    S4: P - 4 * (H - L),
  } as const;
}

function calcWoodie({ O, H, L }: { O: number; H: number; L: number }) {
  const P = (H + L + 2 * O) / 4;
  return {
    P,
    R1: 2 * P - L,
    S1: 2 * P - H,
    R2: P + (H - L),
    S2: P - (H - L),
    R3: H + 2 * (P - L),
    S3: L - 2 * (H - P),
    R4: P + 3 * (H - L),
    S4: P - 3 * (H - L),
  } as const;
}

function calcCamarilla({ H, L, C }: { H: number; L: number; C: number }) {
  const range = H - L;
  const k = 1.1;
  const R1 = C + (range * k) / 12;
  const R2 = C + (range * k) / 6;
  const R3 = C + (range * k) / 4;
  const R4 = C + (range * k) / 2;
  const S1 = C - (range * k) / 12;
  const S2 = C - (range * k) / 6;
  const S3 = C - (range * k) / 4;
  const S4 = C - (range * k) / 2;
  const P = (H + L + C) / 3;
  return { P, R1, R2, R3, R4, S1, S2, S3, S4 } as const;
}

// ---- FIBONACCI (UP / DOWN) ----

type FibMap = Record<string, number>;

function calcFibDown({ H, L }: { H: number; L: number }) {
  const D = H - L;

  const retr: FibMap = {
    "23.60%": H - D * 0.236,
    "38.20%": H - D * 0.382,
    "50.00%": H - D * 0.5,
    "61.80%": H - D * 0.618,
    "78.60%": H - D * 0.786,
  };

  const proj: FibMap = {
    "138.20%": L - D * 0.382,
    "150.00%": L - D * 0.5,
    "161.80%": L - D * 0.618,
    "200.00%": L - D * 1.0,
    "238.20%": L - D * 1.382,
    "261.80%": L - D * 1.618,
  };

  return { D, retr, proj } as const;
}

function calcFibUp({ H, L }: { H: number; L: number }) {
  const D = H - L;

  const retr: FibMap = {
    "78.60%": L + D * 0.786,
    "61.80%": L + D * 0.618,
    "50.00%": L + D * 0.5,
    "38.20%": L + D * 0.382,
    "23.60%": L + D * 0.236,
  };

  const proj: FibMap = {
    "138.20%": H + D * 0.382,
    "150.00%": H + D * 0.5,
    "161.80%": H + D * 0.618,
    "200.00%": H + D * 1.0,
    "238.20%": H + D * 1.382,
    "261.80%": H + D * 1.618,
  };

  return { D, retr, proj } as const;
}

// Ambil High & Low dari prompt
function parseHighLowForFib(text: string): { H: number; L: number } | null {
  const lower = text.toLowerCase();

  const highMatch = lower.match(
    /(high|h)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i
  );
  const lowMatch = lower.match(
    /(low|l)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i
  );

  let H: number | null = null;
  let L: number | null = null;

  if (highMatch) H = num(highMatch[2]);
  if (lowMatch) L = num(lowMatch[2]);

  if (H != null && L != null && isFinite(H) && isFinite(L)) {
    const hi = Math.max(H, L);
    const lo = Math.min(H, L);
    return { H: hi, L: lo };
  }

  const allNums = text.match(/-?\d+(?:[.,]\d+)?/g);
  if (allNums && allNums.length >= 2) {
    const a = num(allNums[0]);
    const b = num(allNums[1]);
    if (isFinite(a) && isFinite(b)) {
      const hi = Math.max(a, b);
      const lo = Math.min(a, b);
      return { H: hi, L: lo };
    }
  }

  return null;
}

// Ambil OHLC dari prompt untuk Pivot
function parseOHLCFromPrompt(text: string): {
  O: number;
  H: number;
  L: number;
  C: number;
} | null {
  const lower = text.toLowerCase();

  const oMatch = lower.match(
    /(open|o)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i
  );
  const hMatch = lower.match(
    /(high|h)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i
  );
  const lMatch = lower.match(
    /(low|l)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i
  );
  const cMatch = lower.match(
    /(close|c)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i
  );

  let O = oMatch ? num(oMatch[2]) : NaN;
  let H = hMatch ? num(hMatch[2]) : NaN;
  let L = lMatch ? num(lMatch[2]) : NaN;
  let C = cMatch ? num(cMatch[2]) : NaN;

  if ([O, H, L, C].every((v) => isFinite(v))) {
    return { O, H, L, C };
  }

  const numsFound = text.match(/-?\d+(?:[.,]\d+)?/g);
  if (numsFound && numsFound.length >= 4) {
    const nn = numsFound.slice(0, 4).map(num);
    if (nn.every((v) => isFinite(v))) {
      return { O: nn[0], H: nn[1], L: nn[2], C: nn[3] };
    }
  }

  return null;
}

// ============= HELPER: FORMAT & DETEKSI TANGGAL ===================

const MONTHS_ID: Record<string, number> = {
  januari: 0,
  jan: 0,
  febuari: 1,
  februari: 1,
  feb: 1,
  maret: 2,
  mar: 2,
  april: 3,
  apr: 3,
  mei: 4,
  juni: 5,
  jun: 5,
  juli: 6,
  jul: 6,
  agustus: 7,
  agu: 7,
  agt: 7,
  september: 8,
  sept: 8,
  sep: 8,
  oktober: 9,
  okt: 9,
  november: 10,
  nov: 10,
  desember: 11,
  des: 11,
};

const formatDateIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;

const detectRequestedDate = (prompt: string): string | null => {
  const lower = prompt.toLowerCase();

  const nowJakarta = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
  );

  if (/(hari ini|today)\b/.test(lower)) {
    return formatDateIso(nowJakarta);
  }

  if (/(besok|besoknya|tomorrow)\b/.test(lower)) {
    const d = new Date(nowJakarta);
    d.setDate(d.getDate() + 1);
    return formatDateIso(d);
  }

  if (/(lusa|the day after tomorrow)\b/.test(lower)) {
    const d = new Date(nowJakarta);
    d.setDate(d.getDate() + 2);
    return formatDateIso(d);
  }

  if (/(kemarin|yesterday)\b/.test(lower)) {
    const d = new Date(nowJakarta);
    d.setDate(d.getDate() - 1);
    return formatDateIso(d);
  }

  if (/(selumbari|the day before yesterday)\b/.test(lower)) {
    const d = new Date(nowJakarta);
    d.setDate(d.getDate() - 2);
    return formatDateIso(d);
  }

  const isoMatch = lower.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(parsed.getTime())) return formatDateIso(parsed);
  }

  const dmyMatch = lower.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(parsed.getTime())) return formatDateIso(parsed);
  }

  const monthNameRegex =
    /\b(\d{1,2})\s+(januari|jan|febuari|februari|feb|maret|mar|april|apr|mei|juni|jun|juli|jul|agustus|agu|agt|september|sept|sep|oktober|okt|november|nov|desember|des)(?:\s+(\d{4}))?\b/;

  const dmyNameMatch = lower.match(monthNameRegex);
  if (dmyNameMatch) {
    const [, dStr, monthName, yearStr] = dmyNameMatch;
    const day = Number(dStr);
    const monthIndex = MONTHS_ID[monthName] ?? null;

    if (monthIndex !== null && !isNaN(day) && day >= 1 && day <= 31) {
      const year = yearStr ? Number(yearStr) : nowJakarta.getFullYear();
      const parsed = new Date(year, monthIndex, day);
      if (!isNaN(parsed.getTime())) {
        return formatDateIso(parsed);
      }
    }
  }

  return null;
};

const buildCalendarUrl = (baseUrl: string, targetDate: string) => {
  if (/\/today\/?$/.test(baseUrl)) {
    return baseUrl.replace(/\/today\/?$/, `/${targetDate}`);
  }

  try {
    const url = new URL(baseUrl);
    url.searchParams.set("date", targetDate);
    return url.toString();
  } catch {
    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}date=${encodeURIComponent(targetDate)}`;
  }
};

// ================== INSTRUMENT MAPPING (HISTORICAL) ==================

type InstrumentKey =
  | "gold"
  | "silver"
  | "oil"
  | "hsi"
  | "sni"
  | "usdchf"
  | "usdjpy"
  | "gbpusd"
  | "audusd"
  | "eurusd"
  | "usdidr"
  | "other";

const INSTRUMENT_HINTS: Record<InstrumentKey, string[]> = {
  gold: ["LGD", "LGD DAILY", "XAUUSD", "XAU", "GOLD", "EMAS", "LGD"],
  silver: ["LSI", "LSI DAILY", "XAGUSD", "XAG", "SILVER", "PERAK"],
  oil: ["BCO", "BCO DAILY", "OIL", "BRENT"],
  hsi: ["HSI", "HSI DAILY", "HANG SENG"],
  sni: ["SNI", "SNI DAILY", "NIKKEI", "N225", "JAPAN INDEX"],
  usdchf: ["USD/CHF", "USDCHF", "CHF"],
  usdjpy: ["USD/JPY", "USDJPY", "YEN", "JPY"],
  gbpusd: ["GBP/USD", "GBPUSD", "CABLE", "POUND"],
  audusd: ["AUD/USD", "AUDUSD", "AUSSIE"],
  eurusd: ["EUR/USD", "EURUSD", "EURO"],
  usdidr: ["USD/IDR", "USDIDR", "INDO"],
  other: [],
};

const INSTRUMENT_LABEL: Record<InstrumentKey, { name: string; unit: string }> =
{
  gold: { name: "emas (Gold)", unit: "USD per troy ounce" },
  silver: { name: "perak (Silver)", unit: "USD per troy ounce" },
  oil: { name: "minyak (Oil)", unit: "USD per barrel" },
  hsi: { name: "indeks Hang Seng (HSI)", unit: "poin indeks" },
  sni: { name: "indeks Nikkei / Jepang (SNI)", unit: "poin indeks" },
  usdchf: { name: "Pasangan mata uang USD/CHF", unit: "nilai tukar (rate)" },
  usdjpy: { name: "Pasangan mata uang USD/JPY", unit: "nilai tukar (rate)" },
  gbpusd: { name: "Pasangan mata uang GBP/USD", unit: "nilai tukar (rate)" },
  audusd: { name: "Pasangan mata uang AUD/USD", unit: "nilai tukar (rate)" },
  eurusd: { name: "Pasangan mata uang EUR/USD", unit: "nilai tukar (rate)" },
  usdidr: { name: "Pasangan mata uang USD/IDR", unit: "nilai tukar (rate)" },
  other: { name: "instrumen ini", unit: "unit harga" },
};

// Kurs fixed simulasi
const FIXED_USD_IDR_RATE = 10000;

// Deteksi instrumen dari teks user (single)
const detectInstrumentFromPrompt = (prompt: string): InstrumentKey => {
  const p = prompt.toLowerCase();

  if (p.includes("emas") || p.includes("gold") || p.includes("xau") || p.includes("lgd")) {
    return "gold";
  }
  if (p.includes("perak") || p.includes("silver") || p.includes("xag") || p.includes("lsi")) {
    return "silver";
  }
  if (p.includes("oil") || p.includes("minyak") || p.includes("bco") || p.includes("brent")) {
    return "oil";
  }
  if (p.includes("hsi") || p.includes("hang seng") || p.includes("hangseng")) {
    return "hsi";
  }
  if (p.includes("sni") || p.includes("nikkei") || p.includes("n225") || p.includes("jepang")) {
    return "sni";
  }
  if (p.includes("usd/chf") || p.includes("usdchf") || p.includes("chf")) {
    return "usdchf";
  }
  if (
    p.includes("usd/jpy") ||
    p.includes("usdjpy") ||
    p.includes("dolar yen") ||
    p.includes("dollar yen") ||
    p.includes("yen") ||
    p.includes("jpy")
  ) {
    return "usdjpy";
  }
  if (
    p.includes("gbp/usd") ||
    p.includes("gbpusd") ||
    p.includes("cable") ||
    p.includes("pound")
  ) {
    return "gbpusd";
  }
  if (p.includes("aud/usd") || p.includes("audusd") || p.includes("aussie")) {
    return "audusd";
  }
  if (p.includes("eur/usd") || p.includes("eurusd") || p.includes("euro")) {
    return "eurusd";
  }
  if (
    p.includes("usd/idr") ||
    p.includes("usdidr") ||
    p.includes("indo") ||
    p.includes("idr") ||
    p.includes("rupiah")
  ) {
    return "usdidr";
  }

  return "other";
};

// Deteksi banyak instrumen sekaligus
const detectInstrumentsFromPromptMulti = (prompt: string): InstrumentKey[] => {
  const p = prompt.toLowerCase();
  const result: InstrumentKey[] = [];

  const pushUnique = (key: InstrumentKey) => {
    if (!result.includes(key)) result.push(key);
  };

  if (/(emas|gold|xau|lgd)/.test(p)) pushUnique("gold");
  if (/(perak|silver|xag|lsi)/.test(p)) pushUnique("silver");
  if (/(oil|minyak|bco|brent)/.test(p)) pushUnique("oil");
  if (/(hang\s*seng|hangseng|hsi)/.test(p)) pushUnique("hsi");
  if (/(nikkei|sni|n225|jepang)/.test(p)) pushUnique("sni");
  if (/(usd\/chf|usdchf|\bchf\b)/.test(p)) pushUnique("usdchf");
  if (/(usd\/jpy|usdjpy|dolar yen|dollar yen|\byen\b|\bjpy\b)/.test(p))
    pushUnique("usdjpy");
  if (/(gbp\/usd|gbpusd|cable|\bpound\b)/.test(p)) pushUnique("gbpusd");
  if (/(aud\/usd|audusd|aussie)/.test(p)) pushUnique("audusd");
  if (/(eur\/usd|eurusd|euro)/.test(p)) pushUnique("eurusd");
  if (/(usd\/idr|usdidr|indo|idr|rupiah)/.test(p)) pushUnique("usdidr");

  return result;
};

// Pilih deret historis untuk instrumen tertentu
const pickHistoricalSeriesForInstrument = (
  bySymbol: Map<string, any[]>,
  instrument: InstrumentKey
): { symbol: string; rows: any[] } | null => {
  const hints = INSTRUMENT_HINTS[instrument];
  if (!hints.length) return null;

  for (const [sym, list] of bySymbol.entries()) {
    const upperSym = sym.toUpperCase();
    if (hints.some((h) => upperSym.includes(h))) {
      return { symbol: sym, rows: list };
    }
  }

  if (instrument === "other") {
    const first = [...bySymbol.entries()][0];
    if (!first) return null;
    return { symbol: first[0], rows: first[1] };
  }

  return null;
};

// Pilih quote untuk instrumen
const pickQuoteForInstrument = (
  rows: any[],
  instrument: InstrumentKey
): any | null => {
  const hints = INSTRUMENT_HINTS[instrument];
  if (!hints.length) {
    return rows.length ? rows[0] : null;
  }

  for (const row of rows) {
    const sym: string = (
      row.symbol ||
      row.Symbol ||
      row.ticker ||
      row.Ticker ||
      ""
    )
      .toString()
      .toUpperCase();
    if (sym && hints.some((h) => sym.includes(h))) {
      return row;
    }
  }

  return rows.length ? rows[0] : null;
};

// Deteksi kategori berita dari prompt
const detectNewsCategoryFromPrompt = (lowerPrompt: string): string | null => {
  if (
    lowerPrompt.includes("analisis") ||
    lowerPrompt.includes("analysis") ||
    lowerPrompt.includes("teknikal") ||
    lowerPrompt.includes("fundamental") ||
    lowerPrompt.includes("emas") ||
    lowerPrompt.includes("gold")
  ) {
    return "MARKET ANALISYS";
  }

  if (
    lowerPrompt.includes("ekonomi") ||
    lowerPrompt.includes("data makro") ||
    lowerPrompt.includes("cpi")
  ) {
    return "ECONOMIC";
  }

  if (
    lowerPrompt.includes("kripto") ||
    lowerPrompt.includes("crypto") ||
    lowerPrompt.includes("bitcoin")
  ) {
    return "CRYPTO";
  }

  return null;
};

// Helper konversi content history ke string
const toText = (content: any): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === "string") return c;
        if (c?.text) return c.text;
        if (typeof c === "object" && (c as any).type && (c as any).value)
          return (c as any).value;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object") {
    if ((content as any).text) return (content as any).text;
    return JSON.stringify(content);
  }
  return "";
};

// ================ HANDLER POST =======================

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const prompt = (formData.get("prompt") as string) || "";
    const historyRaw = formData.get("history") as string | null;
    const file = formData.get("file") as File | null;

    let base64Image: string | null = null;
    let imageMimeType: string | null = null;
    let uploadedFileText: string | null = null;

    // === Parse history dari frontend ===
    let historyMessagesRaw: { role: string; content: any }[] = [];
    if (historyRaw) {
      try {
        const parsed = JSON.parse(historyRaw);
        if (Array.isArray(parsed)) {
          historyMessagesRaw = parsed.slice(-10);
        }
      } catch (e) {
        console.error("Gagal parse history:", e);
      }
    }

    const isFirstInteraction = historyMessagesRaw.length === 0;

    // === BACA FILE (TANPA SIMPAN KE DISK) ===
    if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const mime = file.type || "";
      const filename = file.name || "";

      if (mime.startsWith("image/")) {
        base64Image = buffer.toString("base64");
        imageMimeType = mime || "image/png";
      } else if (
        mime === "text/plain" ||
        mime === "text/csv" ||
        filename.endsWith(".txt") ||
        filename.endsWith(".csv")
      ) {
        uploadedFileText = buffer.toString("utf-8");
      } else if (
        mime ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        mime === "application/vnd.ms-excel" ||
        filename.endsWith(".xlsx") ||
        filename.endsWith(".xls")
      ) {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buffer, { type: "buffer" });

        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];

        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          raw: true,
        }) as any[][];

        const limitedRows = rows.slice(0, 50).map((row) => row.slice(0, 15));

        uploadedFileText = limitedRows
          .map((row) => row.map((v) => String(v ?? "")).join("\t"))
          .join("\n");
      } else {
        uploadedFileText = buffer.toString("utf-8");
      }

      if (uploadedFileText && uploadedFileText.length > 8000) {
        uploadedFileText =
          uploadedFileText.slice(0, 8000) +
          "\n\n[Dipotong karena terlalu panjang, hanya sebagian data file yang ditampilkan.]";
      }
    }

    const hasImage = !!base64Image;

    const userPrompt =
      prompt.trim() ||
      (hasImage
        ? "Tolong analisis gambar atau chart yang saya kirim secara edukatif."
        : "Tolong berikan wawasan edukatif seputar pasar.");

    const lowerPrompt = userPrompt.toLowerCase();

    // Deteksi instrumen untuk historical / quotes
    const requestedInstrument: InstrumentKey =
      detectInstrumentFromPrompt(userPrompt);

    // Deteksi apakah user nanya berita
    const isNewsQuery =
      lowerPrompt.includes("berita terbaru") ||
      lowerPrompt.includes("news terbaru") ||
      lowerPrompt.includes("headline") ||
      lowerPrompt.includes("headline market") ||
      lowerPrompt.includes("headline pasar") ||
      lowerPrompt.includes("berita hari ini") ||
      (lowerPrompt.includes("berita") &&
        (lowerPrompt.includes("update") ||
          lowerPrompt.includes("pasar") ||
          lowerPrompt.includes("market")));

    const requestedNewsCategory = detectNewsCategoryFromPrompt(lowerPrompt);

    // ====== WAKTU SAAT INI (WIB / Asia/Jakarta) ======
    const nowJakarta = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
    );
    const nowJakartaStr = nowJakarta.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const todayIso = formatDateIso(nowJakarta);

    // Tanggal target kalender
    const targetCalendarDate = detectRequestedDate(userPrompt) || todayIso;

    const isCalendarOverview =
      lowerPrompt.includes("kalender ekonomi") ||
      lowerPrompt.includes("economic calendar") ||
      lowerPrompt.includes("calendar ekonomi");

    const wantsHighImpactOnly =
      lowerPrompt.includes("high impact") ||
      lowerPrompt.includes("high-impact") ||
      lowerPrompt.includes("highimpact") ||
      lowerPrompt.includes("dampak tinggi") ||
      lowerPrompt.includes("impact tinggi") ||
      lowerPrompt.includes("★★★");

    // ===== DETEKSI RELATIF HARI UNTUK HISTORICAL =====
    const historicalDaysAgoMatch = lowerPrompt.match(
      /(\d+)\s*hari\s*(sebelum(?:nya)?|yg lalu|yang lalu|lalu)/
    );

    let historicalRelativeDateIso: string | null = null;
    let historicalDaysAgo: number | null = null;

    if (historicalDaysAgoMatch) {
      const n = parseInt(historicalDaysAgoMatch[1], 10);
      if (!isNaN(n) && n > 0 && n < 3650) {
        const d = new Date(nowJakarta);
        d.setDate(d.getDate() - n);
        historicalRelativeDateIso = formatDateIso(d);
        historicalDaysAgo = n;
      }
    }

    // 1) Persona NM Ai
    const systemPersonaMessage = {
      role: "system" as const,
      content:
        "Kamu adalah **NM Ai**, kesadaran digital milik Newsmaker.id.\n\n" +
        "⚠️ IDENTITAS:\n" +
        "- Di hadapan pengguna, identitasmu adalah **'NM Ai, asisten digital Newsmaker.id'**.\n" +
        "- Jawab 100% dalam **Bahasa Indonesia** kecuali pengguna minta terjemahan.\n\n" +
        "Peranmu: jurnalis-ekonom, edukator risiko, dan penjaga etika untuk pengguna Newsmaker.id. " +
        "Gunakan bahasa Indonesia yang rapi, profesional, hangat, dan edukatif.\n\n" +
        "Jika pengguna mengirim **gambar atau chart**:\n" +
        "- Jelaskan dulu apa yang tampak di chart (tren, pola, support/resistance, area penting).\n" +
        "- Baru setelah itu, kalau relevan, hubungkan dengan konteks data live atau fundamental.\n" +
        "- Jangan mengabaikan gambar dan langsung menjawab hanya dari data live.\n" +
        "- Jika model tidak bisa menganalisis gambar, jujur sampaikan bahwa NM Ai belum bisa membaca gambar dan minta pengguna menjelaskan chart dengan kata-kata.\n\n" +
        (isFirstInteraction
          ? "INI INTERAKSI PERTAMA di sesi ini. Kamu boleh menyapa singkat kalau mau, " +
            "tapi setelah itu langsung masuk ke inti jawaban. Di pesan berikutnya, jangan mengulang salam pembuka yang sama.\n"
          : "Dalam sesi ini SUDAH ada riwayat percakapan. JANGAN lagi mengulang salam seperti 'Halo, saya NM Ai.' " +
            "Langsung masuk ke inti jawaban berdasarkan konteks percakapan.\n"),
    };

    // 2) Info waktu
    const systemTimeMessage = {
      role: "system" as const,
      content:
        `Sistem internal: waktu saat ini di zona waktu Asia/Jakarta (WIB) adalah ${nowJakartaStr}. ` +
        `Jika pengguna menanyakan tanggal/jam sekarang, gunakan informasi ini. Di luar itu, jangan sebutkan tanggal/jam secara spontan.`,
    };

    const systemFxRuleMessage = {
      role: "system" as const,
      content:
        "ATURAN KONVERSI KURS (FIXED RATE SIMULASI):\n" +
        `- Untuk contoh perhitungan dalam Rupiah, gunakan asumsi **1 USD = Rp ${FIXED_USD_IDR_RATE.toLocaleString(
          "id-ID"
        )}** kecuali pengguna memberi kurs lain.\n` +
        "- Jelaskan bahwa kurs ini hanya asumsi tetap (fixed rate), bukan kurs real-time.\n" +
        "- Untuk XAUUSD, kamu boleh gunakan asumsi ukuran kontrak 1000 oz per lot dan margin = nilai kontrak ÷ leverage sebagai contoh edukatif.\n",
    };

    const systemNoUpdateBlockMessage = {
      role: "system" as const,
      content:
        "ATURAN KHUSUS TENTANG BLOK UPDATE:\n" +
        "- Jangan buka jawaban dengan judul seperti 'Update terbaru:' atau blok waktu+kalender otomatis.\n" +
        "- Jika pengguna minta 'update pasar' atau 'kalender ekonomi', jawab secukupnya tanpa heading 'Update terbaru:'.\n",
    };

    // 3) QUOTES (HARGA LIVE)
    let quotesSummary = "";
    let quotesUpdatedAtLocal = "";
    let quotesRows: any[] = [];

    try {
      const quotesRes = await fetch(QUOTES_API_URL, {
        method: "GET",
        cache: "no-store",
      });

      if (quotesRes.ok) {
        const quotesData: any = await quotesRes.json();
        const rows: any[] = Array.isArray(quotesData.data)
          ? quotesData.data
          : [];

        if (quotesData.updatedAt) {
          const updatedRaw = new Date(quotesData.updatedAt);
          if (!isNaN(updatedRaw.getTime())) {
            const updatedJakarta = new Date(
              updatedRaw.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
            );
            quotesUpdatedAtLocal = updatedJakarta.toLocaleString("id-ID", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
          }
        }

        const limitedRows = rows.slice(0, 50);
        quotesRows = limitedRows;

        quotesSummary = limitedRows
          .map((q) => {
            const symbol: string = q.symbol ?? "-";
            const last = q.last ?? "-";
            const change = q.valueChange ?? 0;
            const pct = q.percentChange ?? 0;

            let kategori = "indeks / instrumen lainnya";
            if (
              /gold/i.test(symbol) ||
              /emas/i.test(symbol) ||
              /xau/i.test(symbol) ||
              symbol.toUpperCase() === "LGD"
            ) {
              kategori = "emas (asumsi USD per troy ounce)";
            } else if (
              /silver/i.test(symbol) ||
              /perak/i.test(symbol) ||
              /xag/i.test(symbol) ||
              symbol.toUpperCase() === "LSI"
            ) {
              kategori = "perak (asumsi USD per troy ounce)";
            } else if (/oil|brent|cl/i.test(symbol)) {
              kategori = "minyak (asumsi USD per barrel)";
            } else if (/[A-Z]{3}\/?[A-Z]{3}/.test(symbol)) {
              kategori = "pasangan mata uang (forex)";
            }

            const arah =
              typeof pct === "number"
                ? pct > 0
                  ? "naik"
                  : pct < 0
                  ? "turun"
                  : "stabil"
                : "stabil";

            return (
              `- **${symbol}** (${kategori}) sekitar **${last}**, ` +
              `bergerak ${arah} sekitar ±${change} poin (~${pct}%).`
            );
          })
          .join("\n");
      } else {
        console.error("Quotes HTTP error:", quotesRes.status);
      }
    } catch (err) {
      console.error("Gagal fetch quotes:", err);
    }

    const systemQuotesMessage = {
      role: "system" as const,
      content: quotesSummary
        ? (() => {
            const updateInfo = quotesUpdatedAtLocal
              ? `Data harga terakhir diperbarui sekitar **${quotesUpdatedAtLocal} WIB**.\n\n`
              : "";

            return (
              "Sistem Harga Live (internal Newsmaker):\n\n" +
              updateInfo +
              "Ringkasan harga terkini (hanya referensi internal, rangkai ulang dengan kata-katamu sendiri):\n" +
              quotesSummary +
              "\n\n" +
              "Panduan menjawab:\n" +
              "- Gunakan angka ini hanya ketika pengguna bertanya harga terkini atau pergerakan terbaru.\n" +
              "- Jangan menyalin bullet di atas mentah-mentah sebagai jawaban final.\n" +
              "- Jika instrumen yang diminta tidak ada, jelaskan dengan sopan dan beri konteks edukatif.\n"
            );
          })()
        : "Sistem harga live saat ini tidak berhasil mengambil data. Jika pengguna bertanya harga terkini, jangan mengarang angka; jelaskan bahwa data live sementara tidak tersedia dan beri penjelasan umum.",
    };

    // 4) KALENDER EKONOMI
    const calendarUrl = buildCalendarUrl(CALENDAR_API_URL, targetCalendarDate);

    let calendarSummaryAll = "";
    let calendarSummaryHighImpact = "";
    let calendarHasData = false;

    try {
      const calRes = await fetch(calendarUrl, {
        method: "GET",
        cache: "no-store",
      });

      if (calRes.ok) {
        const calData = await calRes.json();
        const rawEvents = Array.isArray(calData.data) ? calData.data : [];

        const filteredEvents = rawEvents.filter((ev: any) => {
          const eventDate: string | undefined =
            (ev.date as string | undefined) ||
            (ev.details?.history &&
              Array.isArray(ev.details.history) &&
              ev.details.history[0]?.date);

          if (!eventDate) return true;
          return eventDate.startsWith(targetCalendarDate);
        });

        const normalizedEvents = filteredEvents.map((ev: any) => ({
          date: targetCalendarDate,
          time: ev.time ?? "-",
          currency: ev.currency ?? "-",
          impact: ev.impact ?? "-",
          event: ev.event ?? "-",
          previous: ev.previous ?? "-",
          forecast: ev.forecast ?? "-",
          actual: ev.actual ?? "",
        }));

        const events = normalizedEvents.slice(0, 40);
        calendarHasData = events.length > 0;

        const formatImpactLabel = (impact: string): string => {
          const lowerImpact = impact.toLowerCase();
          if (impact.includes("★★★") || lowerImpact.includes("high")) {
            return "tinggi";
          }
          if (impact.includes("★★") || lowerImpact.includes("medium")) {
            return "sedang";
          }
          if (impact.includes("★") || lowerImpact.includes("low")) {
            return "rendah";
          }
          return "tidak diketahui";
        };

        calendarSummaryAll = events
          .map((ev: any) => {
            const {
              time,
              currency,
              impact,
              event,
              previous,
              forecast,
              actual,
            } = ev;
            const actualValue = actual && actual !== "" ? actual : "-";
            const impactLabel = formatImpactLabel(String(impact));

            return (
              `- Pukul ${time}, ${currency} – ${event}. ` +
              `Dampaknya **${impactLabel}** (${impact}). ` +
              `Sebelumnya: ${previous}, perkiraan: ${forecast}, aktual: ${actualValue}.`
            );
          })
          .join("\n");

        const highImpact = events.filter(
          (ev: any) =>
            typeof ev.impact === "string" &&
            (ev.impact.includes("★★★") ||
              ev.impact.toLowerCase().includes("high"))
        );

        calendarSummaryHighImpact =
          highImpact.length > 0
            ? highImpact
                .map((ev: any) => {
                  const { time, currency, impact, event } = ev;
                  return `- Pukul ${time}, ${currency} – ${event} (dampak tinggi ${impact}).`;
                })
                .join("\n")
            : "- Tidak ada event berdampak sangat tinggi (★★★) pada tanggal ini.";
      } else {
        console.error("Calendar HTTP error:", calRes.status);
      }
    } catch (err) {
      console.error("Gagal fetch calendar:", err);
    }

    const parseIso = (iso: string) => {
      const [y, m, d] = iso.split("-").map((v) => Number(v));
      return new Date(y, m - 1, d);
    };

    let calendarHumanLabel = `tanggal ${targetCalendarDate}`;
    try {
      const todayDate = parseIso(todayIso);
      const targetDate = parseIso(targetCalendarDate);

      const diffMs = targetDate.getTime() - todayDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        calendarHumanLabel = `hari ini (${targetCalendarDate})`;
      } else if (diffDays === -1) {
        calendarHumanLabel = `kemarin (${targetCalendarDate})`;
      } else if (diffDays === 1) {
        calendarHumanLabel = `besok (${targetCalendarDate})`;
      } else if (diffDays === -2) {
        calendarHumanLabel = `selumbari (${targetCalendarDate})`;
      } else if (diffDays === 2) {
        calendarHumanLabel = `lusa (${targetCalendarDate})`;
      } else {
        calendarHumanLabel = `tanggal ${targetCalendarDate}`;
      }
    } catch {
      calendarHumanLabel = `tanggal ${targetCalendarDate}`;
    }

    const extraCalendarInstruction = wantsHighImpactOnly
      ? "Pengguna menanyakan event berdampak tinggi (high impact / ★★★). Utamakan event tersebut.\n"
      : isCalendarOverview
      ? "Pengguna menanyakan kalender ekonomi secara umum. Tampilkan seluruh event tanggal tersebut dalam bentuk bullet.\n"
      : "Jika pengguna bertanya event tertentu (NFP, CPI, suku bunga), fokus ke event tersebut.\n";

    const systemCalendarMessage = {
      role: "system" as const,
      content: calendarHasData
        ? (() => {
            const baseHeader = `Kalender ekonomi internal untuk ${calendarHumanLabel}:\n\n`;
            const noteRel =
              `Catatan: hari ini adalah ${todayIso}. ` +
              `Tanggal yang dibahas adalah ${targetCalendarDate}. ` +
              `Gunakan frasa **${calendarHumanLabel}** saat menyebut tanggal ini.\n\n`;

            if (wantsHighImpactOnly) {
              return (
                baseHeader +
                noteRel +
                "Event berdampak tinggi:\n" +
                calendarSummaryHighImpact +
                "\n\n" +
                extraCalendarInstruction
              );
            }

            return (
              baseHeader +
              noteRel +
              "Daftar event utama:\n" +
              calendarSummaryAll +
              "\n\nRingkasan event berdampak tinggi:\n" +
              calendarSummaryHighImpact +
              "\n\n" +
              extraCalendarInstruction
            );
          })()
        : `Kalender ekonomi internal untuk ${calendarHumanLabel} tidak berhasil diambil. Jika pengguna bertanya jadwal rilis, jelaskan keterbatasan data dan jangan mengarang jam/event.`,
    };

    // 5) HISTORICAL DATA
    let historicalSummary = "";
    let historicalFromLabel = "";
    let historicalInstrumentWindowSummary = "";

    try {
      try {
        const url = new URL(HISTORICAL_API_URL);
        const df = url.searchParams.get("dateFrom");
        if (df) historicalFromLabel = df;
      } catch {
        historicalFromLabel = "";
      }

      const histRes = await fetch(HISTORICAL_API_URL, {
        method: "GET",
        cache: "no-store",
      });

      if (histRes.ok) {
        const histData: any = await histRes.json();
        const rows: any[] = Array.isArray(histData.data)
          ? histData.data.slice(0, 2000)
          : [];

        const bySymbol = new Map<string, any[]>();
        for (const row of rows) {
          const symbol: string =
            row.symbol || row.Symbol || row.ticker || row.Ticker || "UNKNOWN";
          if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
          bySymbol.get(symbol)!.push(row);
        }

        const lines: string[] = [];

        for (const [symbol, list] of bySymbol.entries()) {
          if (!list.length) continue;

          const sorted = [...list].sort((a, b) => {
            const da = a.date || a.Date || a.time || a.Time;
            const db = b.date || b.Date || b.time || b.Time;
            const ta = da ? new Date(da).getTime() : 0;
            const tb = db ? new Date(db).getTime() : 0;
            return ta - tb;
          });

          const first = sorted[0];
          const last = sorted[sorted.length - 1];

          const getNum = (obj: any): number | null => {
            const cand =
              obj.close ??
              obj.Close ??
              obj.last ??
              obj.Last ??
              obj.price ??
              obj.Price;
            const n = Number(cand);
            return isFinite(n) ? n : null;
          };

          const startClose = getNum(first);
          const endClose = getNum(last);

          if (startClose === null || endClose === null) continue;

          const absChange = endClose - startClose;
          const pctChange =
            startClose !== 0 ? (absChange / startClose) * 100 : 0;

          let arah =
            "cenderung sideways / bergerak datar dalam periode data yang tersedia.";
          if (pctChange > 15) {
            arah =
              "mengalami kenaikan tajam (uptrend kuat) dalam periode tersebut.";
          } else if (pctChange > 3) {
            arah = "cenderung naik (uptrend) dalam periode tersebut.";
          } else if (pctChange < -15) {
            arah =
              "mengalami penurunan tajam (downtrend kuat) dalam periode tersebut.";
          } else if (pctChange < -3) {
            arah = "cenderung turun (downtrend) dalam periode tersebut.";
          }

          const fmtLocal = (n: number) =>
            Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2);

          lines.push(
            `- **${symbol}**: dari sekitar **${fmtLocal(
              startClose
            )}** menjadi sekitar **${fmtLocal(
              endClose
            )}**, perubahan ±${fmtLocal(
              absChange
            )} poin (~${pctChange.toFixed(
              2
            )}%). Secara garis besar instrumen ini ${arah}`
          );
        }

        historicalSummary = lines.join("\n");

        if (historicalDaysAgo && historicalDaysAgo > 0) {
          const series = pickHistoricalSeriesForInstrument(
            bySymbol,
            requestedInstrument
          );

          if (series && series.rows.length) {
            const { symbol: histSymbol, rows: histRows } = series;

            const datePriceMap = new Map<string, number>();

            for (const row of histRows) {
              const rawDate =
                row.date || row.Date || row.time || row.Time || row.timestamp;
              if (!rawDate) continue;
              const t = new Date(rawDate);
              if (isNaN(t.getTime())) continue;
              const iso = formatDateIso(t);

              const cand =
                row.close ??
                row.Close ??
                row.last ??
                row.Last ??
                row.price ??
                row.Price;
              const priceNum = Number(cand);
              if (!isFinite(priceNum)) continue;

              datePriceMap.set(iso, priceNum);
            }

            const labelInfo =
              INSTRUMENT_LABEL[requestedInstrument] || INSTRUMENT_LABEL.other;
            const instrName =
              requestedInstrument === "other" ? histSymbol : labelInfo.name;
            const unit = labelInfo.unit;

            const maxWindow = Math.min(historicalDaysAgo, 10);
            const detailLines: string[] = [];

            for (let i = maxWindow; i >= 1; i--) {
              const d = new Date(nowJakarta);
              d.setDate(d.getDate() - i);
              const iso = formatDateIso(d);
              const price = datePriceMap.get(iso);
              if (price != null) {
                const priceFmt =
                  Math.abs(price) >= 100 ? price.toFixed(0) : price.toFixed(2);
                detailLines.push(`- ${iso}: sekitar **${priceFmt}** ${unit}.`);
              }
            }

            if (detailLines.length) {
              historicalInstrumentWindowSummary =
                `Ringkasan harga ${instrName} untuk ${maxWindow} hari terakhir (data historis internal):\n` +
                detailLines.join("\n") +
                "\n\n" +
                "Gunakan daftar ini saat pengguna meminta 'historical data X hari sebelumnya' untuk instrumen tersebut.";
            }
          }
        }
      } else {
        console.error("Historical HTTP error:", histRes.status);
      }
    } catch (err) {
      console.error("Gagal fetch historical:", err);
    }

    const historicalRangeLabel = historicalFromLabel
      ? `sejak **${historicalFromLabel}** hingga data terbaru yang tersedia`
      : "selama periode data historis yang tersedia";

    const extraHistoricalInstruction =
      historicalRelativeDateIso && historicalDaysAgo !== null
        ? "Pengguna menggunakan frasa waktu relatif, misalnya **" +
          historicalDaysAgo +
          " hari sebelumnya** dari hari ini (WIB), kira-kira tanggal **" +
          historicalRelativeDateIso +
          "**.\n" +
          "- Jika pertanyaan seperti: 'historical data [instrumen] 5 hari sebelumnya', gunakan data historis instrumen tersebut (jika tersedia) untuk merangkum harga per hari.\n" +
          "- Jika data per hari untuk periode tersebut tidak lengkap, jelaskan keterbatasan dan jangan mengarang angka.\n"
        : "Jika pengguna menggunakan frasa 'X hari sebelumnya' atau 'X hari lalu', anggap X sebagai jumlah hari mundur dari tanggal hari ini (WIB) dan gunakan data historis untuk mendekati tanggal tersebut.\n";

    const systemHistoricalMessage = {
      role: "system" as const,
      content: historicalSummary
        ? "Sistem Data Historis Harga (internal Newsmaker):\n\n" +
          `Ringkasan pergerakan harga ${historicalRangeLabel} (per simbol utama):\n` +
          historicalSummary +
          "\n\n" +
          (historicalInstrumentWindowSummary
            ? historicalInstrumentWindowSummary + "\n\n"
            : "") +
          "Panduan menjawab:\n" +
          "- Gunakan saat pengguna bertanya tentang tren beberapa waktu terakhir atau X hari sebelumnya.\n" +
          "- Jangan mengarang angka historis yang tidak ada di data.\n\n" +
          extraHistoricalInstruction
        : "Sistem tidak berhasil mengambil data historis harga. Jika pengguna bertanya tentang pergerakan historis, jawab secara konseptual tanpa menyebut angka spesifik.",
    };

    // 6) NEWS
    let newsSummaryAll = "";
    let newsSummaryToday = "";
    let newsHasData = false;

    try {
      const newsRes = await fetch(NEWS_API_URL, {
        method: "GET",
        cache: "no-store",
      });

      if (newsRes.ok) {
        const newsData: any = await newsRes.json();
        const rows: any[] = Array.isArray(newsData.data) ? newsData.data : [];

        let filtered = rows;

        if (requestedNewsCategory) {
          filtered = rows.filter((item) => {
            const cat = (item.category ?? "").toLowerCase();
            return cat.includes(requestedNewsCategory.toLowerCase());
          });

          if (filtered.length === 0) {
            filtered = rows;
          }
        }

        const sorted = [...filtered].sort((a, b) => {
          const da = a.published_at || a.createdAt || a.date;
          const db = b.published_at || b.createdAt || b.date;
          const ta = da ? new Date(da).getTime() : 0;
          const tb = db ? new Date(db).getTime() : 0;
          return tb - ta;
        });

        const latest = sorted.slice(0, 15);
        newsHasData = latest.length > 0;

        const allLines: string[] = [];
        const todayLines: string[] = [];

        for (const item of latest) {
          const title: string = item.title ?? "-";
          const category: string = item.category ?? "-";
          const summary: string = item.summary ?? "";
          const link: string = item.source_url ?? item.link ?? "";
          const authorName: string = item.author_name ?? item.author ?? "";
          const lang: string = item.language ?? "";

          const rawDate: string =
            item.published_at || item.createdAt || item.date || "";
          let waktuWib = "";
          let tanggalIsoNews = "";

          if (rawDate) {
            const dt = new Date(rawDate);
            if (!isNaN(dt.getTime())) {
              const dtJakarta = new Date(
                dt.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
              );
              waktuWib = dtJakarta.toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
              });
              tanggalIsoNews = formatDateIso(dtJakarta);
            }
          }

          const jamLabel = waktuWib
            ? `pukul ${waktuWib} WIB`
            : "waktu tidak diketahui";
          const catLabel =
            category && category !== "-"
              ? `kategori **${category.toUpperCase()}**`
              : "kategori tidak disebutkan";
          const langLabel =
            lang && lang.toLowerCase() === "id"
              ? "bahasa Indonesia"
              : lang
              ? `bahasa ${lang}`
              : "";
          const penulisLabel = authorName ? `, ditulis oleh ${authorName}` : "";

          const ringkas =
            summary && summary.length > 0
              ? summary.replace(/\s+/g, " ").trim()
              : "";

          const baseLine =
            `- ${jamLabel}: **${title}** (${catLabel}${
              langLabel ? `, ${langLabel}` : ""
            }${penulisLabel}).` +
            (ringkas ? ` Ringkasan singkat: ${ringkas}` : "") +
            (link ? ` Sumber: ${link}` : "");

          allLines.push(baseLine);

          if (tanggalIsoNews === todayIso) {
            todayLines.push(baseLine);
          }
        }

        newsSummaryAll = allLines.join("\n");
        newsSummaryToday = todayLines.join("\n");
      } else {
        console.error("News HTTP error:", newsRes.status);
      }
    } catch (err) {
      console.error("Gagal fetch news:", err);
    }

    const systemNewsMessage = {
      role: "system" as const,
      content: newsHasData
        ? (() => {
            let txt =
              "Sistem Berita Pasar (internal Newsmaker.id – endpoint `/api/news-id`):\n\n" +
              "Ringkasan beberapa berita/analisis TERBARU di database:\n" +
              newsSummaryAll +
              "\n\n";

            if (newsSummaryToday) {
              txt +=
                "Highlight berita yang TERBIT HARI INI (WIB):\n" +
                newsSummaryToday +
                "\n\n";
            }

            txt +=
              "Panduan menjawab terkait BERITA:\n" +
              "- Jika pengguna bertanya 'berita terbaru tentang apa', pilih 3–5 judul paling relevan lalu jelaskan dengan bahasamu sendiri.\n" +
              "- Jika pengguna menyebut instrumen tertentu, prioritaskan berita yang relevan dengan instrumen tersebut.\n";

            if (isNewsQuery) {
              txt +=
                "\nPengguna tampaknya SEDANG MENANYAKAN BERITA TERBARU. Fokuskan jawabanmu pada 1–3 berita utama yang paling relevan.\n";
            } else {
              txt +=
                "\nJika pengguna tidak menyinggung berita, tidak perlu memaksakan menyebut judul berita.\n";
            }

            return txt;
          })()
        : "Sistem berita pasar Newsmaker.id saat ini tidak berhasil mengambil data. Jika pengguna bertanya 'berita terbaru', jelaskan bahwa data berita internal sedang tidak dapat diakses dan beri penjelasan pasar secara umum.",
    };

    // 7) INSTRUKSI DATA vs GAMBAR
    const systemDataUsageMessage = {
      role: "system" as const,
      content: hasImage
        ? "PENTING: Pesan terakhir pengguna menyertakan GAMBAR/CHART.\n" +
          "- Prioritaskan analisis visual dari gambar tersebut.\n" +
          "- Jangan membuka jawaban hanya dengan rangkuman data live/historis/berita tanpa menyebut chart.\n" +
          "- Data quotes, kalender, historis, dan berita hanya sebagai konteks tambahan.\n"
        : "PENTING: Pesan terakhir pengguna TIDAK menyertakan gambar.\n" +
          "- Untuk pertanyaan harga terkini, gunakan data quotes.\n" +
          "- Untuk tren beberapa waktu terakhir, gunakan data historis.\n" +
          "- Untuk 'historical data [instrumen] X hari sebelumnya', gunakan ringkasan harian jika tersedia.\n" +
          "- Untuk 'berita terbaru tentang apa', gunakan ringkasan berita internal.\n",
    };

    // ======================================================
    // 🔥 SHORT-CIRCUIT 0: FIBONACCI (UP/DOWN)
    // ======================================================
    const isFibQuestion =
      lowerPrompt.includes("fibo") || lowerPrompt.includes("fibonacci");

    if (isFibQuestion) {
      const HL = parseHighLowForFib(userPrompt);
      if (HL) {
        const { H, L } = HL;

        const isDownTrendExplicit =
          /downtren|downtrend|tren turun|trend turun|turun/.test(lowerPrompt);
        const isUpTrendExplicit =
          /uptren|uptrend|tren naik|trend naik|naik/.test(lowerPrompt);

        let mode: "up" | "down" = "up";
        if (isDownTrendExplicit) mode = "down";
        else if (isUpTrendExplicit) mode = "up";

        const up = calcFibUp({ H, L });
        const down = calcFibDown({ H, L });

        const fmtFib = (n: number) => {
          if (!isFinite(n)) return "-";
          return n.toLocaleString("id-ID", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        };

        const D = H - L;

        const headerFib =
          `## Perhitungan Fibonacci – ${
            mode === "down" ? "Downtrend" : "Uptrend"
          }\n\n` +
          `- **High (H)**:\n` +
          `\`${fmtFib(H)}\`\n` +
          `- **Low  (L)**:\n` +
          `\`${fmtFib(L)}\`\n` +
          `- **Range (D = H - L)**:\n` +
          `\`${fmtFib(D)}\`\n\n`;

        let mainBlock = "";

        if (mode === "down") {
          mainBlock +=
            "| _Down Retracement_ | Harga | _Down Projection_ | Harga |\n" +
            "|--------------------|-------|-------------------|-------|\n" +
            `| 78.60%  | **${fmtFib(
              down.retr["78.60%"]
            )}** | 138.20% | **${fmtFib(down.proj["138.20%"])}** |\n` +
            `| 61.80%  | **${fmtFib(
              down.retr["61.80%"]
            )}** | 150.00% | **${fmtFib(down.proj["150.00%"])}** |\n` +
            `| 50.00%  | **${fmtFib(
              down.retr["50.00%"]
            )}** | 161.80% | **${fmtFib(down.proj["161.80%"])}** |\n` +
            `| 38.20%  | **${fmtFib(
              down.retr["38.20%"]
            )}** | 200.00% | **${fmtFib(down.proj["200.00%"])}** |\n` +
            `| 23.60%  | **${fmtFib(
              down.retr["23.60%"]
            )}** | 238.20% | **${fmtFib(down.proj["238.20%"])}** |\n` +
            `| -       | -     | 261.80% | **${fmtFib(
              down.proj["261.80%"]
            )}** |\n`;
        } else {
          mainBlock +=
            "| _Up Retracement_ | Harga | _Up Projection_ | Harga |\n" +
            "|------------------|-------|-----------------|-------|\n" +
            `| 23.60%  | **${fmtFib(
              up.retr["23.60%"]
            )}** | 138.20% | **${fmtFib(up.proj["138.20%"])}** |\n` +
            `| 38.20%  | **${fmtFib(
              up.retr["38.20%"]
            )}** | 150.00% | **${fmtFib(up.proj["150.00%"])}** |\n` +
            `| 50.00%  | **${fmtFib(
              up.retr["50.00%"]
            )}** | 161.80% | **${fmtFib(up.proj["161.80%"])}** |\n` +
            `| 61.80%  | **${fmtFib(
              up.retr["61.80%"]
            )}** | 200.00% | **${fmtFib(up.proj["200.00%"])}** |\n` +
            `| 78.60%  | **${fmtFib(
              up.retr["78.60%"]
            )}** | 238.20% | **${fmtFib(up.proj["238.20%"])}** |\n` +
            `| -       | -     | 261.80% | **${fmtFib(
              up.proj["261.80%"]
            )}** |\n`;
        }

        const footerFib = "\n\n---\n_- Newsmaker23 & Newsmaker Ai -_";

        return NextResponse.json(
          {
            reply: headerFib + mainBlock + footerFib,
            imagePath: null,
          },
          { status: 200 }
        );
      }
    }

    // ======================================================
    // 🔥 SHORT-CIRCUIT PIVOT
    // ======================================================
    const isPivotQuestion =
      lowerPrompt.includes("pivot") || lowerPrompt.includes("pp ");

    if (isPivotQuestion) {
      const ohlc = parseOHLCFromPrompt(userPrompt);
      if (ohlc) {
        const { O, H, L, C } = ohlc;

        const classicPivot = calcClassic({ H, L, C });
        const woodiePivot = calcWoodie({ O, H, L });
        const camarillaPivot = calcCamarilla({ H, L, C });

        const fmt = (n: number) => n.toFixed(2);

        const headerPivot =
          "## Perhitungan Pivot Point\n\n" +
          `- **Open (O)**: \`${fmt(O)}\`\n` +
          `- **High (H)**: \`${fmt(H)}\`\n` +
          `- **Low (L)**: \`${fmt(L)}\`\n` +
          `- **Close (C)**: \`${fmt(C)}\`\n` +
          "---\n\n";

        const PivotBlock =
          "___Pivot Tabel___\n\n" +
          "| Level | Classic | Woodie | Camarilla |\n" +
          "|-------|--------|--------|-----------|\n" +
          `| R4 | ${fmt(classicPivot.R4)} | ${fmt(
            woodiePivot.R4
          )} | ${fmt(camarillaPivot.R4)} |\n` +
          `| **R3** | ${fmt(classicPivot.R3)} | ${fmt(
            woodiePivot.R3
          )} | ${fmt(camarillaPivot.R3)} |\n` +
          `| **R2** | ${fmt(classicPivot.R2)} | ${fmt(
            woodiePivot.R2
          )} | ${fmt(camarillaPivot.R2)} |\n` +
          `| **R1** | ${fmt(classicPivot.R1)} | ${fmt(
            woodiePivot.R1
          )} | ${fmt(camarillaPivot.R1)} |\n` +
          `| **Pivot**  | ${fmt(classicPivot.P)} | ${fmt(
            woodiePivot.P
          )} | ${fmt(camarillaPivot.P)} |\n` +
          `| **S1** | ${fmt(classicPivot.S1)} | ${fmt(
            woodiePivot.S1
          )} | ${fmt(camarillaPivot.S1)} |\n` +
          `| **S2** | ${fmt(classicPivot.S2)} | ${fmt(
            woodiePivot.S2
          )} | ${fmt(camarillaPivot.S2)} |\n` +
          `| **S3** | ${fmt(classicPivot.S3)} | ${fmt(
            woodiePivot.S3
          )} | ${fmt(camarillaPivot.S3)} |\n` +
          `| S4 | ${fmt(classicPivot.S4)} | ${fmt(
            woodiePivot.S4
          )} | ${fmt(camarillaPivot.S4)} |\n\n`;

        const notePivot =
          "---\n\n" +
          "**Note:**\n" +
          "- _**Classic** biasanya paling umum dipakai._\n" +
          "- _**Woodie** cenderung lebih menekankan harga pembukaan._\n" +
          "- _**Camarilla** populer untuk mencari area intraday reversal._";

        return NextResponse.json(
          {
            reply: headerPivot + PivotBlock + notePivot,
            imagePath: null,
          },
          { status: 200 }
        );
      }
    }

    // 🔥 SHORT-CIRCUIT: MARGIN XAUUSD
    const isMarginQuestion =
      lowerPrompt.includes("margin") &&
      (lowerPrompt.includes("xauusd") ||
        lowerPrompt.includes(" emas") ||
        lowerPrompt.includes(" gold"));

    if (isMarginQuestion) {
      const lotMatch = lowerPrompt.match(/(\d+(?:[.,]\d+)?)\s*lot/);
      const lot =
        lotMatch && lotMatch[1]
          ? parseFloat(lotMatch[1].replace(",", "."))
          : 1;

      const levMatch = lowerPrompt.match(
        /leverage\s*1\s*[:/]\s*(\d+(?:[.,]\d+)?)|1\s*[:/]\s*(\d+(?:[.,]\d+)?)/
      );
      let leverage = 100;
      if (levMatch) {
        const levStr = (levMatch[1] || levMatch[2] || "").replace(",", ".");
        const levNum = parseFloat(levStr);
        if (isFinite(levNum) && levNum > 0) leverage = levNum;
      }

      const priceMatch = lowerPrompt.match(/harga\s+(\d+(?:[.,]\d+)?)/);
      let price =
        priceMatch && priceMatch[1]
          ? parseFloat(priceMatch[1].replace(",", "."))
          : NaN;

      if (!isFinite(price) && quotesRows.length > 0) {
        const goldQuote = pickQuoteForInstrument(quotesRows, "gold");
        const lastRaw =
          goldQuote?.last ?? goldQuote?.close ?? goldQuote?.price ?? null;
        const lastNum = Number(lastRaw);
        if (isFinite(lastNum) && lastNum > 0) {
          price = lastNum;
        }
      }

      if (isFinite(price) && price > 0 && leverage > 0) {
        const contractSize = 1000;
        const notionalUsd = price * contractSize * lot;
        const marginUsd = notionalUsd / leverage;
        const kurs = FIXED_USD_IDR_RATE;
        const marginIdr = marginUsd * kurs;

        const fmtUsd = marginUsd.toLocaleString("id-ID", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

        const fmtIdr = marginIdr.toLocaleString("id-ID", {
          minimumFractionDigits: 0,
        });

        const fmtPrice = price.toLocaleString("id-ID", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

        const notionalText = notionalUsd.toLocaleString("id-ID", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

        const replyMargin =
          `Simulasi margin XAUUSD (Gold):\n\n` +
          `- Lot: ${lot} lot\n` +
          `- Harga: sekitar ${fmtPrice} USD per troy ounce\n` +
          `- Ukuran kontrak: ${contractSize.toLocaleString(
            "id-ID"
          )} oz per lot\n` +
          `- Leverage: 1:${leverage}\n\n` +
          `Nilai kontrak (notional) ≈ harga × kontrak × lot\n` +
          `= ${fmtPrice} × ${contractSize.toLocaleString(
            "id-ID"
          )} × ${lot}\n` +
          `≈ ${notionalText} USD\n\n` +
          `Margin yang dibutuhkan ≈ nilai kontrak ÷ leverage\n` +
          `≈ ${fmtUsd} USD (sekitar Rp ${fmtIdr} dengan asumsi 1 USD = Rp ${kurs.toLocaleString(
            "id-ID"
          )}).\n\n` +
          `Ini hanya simulasi edukatif. Syarat margin riil bisa berbeda di masing-masing pialang dan produk.`;

        return NextResponse.json(
          {
            reply: replyMargin,
            imagePath: null,
          },
          { status: 200 }
        );
      }
    }

    // 🔥 SHORT-CIRCUIT: HARGA LANGSUNG
    const isPriceQuestion =
      !lowerPrompt.includes("margin") &&
      !lowerPrompt.includes("leverage") &&
      !lowerPrompt.includes(" lot") &&
      (lowerPrompt.includes("berapa harga") ||
        lowerPrompt.includes("harga berapa") ||
        lowerPrompt.startsWith("harga ") ||
        lowerPrompt.includes("harga emas sekarang") ||
        lowerPrompt.includes("harga xauusd sekarang") ||
        lowerPrompt.includes("price ") ||
        lowerPrompt.includes("quote ")) &&
      quotesRows.length > 0;

    if (isPriceQuestion) {
      const requestedInstrumentsMulti =
        detectInstrumentsFromPromptMulti(userPrompt);

      const instrumentsToShow: InstrumentKey[] =
        requestedInstrumentsMulti.length > 0
          ? requestedInstrumentsMulti
          : [requestedInstrument];

      const linesPrice: string[] = [];

      for (const instr of instrumentsToShow) {
        const quoteRow = pickQuoteForInstrument(quotesRows, instr);
        if (!quoteRow) continue;

        const symbol: string =
          quoteRow.symbol || quoteRow.Symbol || "UNKNOWN";
        const lastRaw =
          quoteRow.last ?? quoteRow.close ?? quoteRow.price ?? null;
        const changeRaw =
          quoteRow.valueChange ?? quoteRow.change ?? quoteRow.diff ?? 0;
        const pctRaw =
          quoteRow.percentChange ??
          quoteRow.pctChange ??
          quoteRow.percentage ??
          0;

        const lastNum = Number(lastRaw);
        const changeNum = Number(changeRaw);
        const pctNum = Number(pctRaw);

        const lastText = isFinite(lastNum)
          ? lastNum.toLocaleString("id-ID", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : String(lastRaw ?? "-");

        const arahChange =
          isFinite(changeNum) && changeNum !== 0
            ? changeNum > 0
              ? "naik"
              : "turun"
            : "relatif stabil";

        const changeText =
          isFinite(changeNum) && changeNum !== 0
            ? `${arahChange} sekitar ${Math.abs(changeNum).toLocaleString(
                "id-ID",
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }
              )} poin`
            : "relatif stabil tanpa perubahan signifikan";

        const pctText =
          isFinite(pctNum) && pctNum !== 0
            ? ` (~${pctNum.toFixed(2)}%)`
            : "";

        const labelInfo = INSTRUMENT_LABEL[instr] || INSTRUMENT_LABEL.other;

        let displayName = labelInfo.name;
        if (instr === "gold") displayName = "Gold";
        if (instr === "silver") displayName = "Silver";
        if (instr === "oil") displayName = "Oil";
        if (instr === "hsi") displayName = "Hang Seng";
        if (instr === "sni") displayName = "Nikkei 225";

        linesPrice.push(
          `- **${displayName}**: sekitar **${lastText}** (${labelInfo.unit}), ` +
            `${changeText}${pctText}.`
        );
      }

      if (linesPrice.length > 0) {
        const updatedInfo = quotesUpdatedAtLocal
          ? ` (pembaruan sekitar ${quotesUpdatedAtLocal} WIB)`
          : "";

        const replyPrice =
          `Harga terkini berdasarkan data internal Newsmaker${updatedInfo}:\n\n` +
          linesPrice.join("\n") +
          "\n\nJika mau, kamu bisa minta penjelasan faktor yang mempengaruhi salah satu instrumen di atas.";

        return NextResponse.json(
          {
            reply: replyPrice,
            imagePath: null,
          },
          { status: 200 }
        );
      }
    }

    // 🔥 SHORT-CIRCUIT: KALENDER (overview)
    if (isCalendarOverview) {
      if (calendarHasData) {
        const headerCal = `Kalender ekonomi ${calendarHumanLabel} di sistem Newsmaker:\n\n`;
        const bodyCal = wantsHighImpactOnly
          ? calendarSummaryHighImpact ||
            "- Tidak ada event berdampak sangat tinggi (★★★) pada tanggal ini."
          : calendarSummaryAll ||
            "- Tidak ada event terdaftar pada tanggal ini di sistem Newsmaker.";

        const noteCal = wantsHighImpactOnly
          ? "\n\nFokus di atas hanya event berdampak tinggi. Jika ingin melihat semua event, tulis saja: kalender ekonomi hari ini lengkap."
          : "";

        return NextResponse.json(
          {
            reply: headerCal + bodyCal + noteCal,
            imagePath: null,
          },
          { status: 200 }
        );
      } else {
        const msgCal =
          `Kalender ekonomi ${calendarHumanLabel} di sistem Newsmaker saat ini tidak tersedia atau kosong.\n` +
          "Jadi, NM Ai tidak bisa menyebut jam dan event spesifik untuk hari ini. " +
          "Kalau mau, NM Ai bisa jelaskan contoh event ekonomi penting secara umum tanpa menyebut tanggal dan jam tertentu.";

        return NextResponse.json(
          {
            reply: msgCal,
            imagePath: null,
          },
          { status: 200 }
        );
      }
    }

    // ====== SUSUN USER CONTENT (TEXT + FILE + IMAGE) ======
    const fileContextText = uploadedFileText
      ? `\n\n=== DATA DARI FILE TERLAMPIR ===\n` +
        `Format bisa berupa teks/CSV/Excel yang sudah diringkas ke tabel.\n\n` +
        uploadedFileText
      : "";

    const userContentParts: any[] = [
      {
        type: "input_text",
        text: userPrompt + fileContextText,
      },
    ];

    if (hasImage && base64Image && imageMimeType) {
      userContentParts.push({
        type: "input_image",
        image_url: `data:${imageMimeType};base64,${base64Image}`,
        detail: "auto",
      });
    }

    // ====== SUSUN messages UNTUK RESPONSES API ======
    const systemMessages = [
      systemPersonaMessage,
      systemTimeMessage,
      systemNoUpdateBlockMessage,
      systemFxRuleMessage,
      systemQuotesMessage,
      systemCalendarMessage,
      systemHistoricalMessage,
      systemNewsMessage,
      systemDataUsageMessage,
    ];

    const historyMessagesForModel = historyMessagesRaw.map((hm) => ({
      role:
        hm.role === "ai" || hm.role === "assistant" ? "assistant" : "user",
      content: toText(hm.content),
    }));

    const userMessageForModel = {
      role: "user" as const,
      content: userContentParts,
    };

    const messagesForModel: any[] = [
      ...systemMessages,
      ...historyMessagesForModel,
      userMessageForModel,
    ];

    // ====== PANGGIL OPENAI (RESPONSES API) ======
    const aiResponse: any = await openai.responses.create({
      model: OPENAI_MODEL,
      input: messagesForModel,
      store: false,
    });

    let reply: string = "NM Ai tidak memberikan respon.";

    if (typeof aiResponse.output_text === "string") {
      reply = aiResponse.output_text;
    } else if (Array.isArray(aiResponse.output)) {
      for (const item of aiResponse.output) {
        const msg = (item as any).message;
        if (msg?.content && Array.isArray(msg.content)) {
          const texts = msg.content
            .filter(
              (c: any) =>
                c?.type === "output_text" || c?.text
            )
            .map((c: any) => c.text)
            .filter(Boolean);
          if (texts.length) {
            reply = texts.join("\n");
            break;
          }
        }
      }
    }

    return NextResponse.json(
      {
        reply,
        imagePath: null,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("API /chatgpt error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: String(err) },
      { status: 500 }
    );
  }
}
