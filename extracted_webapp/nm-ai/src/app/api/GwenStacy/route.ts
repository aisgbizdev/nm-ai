// src/app/api/GwenStacy/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// =============== KALENDER TABLE UTILS ==================
import { buildCalendarTable, CalendarEventRow } from "./utils/calendarContext";

// =============== TRADING RULES CONFIG IMPORTS ==================
import { INDEX_MARGIN_CONFIG } from "./config/indexMarginConfig";
import { COMMODITY_MARGIN_CONFIG } from "./config/commodityMarginConfig";
import { CURRENCY_MARGIN_CONFIG } from "./config/currencyMarginConfig";

// =============== TRADING RULES UTILS (TABLE BUILDER) ============
import {
  buildTradingRulesTableThreeCols,
  GenericMarginConfig,
} from "./utils/tradingRules";

// =============== COMMON & UTILS BARU ==================
import { toText } from "./utils/common";
import {
  calcClassic,
  calcWoodie,
  calcCamarilla,
  calcFibUp,
  calcFibDown,
  parseHighLowForFib,
  parseOHLCFromPrompt,
} from "./utils/pivotFib";

import { formatDateIso, detectRequestedDate } from "./utils/dateUtils";

import {
  InstrumentKey,
  INSTRUMENT_LABEL,
  FIXED_USD_IDR_RATE,
  detectInstrumentFromPrompt,
  detectInstrumentsFromPromptMulti,
  pickHistoricalSeriesForInstrument,
  pickQuoteForInstrument,
} from "./utils/instrumentUtils";

// =============== OLLAMA CONFIG ==================
const OLLAMA_BASE_URL = (
  process.env.OLLAMA_BASE_URL || "http://localhost:11434"
).replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "NM-Ai";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || "7000");

// =============== OPENAI CONFIG ==================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

// Token budget controls
const OPENAI_MAX_TOKENS = Number(process.env.OPENAI_MAX_TOKENS || "120"); // output cap
const OPENAI_TEMPERATURE = Number(process.env.OPENAI_TEMPERATURE || "0.2");

// Prompt cache (optional). Banyak model TIDAK support -> kita auto retry tanpa cache.
const OPENAI_ENABLE_PROMPT_CACHE =
  (process.env.OPENAI_ENABLE_PROMPT_CACHE || "0") === "1";
const OPENAI_PROMPT_CACHE_RETENTION =
  process.env.OPENAI_PROMPT_CACHE_RETENTION || "in_memory";

// ================== DATA SOURCE URL ==================
const QUOTES_API_URL =
  process.env.QUOTES_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/quotes";

// ✅ TODAY khusus
const CALENDAR_TODAY_API_URL =
  process.env.CALENDAR_TODAY_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/calendar/today";

// ✅ WEEK
const CALENDAR_WEEK_API_URL =
  process.env.CALENDAR_WEEK_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/calendar/this-week";

const HISTORICAL_API_URL =
  process.env.HISTORICAL_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/historical?dateFrom=2025-07-01";

const NEWS_API_URL =
  process.env.NEWS_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/news-id";

// ================== TIPE MESSAGE CORE ==================
type CoreMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
};

// ======================================================
// ✅ SYSTEM PREFIX (DIBUAT RINGKAS BIAR TOKEN IRIT)
// ======================================================
const SYSTEM_PREFIX_LITE = `
Kamu adalah NM Ai (Newsmaker.id).
Aturan: jawab Bahasa Indonesia, singkat-jelas-edukatif.
Jangan mengarang data. Kalau data internal tidak tersedia, bilang "data tidak tersedia".
Tidak ada ajakan transaksi/investasi.
`.trim();

// ================== HELPER: STRIP <think> ==================
function stripThinkBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// ================== HELPER: SAFE TRIM ==================
function clampText(s: string, maxChars: number) {
  const t = (s || "").trim();
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars).trimEnd() + "…";
}

// ================== SELECTIVE INJECTION ==================
function shouldIncludeQuotes(p: string) {
  const s = p.toLowerCase();
  return (
    s.includes("harga") ||
    s.includes("price") ||
    s.includes("quote") ||
    s.includes("xau") ||
    s.includes("emas") ||
    s.includes("gold") ||
    s.includes("xag") ||
    s.includes("perak") ||
    s.includes("silver") ||
    s.includes("oil") ||
    s.includes("minyak") ||
    /[A-Z]{3}\/?[A-Z]{3}/.test(p)
  );
}
function shouldIncludeCalendar(p: string) {
  const s = p.toLowerCase();
  return (
    s.includes("kalender") || s.includes("calendar") || s.includes("event")
  );
}
function shouldIncludeNews(p: string) {
  const s = p.toLowerCase();
  return s.includes("berita") || s.includes("news") || s.includes("headline");
}
function shouldIncludeHistorical(p: string) {
  const s = p.toLowerCase();
  return (
    s.includes("historical") ||
    s.includes("histori") ||
    s.includes("hari lalu") ||
    s.includes("hari sebelumnya")
  );
}
function shouldIncludeFxRules(p: string) {
  const s = p.toLowerCase();
  return (
    s.includes("idr") ||
    s.includes("rupiah") ||
    s.includes("kurs") ||
    s.includes("konversi") ||
    s.includes("margin") ||
    s.includes("leverage")
  );
}

// ================== HELPER: CALL OLLAMA ==================
async function callOllamaChat(messages: CoreMessage[]): Promise<string> {
  if (!OLLAMA_BASE_URL) throw new Error("OLLAMA_BASE_URL is not configured");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        options: {
          temperature: 0.2,
          top_p: 0.9,
          top_k: 40,
          repeat_penalty: 1.05,
          num_ctx: 4096,
          num_predict: 220,
          seed: 1,
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Ollama HTTP ${res.status}: ${errText}`);
    }

    const json: any = await res.json();
    const raw = json?.message?.content?.toString() || "";
    return stripThinkBlocks(raw || "");
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") {
      throw new Error(
        `Ollama timeout setelah ${OLLAMA_TIMEOUT_MS} ms – fallback ke OpenAI`
      );
    }
    throw err;
  }
}

// ================== HELPER: CONVERT TO OPENAI FORMAT ==================
function toOpenAIChatMessages(coreMessages: CoreMessage[]) {
  return coreMessages.map((msg) => {
    if (msg.role === "user" && msg.images && msg.images.length > 0) {
      const parts: any[] = [
        { type: "text", text: msg.content },
        ...msg.images.map((img) => ({
          type: "image_url",
          image_url: { url: `data:image/png;base64,${img}` },
        })),
      ];
      return { role: "user", content: parts };
    }
    return { role: msg.role, content: msg.content };
  });
}

// ================== HELPER: CALL OPENAI (AUTO RETRY NO-CACHE) ==================
async function callOpenAIChat(args: {
  coreMessages: CoreMessage[];
  apiKey: string;
  model: string;
  promptCacheKey: string;
  enableCache: boolean;
}): Promise<string> {
  const { coreMessages, apiKey, model, promptCacheKey } = args;

  const openaiMessages = toOpenAIChatMessages(coreMessages);

  const bodyWithMaybeCache: any = {
    model,
    messages: openaiMessages,
    temperature: OPENAI_TEMPERATURE,
    max_tokens: OPENAI_MAX_TOKENS,
  };

  if (args.enableCache) {
    bodyWithMaybeCache.prompt_cache_key = promptCacheKey;
    bodyWithMaybeCache.prompt_cache_retention = OPENAI_PROMPT_CACHE_RETENTION;
  }

  const doReq = async (payload: any) => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text().catch(() => "");
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      const msg = json?.error?.message || text || `OpenAI HTTP ${res.status}`;
      const param = json?.error?.param || "";
      const code = json?.error?.code || "";
      const err = new Error(`OpenAI HTTP ${res.status}: ${text || msg}`);
      (err as any).__openai = { status: res.status, msg, param, code };
      throw err;
    }

    // debug usage
    const cached = json?.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const promptTokens = json?.usage?.prompt_tokens ?? 0;
    const totalTokens = json?.usage?.total_tokens ?? 0;
    console.log(
      "[OpenAI usage] cached_tokens =",
      cached,
      "prompt_tokens =",
      promptTokens,
      "total_tokens =",
      totalTokens
    );

    const reply =
      json?.choices?.[0]?.message?.content?.toString() ||
      "NM Ai tidak memberikan respon.";
    return reply;
  };

  try {
    return await doReq(bodyWithMaybeCache);
  } catch (e: any) {
    const info = e?.__openai;
    const msg: string = info?.msg || e?.message || "";

    const looksLikeCacheNotSupported =
      (info?.status === 400 &&
        (info?.param === "prompt_cache_retention" ||
          info?.param === "prompt_cache_key" ||
          /not supported/i.test(msg))) ||
      /prompt_cache_retention is not supported/i.test(msg);

    if (args.enableCache && looksLikeCacheNotSupported) {
      console.warn(
        "[OpenAI] Cache param tidak didukung oleh model ini. Retry tanpa cache..."
      );
      const payloadNoCache = {
        model,
        messages: openaiMessages,
        temperature: OPENAI_TEMPERATURE,
        max_tokens: OPENAI_MAX_TOKENS,
      };
      return await doReq(payloadNoCache);
    }

    throw e;
  }
}

// ================== CALENDAR NORMALIZER (TODAY & THIS-WEEK) ==================
function normalizeCalendarResponse(
  calData: any,
  fallbackDate: string
): CalendarEventRow[] {
  const rows: CalendarEventRow[] = [];

  const pushEv = (ev: any, date: string) => {
    rows.push({
      date: ev.date ?? ev.Date ?? date,
      time: ev.time ?? "-",
      currency: ev.currency ?? "-",
      impact: ev.impact ?? "-",
      event: ev.event ?? ev.title ?? "-",
      previous: ev.previous ?? "-",
      forecast: ev.forecast ?? "-",
      actual: ev.actual ?? "",
    });
  };

  const data = calData?.data;

  // Case A: /today => data = [ {time,currency,event,...}, ... ]
  if (Array.isArray(data) && data.length && (data[0]?.time || data[0]?.event)) {
    for (const ev of data) pushEv(ev, fallbackDate);
    return rows;
  }

  // Case B: /this-week => data = [ {date:'YYYY-MM-DD', data:[...]} ] / [ {date, events:[...]} ]
  if (Array.isArray(data) && data.length && data[0]?.date) {
    for (const day of data) {
      const d = String(day.date || fallbackDate);
      const events = day.events || day.data || day.items || [];
      if (Array.isArray(events)) {
        for (const ev of events) pushEv(ev, d);
      }
    }
    return rows;
  }

  // Case C: data = { date:'YYYY-MM-DD', data:[...] } or {date, events:[...]}
  if (data && typeof data === "object" && data.date) {
    const d = String(data.date || fallbackDate);
    const events = data.events || data.data || data.items || [];
    if (Array.isArray(events)) {
      for (const ev of events) pushEv(ev, d);
    }
    return rows;
  }

  return rows;
}

// ======================================================
// ================ HANDLER POST ========================
// ======================================================
export async function POST(req: NextRequest) {
  try {
    const sessionKey = req.headers.get("x-session-id") || "anon";
    const PROMPT_CACHE_KEY = `nm-ai:gwenstacy:${sessionKey}`;

    const formData = await req.formData();
    const prompt = (formData.get("prompt") as string) || "";
    const historyRaw = formData.get("history") as string | null;
    const file = formData.get("file") as File | null;

    let base64Image: string | null = null;
    let historyMessages: { role: string; content: any }[] = [];

    if (historyRaw) {
      try {
        const parsed = JSON.parse(historyRaw);
        if (Array.isArray(parsed)) {
          // ✅ hemat token: simpan sedikit aja
          historyMessages = parsed.slice(-4);
        }
      } catch (e) {
        console.error("Gagal parse history:", e);
      }
    }

    if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      base64Image = buffer.toString("base64");
    }

    const hasImage = !!base64Image;

    const userPrompt =
      prompt.trim() ||
      (hasImage
        ? "Tolong analisis gambar/chart yang saya kirim secara edukatif."
        : "Tolong berikan wawasan edukatif seputar pasar.");

    const lowerPrompt = userPrompt.toLowerCase();

    // ===========================
    // SHORT-CIRCUIT 1: TRADING RULES
    // ===========================
    const isTradingRulesQuestion =
      lowerPrompt.includes("trading rules") ||
      lowerPrompt.includes("trading rule") ||
      lowerPrompt.includes("aturan trading") ||
      lowerPrompt.includes("regulasi trading") ||
      lowerPrompt.includes("rule trading");

    const isTradingRulesTableQuestion =
      isTradingRulesQuestion &&
      (lowerPrompt.includes("tabel") || lowerPrompt.includes("table"));

    if (isTradingRulesTableQuestion) {
      const indexTableMd = buildTradingRulesTableThreeCols(
        "Index & Global Index",
        INDEX_MARGIN_CONFIG
      );

      const commodityTableMd = buildTradingRulesTableThreeCols(
        "Commodity (Gold, Silver, Oil, dll.)",
        COMMODITY_MARGIN_CONFIG
      );

      const currencyTableMd = buildTradingRulesTableThreeCols(
        "Currency (Forex Pairs)",
        CURRENCY_MARGIN_CONFIG
      );

      const tablesSection =
        "# 📊 Tabel Trading Rules NM Standard\n\n" +
        "### 1️⃣ Index & Global Index\n\n" +
        indexTableMd +
        "\n\n### 2️⃣ Commodity (Gold, Silver, Oil, dll.)\n\n" +
        commodityTableMd +
        "\n\n### 3️⃣ Currency (Forex Pairs)\n\n" +
        currencyTableMd +
        "\n\n_Ini ketentuan produk. Manajemen risiko tetap menyesuaikan profil risiko masing-masing._";

      return NextResponse.json(
        { reply: tablesSection, imagePath: null },
        { status: 200 }
      );
    }

    if (isTradingRulesQuestion) {
      const replyStandard = [
        "Ringkasan **Trading Rules NM Standard** (edukatif):",
        "- Margin call & auto liquidation mengikuti ketentuan produk.",
        "- Jenis order: MO/LO/SO/OCO.",
        "- Rollover/overnight bisa ada biaya (sesuai ketentuan).",
        "- Jaga kerahasiaan UserID/Password/OTP.",
        "",
        "_Catatan: edukasi, bukan ajakan transaksi._",
      ].join("\n");

      return NextResponse.json(
        { reply: replyStandard, imagePath: null },
        { status: 200 }
      );
    }

    // ===========================
    // SHORT-CIRCUIT 2: FIBONACCI
    // ===========================
    const isFibQuestion =
      lowerPrompt.includes("fibo") || lowerPrompt.includes("fibonacci");

    if (isFibQuestion) {
      const HL = parseHighLowForFib(userPrompt);

      const wantsUpOnly =
        /\b(uptren|uptrend|tren naik|trend naik)\b/i.test(lowerPrompt) &&
        !/\b(downtren|downtrend|tren turun|trend turun)\b/i.test(lowerPrompt);

      const wantsDownOnly =
        /\b(downtren|downtrend|tren turun|trend turun)\b/i.test(lowerPrompt) &&
        !/\b(uptren|uptrend|tren naik|trend naik)\b/i.test(lowerPrompt);

      const wantsBoth = !wantsUpOnly && !wantsDownOnly;

      if (!HL) {
        const modeHint = wantsUpOnly
          ? "uptrend"
          : wantsDownOnly
          ? "downtrend"
          : "uptrend & downtrend";

        return NextResponse.json(
          {
            reply:
              `Untuk hitung Fibonacci (${modeHint}), gue butuh **High (H)** dan **Low (L)**.\n` +
              "Contoh:\n" +
              "- `fibo H=2450 L=2380`\n" +
              "- `fibo uptren H=2450 L=2380`\n" +
              "- `fibo downtren H=2450 L=2380`\n",
            imagePath: null,
          },
          { status: 200 }
        );
      }

      const { H, L } = HL;
      const up = calcFibUp({ H, L });
      const down = calcFibDown({ H, L });

      const fmt = (n: number) =>
        isFinite(n)
          ? n.toLocaleString("id-ID", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : "-";

      const D = H - L;

      const title = wantsUpOnly
        ? "Uptrend"
        : wantsDownOnly
        ? "Downtrend"
        : "Uptrend + Downtrend";

      const makeHdr = (mode: "up" | "down") => {
        const cols =
          mode === "up"
            ? `| Low | High | Diff |\n|---|---|---:|\n| ${fmt(L)} | ${fmt(
                H
              )} | ${fmt(D)} |\n\n`
            : `| High | Low | Diff |\n|---|---|---:|\n| ${fmt(H)} | ${fmt(
                L
              )} | ${fmt(D)} |\n\n`;

        return cols;
      };

      const header =
        `## Fibonacci (${title})\n\n` +
        (wantsUpOnly
          ? makeHdr("up")
          : wantsDownOnly
          ? makeHdr("down")
          : `### Header Uptrend\n\n${makeHdr(
              "up"
            )}---\n\n### Header Downtrend\n\n${makeHdr("down")}`) +
        `---\n\n`;

      const upBlock =
        "### ✅ Uptrend (Retracement)\n\n" +
        "| Up Retracement | Harga |\n" +
        "|---|---:|\n" +
        `| 23.6% | ${fmt(up.retr["23.60%"])} |\n` +
        `| 38.2% | ${fmt(up.retr["38.20%"])} |\n` +
        `| 50.0% | ${fmt(up.retr["50.00%"])} |\n` +
        `| 61.8% | ${fmt(up.retr["61.80%"])} |\n` +
        `| 78.6% | ${fmt(up.retr["78.60%"])} |\n` +
        `---\n\n`;

      const downBlock =
        "### ✅ Downtrend (Retracement)\n\n" +
        "| Down Retracement | Harga |\n" +
        "|---|---:|\n" +
        `| 78.6% | ${fmt(down.retr["78.60%"])} |\n` +
        `| 61.8% | ${fmt(down.retr["61.80%"])} |\n` +
        `| 50.0% | ${fmt(down.retr["50.00%"])} |\n` +
        `| 38.2% | ${fmt(down.retr["38.20%"])} |\n` +
        `| 23.6% | ${fmt(down.retr["23.60%"])} |\n` +
        `---\n\n`;

      const footer =
        "> **Catatan**:\n" +
        "> - Ini output **dua mode sekaligus** biar kamu tinggal pilih sesuai tren.\n" +
        "> - Jika ingin menggunakan Fibonacci **uptrend** berikan level **low** dan **high**\n" +
        "> - Jika ingin menggunakan Fibonacci **downtrend** berikan level **high** dan **low**\n";

      const body = wantsUpOnly
        ? upBlock
        : wantsDownOnly
        ? downBlock
        : upBlock + downBlock;

      return NextResponse.json(
        { reply: header + body + footer, imagePath: null },
        { status: 200 }
      );
    }

    // ===========================
    // SHORT-CIRCUIT 3: PIVOT
    // ===========================
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

        const reply =
          "## Pivot Point\n\n" +
          `O=${fmt(O)} H=${fmt(H)} L=${fmt(L)} C=${fmt(C)}\n\n` +
          "| Level | Classic | Woodie | Camarilla |\n" +
          "|---|---:|---:|---:|\n" +
          `| R3 | ${fmt(classicPivot.R3)} | ${fmt(woodiePivot.R3)} | ${fmt(
            camarillaPivot.R3
          )} |\n` +
          `| R2 | ${fmt(classicPivot.R2)} | ${fmt(woodiePivot.R2)} | ${fmt(
            camarillaPivot.R2
          )} |\n` +
          `| R1 | ${fmt(classicPivot.R1)} | ${fmt(woodiePivot.R1)} | ${fmt(
            camarillaPivot.R1
          )} |\n` +
          `| P  | ${fmt(classicPivot.P)}  | ${fmt(woodiePivot.P)}  | ${fmt(
            camarillaPivot.P
          )} |\n` +
          `| S1 | ${fmt(classicPivot.S1)} | ${fmt(woodiePivot.S1)} | ${fmt(
            camarillaPivot.S1
          )} |\n` +
          `| S2 | ${fmt(classicPivot.S2)} | ${fmt(woodiePivot.S2)} | ${fmt(
            camarillaPivot.S2
          )} |\n` +
          `| S3 | ${fmt(classicPivot.S3)} | ${fmt(woodiePivot.S3)} | ${fmt(
            camarillaPivot.S3
          )} |\n`;

        return NextResponse.json({ reply, imagePath: null }, { status: 200 });
      }
    }

    // ===========================
    // SHORT-CIRCUIT 4: MARGIN XAUUSD
    // ===========================
    const isMarginQuestion =
      lowerPrompt.includes("margin") &&
      (lowerPrompt.includes("xauusd") ||
        lowerPrompt.includes(" emas") ||
        lowerPrompt.includes(" gold"));

    // ====== Decide data fetch needs ======
    const requestedInstrument: InstrumentKey =
      detectInstrumentFromPrompt(userPrompt);

    const wantsQuotes = shouldIncludeQuotes(userPrompt) || isMarginQuestion;
    const wantsCalendar = shouldIncludeCalendar(userPrompt);
    const wantsNews = shouldIncludeNews(userPrompt);
    const wantsHistorical = shouldIncludeHistorical(userPrompt);

    // ================== Waktu Jakarta ==================
    const nowJakarta = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
    );
    const todayIso = formatDateIso(nowJakarta);

    // ================== Parse tanggal kalender ==================
    const targetCalendarDate = detectRequestedDate(userPrompt) || todayIso;
    const isCalendarToday = targetCalendarDate === todayIso;

    // ================== Parse "X hari sebelumnya" ==================
    const historicalDaysAgoMatch = lowerPrompt.match(
      /(\d+)\s*hari\s*(sebelum(?:nya)?|yg lalu|yang lalu|lalu)/
    );
    let historicalDaysAgo: number | null = null;
    if (historicalDaysAgoMatch) {
      const n = parseInt(historicalDaysAgoMatch[1], 10);
      if (!isNaN(n) && n > 0 && n < 3650) historicalDaysAgo = n;
    }

    // ================== Fetch data selectively ==================
    let quotesRows: any[] = [];
    let quotesUpdatedAtLocal = "";
    let quotesSummary = "";

    let calendarHasData = false;
    let calendarTableAll = "";
    let calendarTableHighImpact = "";
    let calendarDateFilterNote = ""; // ✅ catatan kalau request by-date tapi endpoint cuma week/today

    let historicalInstrumentWindowSummary = "";

    let newsHasData = false;
    let newsSummaryAll = "";
    let newsSummaryToday = "";

    // ---- QUOTES ----
    if (wantsQuotes) {
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
          quotesRows = rows;

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

          // ✅ hemat token: hanya 1–3 instrumen relevan
          const wanted = detectInstrumentsFromPromptMulti(userPrompt);
          const picks: InstrumentKey[] = wanted.length
            ? wanted
            : [requestedInstrument];
          const pickedRows = picks
            .map((k) => pickQuoteForInstrument(rows, k))
            .filter(Boolean)
            .slice(0, 3);

          quotesSummary = pickedRows
            .map((q: any) => {
              const symbol = q.symbol ?? "-";
              const last = q.last ?? q.close ?? q.price ?? "-";
              const pct = Number(q.percentChange ?? 0);
              return `- ${symbol}: ${last} (${
                isFinite(pct) ? pct.toFixed(2) : "0.00"
              }%)`;
            })
            .join("\n");
        }
      } catch (e) {
        console.error("Quotes fetch error:", e);
      }
    }

    // ---- CALENDAR ----
    if (wantsCalendar) {
      try {
        const calendarUrl = isCalendarToday
          ? CALENDAR_TODAY_API_URL
          : CALENDAR_WEEK_API_URL;

        const calRes = await fetch(calendarUrl, {
          method: "GET",
          cache: "no-store",
        });

        if (calRes.ok) {
          const calData = await calRes.json();

          const allNormalized = normalizeCalendarResponse(
            calData,
            isCalendarToday ? todayIso : targetCalendarDate
          );

          let normalized = allNormalized;

          // ✅ kalau user minta tanggal selain hari ini: coba filter dari weekly
          if (!isCalendarToday) {
            const hasRealDate = allNormalized.some((x) => !!x.date);
            const filtered = allNormalized.filter(
              (x) => x.date === targetCalendarDate
            );

            if (filtered.length > 0) {
              normalized = filtered;
            } else {
              if (hasRealDate) {
                calendarDateFilterNote = `Catatan: Data minggu ini tidak menemukan event untuk tanggal ${targetCalendarDate}. Ditampilkan data minggu ini.`;
              } else {
                calendarDateFilterNote =
                  "Catatan: Endpoint this-week tidak menyediakan field tanggal per event, jadi tidak bisa dipilah per hari. Ditampilkan data minggu ini.";
              }
              normalized = allNormalized;
            }
          }

          const limited = normalized.slice(0, 20); // ✅ hemat token
          calendarHasData = limited.length > 0;

          const highImpact = limited.filter(
            (ev) =>
              typeof ev.impact === "string" &&
              (ev.impact.includes("★★★") ||
                ev.impact.toLowerCase().includes("high"))
          );

          calendarTableAll = buildCalendarTable(limited.slice(0, 10), {
            emptyMessage: "- Tidak ada event pada tanggal ini.",
          });

          calendarTableHighImpact = buildCalendarTable(highImpact.slice(0, 8), {
            emptyMessage:
              "- Tidak ada event high impact (★★★) pada tanggal ini.",
          });
        }
      } catch (e) {
        console.error("Calendar fetch error:", e);
      }
    }

    // ---- HISTORICAL ----
    if (wantsHistorical) {
      try {
        const histRes = await fetch(HISTORICAL_API_URL, {
          method: "GET",
          cache: "no-store",
        });
        if (histRes.ok) {
          const histData: any = await histRes.json();
          const rows: any[] = Array.isArray(histData.data) ? histData.data : [];

          const bySym = new Map<string, any[]>();
          for (const row of rows) {
            const symbol: string =
              row.symbol || row.Symbol || row.ticker || row.Ticker || "UNKNOWN";
            if (!bySym.has(symbol)) bySym.set(symbol, []);
            bySym.get(symbol)!.push(row);
          }

          const series = pickHistoricalSeriesForInstrument(
            bySym,
            requestedInstrument
          );
          if (series && series.rows.length) {
            const maxWindow = Math.min(historicalDaysAgo || 5, 7);

            const datePriceMap = new Map<string, number>();
            for (const row of series.rows) {
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
            const detailLines: string[] = [];

            for (let i = maxWindow; i >= 1; i--) {
              const d = new Date(nowJakarta);
              d.setDate(d.getDate() - i);
              const iso = formatDateIso(d);
              const price = datePriceMap.get(iso);
              if (price != null) {
                detailLines.push(
                  `- ${iso}: ${price.toFixed(2)} ${labelInfo.unit}`
                );
              }
            }

            if (detailLines.length) {
              historicalInstrumentWindowSummary =
                `Ringkasan historis ${labelInfo.name} (max ${maxWindow} hari):\n` +
                detailLines.join("\n");
            }
          }
        }
      } catch (e) {
        console.error("Historical fetch error:", e);
      }
    }

    // ---- NEWS ----
    if (wantsNews) {
      try {
        const newsRes = await fetch(NEWS_API_URL, {
          method: "GET",
          cache: "no-store",
        });
        if (newsRes.ok) {
          const newsData: any = await newsRes.json();
          const rows: any[] = Array.isArray(newsData.data) ? newsData.data : [];
          if (rows.length > 0) {
            const sorted = [...rows].sort((a, b) => {
              const da = a.published_at || a.createdAt || a.date;
              const db = b.published_at || b.createdAt || b.date;
              return (
                (db ? new Date(db).getTime() : 0) -
                (da ? new Date(da).getTime() : 0)
              );
            });

            const latest = sorted.slice(0, 3); // ✅ hemat token: top 3
            newsHasData = latest.length > 0;

            const allLines: string[] = [];
            const todayLines: string[] = [];

            for (const item of latest) {
              const title: string = item.title ?? "-";
              const rawDate: string =
                item.published_at || item.createdAt || item.date || "";
              let tanggalIsoNews = "";
              if (rawDate) {
                const dt = new Date(rawDate);
                if (!isNaN(dt.getTime())) {
                  const dtJakarta = new Date(
                    dt.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
                  );
                  tanggalIsoNews = formatDateIso(dtJakarta);
                }
              }

              const line = `- ${title}`;
              allLines.push(line);
              if (tanggalIsoNews === todayIso) todayLines.push(line);
            }

            newsSummaryAll = allLines.join("\n");
            newsSummaryToday = todayLines.join("\n");
          }
        }
      } catch (e) {
        console.error("News fetch error:", e);
      }
    }

    // ===========================
    // SHORT-CIRCUIT 4 (lanjut): margin xauusd
    // ===========================
    if (isMarginQuestion) {
      const lotMatch = lowerPrompt.match(/(\d+(?:[.,]\d+)?)\s*lot/);
      const lot =
        lotMatch && lotMatch[1] ? parseFloat(lotMatch[1].replace(",", ".")) : 1;

      const levMatch = lowerPrompt.match(
        /leverage\s*1\s*[:/]\s*(\d+(?:[.,]\d+)?)|1\s*[:/]\s*(\d+(?:[.,]\d+)?)/i
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
        if (isFinite(lastNum) && lastNum > 0) price = lastNum;
      }

      if (isFinite(price) && price > 0 && leverage > 0) {
        const contractSize = 100;
        const notionalUsd = price * contractSize * lot;
        const marginUsd = notionalUsd / leverage;
        const kurs = FIXED_USD_IDR_RATE;
        const marginIdr = marginUsd * kurs;

        const replyMargin =
          `Simulasi margin XAUUSD (Gold):\n\n` +
          `- Lot: ${lot}\n` +
          `- Harga: ~${price.toFixed(2)} USD/toz\n` +
          `- Leverage: 1:${leverage}\n` +
          `- Notional ≈ ${notionalUsd.toFixed(2)} USD\n` +
          `- Margin ≈ ${marginUsd.toFixed(2)} USD (≈ Rp ${Math.round(
            marginIdr
          ).toLocaleString(
            "id-ID"
          )} asumsi 1 USD = Rp ${FIXED_USD_IDR_RATE.toLocaleString(
            "id-ID"
          )})\n\n` +
          `Catatan: ini simulasi edukatif, ketentuan riil bisa berbeda.`;

        return NextResponse.json(
          { reply: replyMargin, imagePath: null },
          { status: 200 }
        );
      }
      // kalau price/leverage nggak kebaca, lanjut ke AI engine
    }

    // ===========================
    // SHORT-CIRCUIT 5: HARGA LANGSUNG
    // ===========================
    const isPriceIntent =
      !lowerPrompt.includes("margin") &&
      !lowerPrompt.includes("leverage") &&
      !lowerPrompt.includes(" lot") &&
      (lowerPrompt.includes("berapa harga") ||
        lowerPrompt.includes("harga berapa") ||
        lowerPrompt.startsWith("harga ") ||
        lowerPrompt.includes("price ") ||
        lowerPrompt.includes("quote "));

    if (isPriceIntent && quotesRows.length > 0) {
      const requestedInstrumentsMulti =
        detectInstrumentsFromPromptMulti(userPrompt);
      const instrumentsToShow: InstrumentKey[] =
        requestedInstrumentsMulti.length > 0
          ? requestedInstrumentsMulti
          : [requestedInstrument];

      const lines: string[] = [];

      for (const instr of instrumentsToShow.slice(0, 3)) {
        const q = pickQuoteForInstrument(quotesRows, instr);
        if (!q) continue;

        const last = Number(q.last ?? q.close ?? q.price ?? NaN);
        const pct = Number(q.percentChange ?? 0);
        const label = INSTRUMENT_LABEL[instr] || INSTRUMENT_LABEL.other;

        if (isFinite(last)) {
          lines.push(
            `- ${label.name}: ${last.toFixed(2)} ${label.unit} (${
              isFinite(pct) ? pct.toFixed(2) : "0.00"
            }%)`
          );
        }
      }

      if (lines.length) {
        const upd = quotesUpdatedAtLocal
          ? ` (update ~${quotesUpdatedAtLocal} WIB)`
          : "";
        return NextResponse.json(
          {
            reply: `Harga terkini (internal Newsmaker)${upd}:\n\n${lines.join(
              "\n"
            )}`,
            imagePath: null,
          },
          { status: 200 }
        );
      }
    }

    // ===========================
    // SHORT-CIRCUIT 6: KALENDER
    // ===========================
    const isCalendarOverview =
      lowerPrompt.includes("kalender ekonomi") ||
      lowerPrompt.includes("economic calendar") ||
      lowerPrompt.includes("calendar ekonomi");

    const wantsHighImpactOnly =
      lowerPrompt.includes("high impact") ||
      lowerPrompt.includes("high-impact") ||
      lowerPrompt.includes("dampak tinggi") ||
      lowerPrompt.includes("★★★");

    if (isCalendarOverview) {
      if (calendarHasData) {
        const body = wantsHighImpactOnly
          ? calendarTableHighImpact
          : calendarTableAll;

        const note = calendarDateFilterNote
          ? `\n\n${calendarDateFilterNote}`
          : "";

        return NextResponse.json(
          {
            reply: `Kalender ekonomi ${targetCalendarDate} (internal Newsmaker):\n\n${body}${note}`,
            imagePath: null,
          },
          { status: 200 }
        );
      }
      return NextResponse.json(
        {
          reply:
            `Kalender ekonomi ${targetCalendarDate} di sistem Newsmaker tidak tersedia/kosong.\n` +
            "NM Ai tidak bisa menyebut jam/event spesifik tanpa data.",
          imagePath: null,
        },
        { status: 200 }
      );
    }

    // ======================================================
    // 3) SUSUN CORE MESSAGES UNTUK ENGINE (TOKENS DIHEMAT)
    // ======================================================
    const coreMessages: CoreMessage[] = [];

    coreMessages.push({ role: "system", content: SYSTEM_PREFIX_LITE });

    if (shouldIncludeFxRules(userPrompt)) {
      coreMessages.push({
        role: "system",
        content: `Asumsi simulasi kurs: 1 USD = Rp ${FIXED_USD_IDR_RATE.toLocaleString(
          "id-ID"
        )}. Kalau user tidak minta Rupiah, tidak usah konversi.`,
      });
    }

    if (wantsQuotes && quotesSummary) {
      coreMessages.push({
        role: "system",
        content:
          `Data harga internal (ringkas):\n` +
          clampText(quotesSummary, 350) +
          (quotesUpdatedAtLocal
            ? `\nUpdate ~${quotesUpdatedAtLocal} WIB.`
            : ""),
      });
    }

    if (wantsCalendar && calendarHasData) {
      const note = calendarDateFilterNote
        ? `\n${clampText(calendarDateFilterNote, 160)}`
        : "";

      coreMessages.push({
        role: "system",
        content:
          `Kalender internal (ringkas) target ${targetCalendarDate}:\n` +
          clampText(
            wantsHighImpactOnly ? calendarTableHighImpact : calendarTableAll,
            700
          ) +
          note,
      });
    }

    if (wantsHistorical && historicalInstrumentWindowSummary) {
      coreMessages.push({
        role: "system",
        content: clampText(historicalInstrumentWindowSummary, 500),
      });
    }

    if (wantsNews && newsHasData) {
      coreMessages.push({
        role: "system",
        content:
          `Berita internal terbaru (top):\n` +
          clampText(newsSummaryAll, 400) +
          (newsSummaryToday
            ? `\nTerbit hari ini:\n${clampText(newsSummaryToday, 300)}`
            : ""),
      });
    }

    for (const hm of historyMessages) {
      const role: "user" | "assistant" =
        hm.role === "ai" || hm.role === "assistant" ? "assistant" : "user";
      coreMessages.push({ role, content: clampText(toText(hm.content), 350) });
    }

    const userMsg: CoreMessage = { role: "user", content: userPrompt };
    if (hasImage && base64Image) userMsg.images = [base64Image];
    coreMessages.push(userMsg);

    // ======================================================
    // 4) HYBRID ENGINE: OLLAMA -> fallback OPENAI
    // ======================================================
    let reply: string | null = null;
    let lastError: string | null = null;

    if (OLLAMA_BASE_URL) {
      try {
        reply = await callOllamaChat(coreMessages);
      } catch (err: any) {
        lastError = `Ollama error: ${String(err)}`;
        console.error(lastError);
      }
    }

    if (!reply) {
      if (!OPENAI_API_KEY) {
        return NextResponse.json(
          {
            error: "No engine available",
            detail:
              lastError ||
              "Tidak ada mesin AI yang siap digunakan (Ollama & OpenAI tidak tersedia).",
          },
          { status: 500 }
        );
      }

      try {
        reply = await callOpenAIChat({
          coreMessages,
          apiKey: OPENAI_API_KEY,
          model: OPENAI_MODEL,
          promptCacheKey: PROMPT_CACHE_KEY,
          enableCache: OPENAI_ENABLE_PROMPT_CACHE,
        });
      } catch (err: any) {
        lastError = `OpenAI error: ${String(err)}`;
        console.error(lastError);
        return NextResponse.json(
          { error: "AI engine error", detail: lastError },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { reply: reply || "NM Ai tidak memberikan respon.", imagePath: null },
      { status: 200 }
    );
  } catch (err) {
    console.error("API /GwenStacy error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: String(err) },
      { status: 500 }
    );
  }
}
