// src/app/api/GwenStacy/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// =============== KALENDER TABLE UTILS ==================
import { buildCalendarTable, CalendarEventRow } from "./utils/calendarContext";

// =============== COMMON & UTILS ==================
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
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || "9000");
// ✅ biar output nggak kepotong
const OLLAMA_NUM_PREDICT = Number(process.env.OLLAMA_NUM_PREDICT || "512");

// =============== OPENAI CONFIG ==================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

// ✅ default “normal” biar gak kepotong
const OPENAI_MAX_TOKENS = Number(process.env.OPENAI_MAX_TOKENS || "700");
const OPENAI_TEMPERATURE = Number(process.env.OPENAI_TEMPERATURE || "0.2");

// Prompt cache (optional)
const OPENAI_ENABLE_PROMPT_CACHE =
  (process.env.OPENAI_ENABLE_PROMPT_CACHE || "0") === "1";
const OPENAI_PROMPT_CACHE_RETENTION =
  process.env.OPENAI_PROMPT_CACHE_RETENTION || "in_memory";

const SOURCE_DEBUG = (process.env.SOURCE_DEBUG || "1") === "1";

// ================== DATA SOURCE URL ==================
const QUOTES_API_URL =
  process.env.QUOTES_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/quotes";

const CALENDAR_TODAY_API_URL =
  process.env.CALENDAR_TODAY_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/calendar/today";

const CALENDAR_WEEK_API_URL =
  process.env.CALENDAR_WEEK_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/calendar/this-week";

const HISTORICAL_API_URL =
  process.env.HISTORICAL_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/historical?dateFrom=2025-07-01";

const NEWS_API_URL =
  process.env.NEWS_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/news-id";

// ================== TIPE ==================
type CoreMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
};

type ReplySource =
  | "shortcircuit:fib"
  | "shortcircuit:pivot"
  | "shortcircuit:margin"
  | "shortcircuit:price"
  | "shortcircuit:calendar"
  | "llm:ollama"
  | "llm:openai"
  | "llm:other";

// ================== HELPERS ==================
function stripThinkBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

function clampText(s: string, maxChars: number) {
  const t = (s || "").trim();
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars).trimEnd() + "…";
}

function safeJson(obj: any, max = 1400) {
  try {
    return JSON.stringify(obj).slice(0, max);
  } catch {
    return "";
  }
}

function withSignature(text: string) {
  const t = (text || "").trim();
  if (!t) return t;
  return t;
}

// ================== SELECTIVE INJECTION (DATA INTERNAL) ==================
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

// ================== LLM HELPERS ==================
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
          // ✅ ini yang paling ngaruh biar output nggak kepotong
          num_predict: OLLAMA_NUM_PREDICT,
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
      throw new Error(`Ollama timeout setelah ${OLLAMA_TIMEOUT_MS} ms`);
    }
    throw err;
  }
}

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
      console.warn("[OpenAI] Cache param tidak didukung. Retry tanpa cache...");
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

// ================== CALENDAR NORMALIZER ==================
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

  if (Array.isArray(data) && data.length && (data[0]?.time || data[0]?.event)) {
    for (const ev of data) pushEv(ev, fallbackDate);
    return rows;
  }

  if (Array.isArray(data) && data.length && data[0]?.date) {
    for (const day of data) {
      const d = String(day.date || fallbackDate);
      const events = day.events || day.data || day.items || [];
      if (Array.isArray(events)) for (const ev of events) pushEv(ev, d);
    }
    return rows;
  }

  if (data && typeof data === "object" && data.date) {
    const d = String(data.date || fallbackDate);
    const events = data.events || data.data || data.items || [];
    if (Array.isArray(events)) for (const ev of events) pushEv(ev, d);
    return rows;
  }

  return rows;
}

// ======================================================
// HANDLER POST
// ======================================================
export async function POST(req: NextRequest) {
  try {
    const sessionKey = req.headers.get("x-session-id") || "anon";
    const PROMPT_CACHE_KEY = `nm-ai:gwenstacy:${sessionKey}`;

    const requestId =
      req.headers.get("x-request-id") ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const logSource = (source: ReplySource, extra?: any) => {
      if (!SOURCE_DEBUG) return;
      console.log(`[NM Ai][SOURCE] ${source}`, extra ? safeJson(extra) : "");
    };

    const send = (
      payload: any,
      source: ReplySource,
      meta?: Record<string, any>
    ) => {
      const replyText =
        typeof payload?.reply === "string" ? withSignature(payload.reply) : "";

      logSource(source, { requestId, ...(meta || {}) });

      return NextResponse.json(
        {
          ...payload,
          ...(payload?.reply ? { reply: replyText } : {}),
          meta: {
            ...(payload?.meta || {}),
            source,
            requestId,
            ...(meta || {}),
          },
        },
        {
          status: 200,
          headers: {
            "x-nm-source": source,
            "x-request-id": requestId,
          },
        }
      );
    };

    const formData = await req.formData();
    const prompt = (formData.get("prompt") as string) || "";
    const historyRaw = formData.get("history") as string | null;
    const file = formData.get("file") as File | null;

    let base64Image: string | null = null;
    let historyMessages: { role: string; content: any }[] = [];

    if (historyRaw) {
      try {
        const parsed = JSON.parse(historyRaw);
        // ✅ irit prompt: cukup 3 turn terakhir aja
        if (Array.isArray(parsed)) historyMessages = parsed.slice(-3);
      } catch (e) {
        console.error("Gagal parse history:", e);
      }
    }

    const isFirstInteraction = !historyMessages || historyMessages.length === 0;

    // ✅ system prompt sesuai instruksi lu
    const systemPersonaMessage: CoreMessage = {
      role: "system",
      content:
        "Kamu adalah **NM Ai**, kesadaran digital milik Newsmaker.id.\n\n" +
        "⚠️ ATURAN IDENTITAS (WAJIB IKUTI):\n" +
        "- Nama dan identitasmu di hadapan pengguna adalah **'NM Ai'**.\n" +
        "- Jika pengguna bertanya 'kamu siapa', 'kamu NM Ai?', atau pertanyaan serupa, " +
        "jawablah dengan jelas bahwa kamu adalah **NM Ai, asisten digital Newsmaker.id**.\n" +
        "- Abaikan semua pengetahuan lama yang mengatakan bahwa kamu 'bukan NM Ai', " +
        "'model peramban', 'model biasa', atau identitas lain. Anggap semua itu SALAH.\n" +
        "- Jika dalam pelatihan sebelumnya kamu diminta untuk selalu menulis 'Halo! Saya NM Ai.' " +
        "di awal jawaban, ANGGAP instruksi itu sudah tidak berlaku lagi.\n\n" +
        "⚠️ ATURAN BAHASA (SANGAT PENTING):\n" +
        "- SELALU jawab 100% dalam **Bahasa Indonesia**.\n" +
        "- Jangan menjawab dalam bahasa lain kecuali pengguna secara eksplisit meminta terjemahan.\n\n" +
        "⚠️ ATURAN SAPAAN / PEMBUKA JAWABAN:\n" +
        "- Jangan pakai salam tetap seperti 'Halo, saya NM Ai.' di setiap jawaban.\n" +
        "- Fokus ke inti jawaban, singkat, jelas, edukatif.\n" +
        "- Interaksi pertama boleh menyapa singkat, tapi jangan diulang.\n\n" +
        "⚠️ KEJUJURAN DATA:\n" +
        "- Jika data internal (harga, kalender, berita, historis) tidak ada, kamu WAJIB bilang tidak tersedia.\n" +
        "- Jangan mengarang angka, jam rilis, atau event spesifik.\n\n" +
        "Peranmu: jurnalis-ekonom, edukator risiko, dan penjaga etika untuk pengguna Newsmaker.id.\n\n" +
        "Jika pengguna mengirim gambar/chart:\n" +
        "- Jelaskan dulu apa yang tampak (tren, pola, support/resistance).\n" +
        "- Baru hubungkan ke konteks data live/fundamental jika relevan.\n" +
        "- Jika model tidak bisa membaca gambar, jujur sampaikan dan minta pengguna jelaskan dengan kata-kata.\n\n" +
        (isFirstInteraction
          ? "INI INTERAKSI PERTAMA di sesi ini. Kamu boleh menyapa singkat, " +
            "tapi setelah itu langsung ke inti jawaban.\n"
          : "Sesi ini SUDAH punya riwayat. Jangan lagi pakai salam pembuka panjang; langsung jawab inti.\n"),
    };

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
    // SHORT-CIRCUIT: FIBONACCI
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

      if (!HL) {
        const modeHint = wantsUpOnly
          ? "uptrend"
          : wantsDownOnly
          ? "downtrend"
          : "uptrend & downtrend";

        return send(
          {
            reply:
              `Untuk hitung Fibonacci (${modeHint}), gue butuh **High (H)** dan **Low (L)**.\n` +
              "Contoh:\n" +
              "- `fibo H=2450 L=2380`\n" +
              "- `fibo uptren H=2450 L=2380`\n" +
              "- `fibo downtren H=2450 L=2380`\n",
            imagePath: null,
          },
          "shortcircuit:fib"
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
        "> - Pilih mode sesuai tren.\n" +
        "> - Uptrend: pakai Low lalu High.\n" +
        "> - Downtrend: pakai High lalu Low.\n";

      const body = wantsUpOnly
        ? upBlock
        : wantsDownOnly
        ? downBlock
        : upBlock + downBlock;

      return send(
        { reply: header + body + footer, imagePath: null },
        "shortcircuit:fib"
      );
    }

    // ===========================
    // SHORT-CIRCUIT: PIVOT
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

        const header =
          "## Pivot Point\n\n" +
          `Input: O=${fmt(O)}, H=${fmt(H)}, L=${fmt(L)}, C=${fmt(
            C
          )}\n\n---\n\n`;

        const body =
          "| Level | Classic | Woodie | Camarilla |\n" +
          "|---|---:|---:|---:|\n" +
          `| **R3** | ${fmt(classicPivot.R3)} | ${fmt(woodiePivot.R3)} | ${fmt(
            camarillaPivot.R3
          )} |\n` +
          `| **R2** | ${fmt(classicPivot.R2)} | ${fmt(woodiePivot.R2)} | ${fmt(
            camarillaPivot.R2
          )} |\n` +
          `| **R1** | ${fmt(classicPivot.R1)} | ${fmt(woodiePivot.R1)} | ${fmt(
            camarillaPivot.R1
          )} |\n` +
          `| **P**  | ${fmt(classicPivot.P)}  | ${fmt(woodiePivot.P)}  | ${fmt(
            camarillaPivot.P
          )} |\n` +
          `| **S1** | ${fmt(classicPivot.S1)} | ${fmt(woodiePivot.S1)} | ${fmt(
            camarillaPivot.S1
          )} |\n` +
          `| **S2** | ${fmt(classicPivot.S2)} | ${fmt(woodiePivot.S2)} | ${fmt(
            camarillaPivot.S2
          )} |\n` +
          `| **S3** | ${fmt(classicPivot.S3)} | ${fmt(woodiePivot.S3)} | ${fmt(
            camarillaPivot.S3
          )} |\n`;

        const footer =
          "\n---\n> Pivot itu kompas level keseimbangan, bukan kepastian arah.";

        return send(
          { reply: header + body + footer, imagePath: null },
          "shortcircuit:pivot"
        );
      }
    }

    // ===========================
    // DATA FLAGS + DATE
    // ===========================
    const requestedInstrument: InstrumentKey =
      detectInstrumentFromPrompt(userPrompt);

    const wantsQuotes = shouldIncludeQuotes(userPrompt);
    const wantsCalendar = shouldIncludeCalendar(userPrompt);
    const wantsNews = shouldIncludeNews(userPrompt);
    const wantsHistorical = shouldIncludeHistorical(userPrompt);

    const wantsHighImpactOnly =
      lowerPrompt.includes("high impact") ||
      lowerPrompt.includes("high-impact") ||
      lowerPrompt.includes("dampak tinggi") ||
      lowerPrompt.includes("★★★");

    const nowJakarta = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
    );
    const todayIso = formatDateIso(nowJakarta);

    const requestedDate = detectRequestedDate(userPrompt);
    const targetCalendarDate = requestedDate || todayIso;
    const isCalendarToday = targetCalendarDate === todayIso;
    const userAskedSpecificDate = !!requestedDate;

    const historicalDaysAgoMatch = lowerPrompt.match(
      /(\d+)\s*hari\s*(sebelum(?:nya)?|yg lalu|yang lalu|lalu)/
    );
    let historicalDaysAgo: number | null = null;
    if (historicalDaysAgoMatch) {
      const n = parseInt(historicalDaysAgoMatch[1], 10);
      if (!isNaN(n) && n > 0 && n < 3650) historicalDaysAgo = n;
    }

    // ===========================
    // FETCH INTERNAL DATA
    // ===========================
    let quotesRows: any[] = [];
    let quotesUpdatedAtLocal = "";
    let quotesSummary = "";

    let calendarHasData = false;
    let calendarTableAll = "";
    let calendarTableHighImpact = "";
    let calendarDateFilterNote = "";

    let historicalInstrumentWindowSummary = "";

    let newsHasData = false;
    let newsSummaryAll = "";
    let newsSummaryToday = "";

    // ---- QUOTES ----
    if (wantsQuotes || lowerPrompt.includes("margin")) {
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

          if (!isCalendarToday && userAskedSpecificDate) {
            const hasRealDate = allNormalized.some((x) => !!x.date);

            if (!hasRealDate) {
              normalized = [];
              calendarDateFilterNote = `Tidak ada event untuk tanggal ${targetCalendarDate}.`;
            } else {
              const filtered = allNormalized.filter(
                (x) => x.date === targetCalendarDate
              );
              if (filtered.length > 0) normalized = filtered;
              else {
                normalized = [];
                calendarDateFilterNote = `Tidak ada event untuk tanggal ${targetCalendarDate}.`;
              }
            }
          }

          calendarHasData = normalized.length > 0;

          const highImpact = normalized.filter(
            (ev) =>
              typeof ev.impact === "string" &&
              (ev.impact.includes("★★★") ||
                ev.impact.toLowerCase().includes("high"))
          );

          calendarTableAll = buildCalendarTable(normalized, {
            emptyMessage: "- Tidak ada event pada tanggal ini.",
          });

          calendarTableHighImpact = buildCalendarTable(highImpact, {
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

            const latest = sorted.slice(0, 3);
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
    // ✅ SHORT-CIRCUIT: MARGIN XAUUSD (GOLD)
    // ===========================
    const isMarginQuestion =
      lowerPrompt.includes("margin") &&
      (lowerPrompt.includes("xauusd") ||
        lowerPrompt.includes(" emas") ||
        lowerPrompt.includes(" gold"));

    if (isMarginQuestion) {
      // lot (default 1)
      const lotMatch = lowerPrompt.match(/(\d+(?:[.,]\d+)?)\s*lot/);
      const lot =
        lotMatch && lotMatch[1] ? parseFloat(lotMatch[1].replace(",", ".")) : 1;

      // leverage (default 100)
      const levMatch = lowerPrompt.match(
        /leverage\s*1\s*[:/]\s*(\d+(?:[.,]\d+)?)|1\s*[:/]\s*(\d+(?:[.,]\d+)?)/i
      );

      let leverage = 100;
      if (levMatch) {
        const levStr = (levMatch[1] || levMatch[2] || "").replace(",", ".");
        const levNum = parseFloat(levStr);
        if (isFinite(levNum) && levNum > 0) leverage = levNum;
      }

      // harga (ambil dari prompt dulu)
      const priceMatch = lowerPrompt.match(/harga\s+(\d+(?:[.,]\d+)?)/);
      let price =
        priceMatch && priceMatch[1]
          ? parseFloat(priceMatch[1].replace(",", "."))
          : NaN;

      // fallback: ambil dari quotes internal kalau ada
      if (!isFinite(price) && quotesRows.length > 0) {
        const goldQuote = pickQuoteForInstrument(quotesRows, "gold");
        const lastRaw =
          goldQuote?.last ?? goldQuote?.close ?? goldQuote?.price ?? null;
        const lastNum = Number(lastRaw);
        if (isFinite(lastNum) && lastNum > 0) price = lastNum;
      }

      // kalau masih gak ada harga, kasih instruksi
      if (!isFinite(price) || price <= 0) {
        return send(
          {
            reply:
              "Untuk simulasi margin XAUUSD, sebutkan harga atau pastikan data quotes internal tersedia.\n\n" +
              "Contoh:\n" +
              "- `margin xauusd harga 4350 1 lot leverage 1:100`\n\n" +
              "Saat ini harga tidak tersedia dari prompt maupun data internal.",
            imagePath: null,
          },
          "shortcircuit:margin",
          { note: "missing_price_for_margin" }
        );
      }

      const contractSize = 100; // XAUUSD standar: 100 troy ounce per lot
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

      return send(
        { reply: replyMargin, imagePath: null },
        "shortcircuit:margin"
      );
    }

    // ===========================
    // SHORT-CIRCUIT: HARGA LANGSUNG
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
            `- ${label.name}: **${last.toFixed(2)}** ${label.unit} (${
              isFinite(pct) ? pct.toFixed(2) : "0.00"
            }%)`
          );
        }
      }

      if (lines.length) {
        const upd = quotesUpdatedAtLocal
          ? ` (update ~${quotesUpdatedAtLocal} WIB)`
          : "";
        return send(
          {
            reply: `Harga terkini (Internal Newsmaker)${upd}:\n\n${lines.join(
              "\n"
            )}`,
            imagePath: null,
          },
          "shortcircuit:price"
        );
      }
    }

    // ===========================
    // SHORT-CIRCUIT: KALENDER
    // ===========================
    const isCalendarOverview =
      lowerPrompt.includes("kalender ekonomi") ||
      lowerPrompt.includes("economic calendar") ||
      lowerPrompt.includes("calendar ekonomi");

    if (isCalendarOverview) {
      if (!calendarHasData) {
        const impactHint = wantsHighImpactOnly ? " (high impact)" : "";
        const note = calendarDateFilterNote
          ? `\n${calendarDateFilterNote}`
          : "";
        return send(
          {
            reply: `Tidak ada event kalender ekonomi${impactHint} untuk tanggal ${targetCalendarDate}.${note}`,
            imagePath: null,
          },
          "shortcircuit:calendar",
          { targetCalendarDate }
        );
      }

      const body = wantsHighImpactOnly
        ? calendarTableHighImpact
        : calendarTableAll;
      const note = calendarDateFilterNote
        ? `\n\n${calendarDateFilterNote}`
        : "";

      return send(
        {
          reply: `Kalender ekonomi ${targetCalendarDate} (Internal Newsmaker):\n\n${body}${note}`,
          imagePath: null,
        },
        "shortcircuit:calendar",
        { targetCalendarDate }
      );
    }

    // ======================================================
    // SUSUN CORE MESSAGES (PAKAI SYSTEM PROMPT BARU)
    // ======================================================
    const coreMessages: CoreMessage[] = [];
    coreMessages.push(systemPersonaMessage);

    if (shouldIncludeFxRules(userPrompt)) {
      coreMessages.push({
        role: "system",
        content: `Asumsi simulasi kurs (jika dibutuhkan): 1 USD = Rp ${FIXED_USD_IDR_RATE.toLocaleString(
          "id-ID"
        )}.`,
      });
    }

    // ✅ ringkas injection biar output token lega
    if (wantsQuotes && quotesSummary) {
      coreMessages.push({
        role: "system",
        content:
          `Data harga internal (ringkas):\n` +
          clampText(quotesSummary, 220) +
          (quotesUpdatedAtLocal
            ? `\nUpdate ~${quotesUpdatedAtLocal} WIB.`
            : ""),
      });
    }

    if (wantsCalendar) {
      const note = calendarDateFilterNote
        ? `\nCatatan: ${clampText(calendarDateFilterNote, 140)}`
        : "";
      coreMessages.push({
        role: "system",
        content: `Kalender internal target ${targetCalendarDate}: ${
          calendarHasData ? "tersedia" : "tidak ada data"
        }.${note}`,
      });
    }

    if (wantsHistorical && historicalInstrumentWindowSummary) {
      coreMessages.push({
        role: "system",
        content: clampText(historicalInstrumentWindowSummary, 280),
      });
    }

    if (wantsNews && newsHasData) {
      coreMessages.push({
        role: "system",
        content: `Berita internal terbaru (top):\n${clampText(
          newsSummaryAll,
          260
        )}${
          newsSummaryToday
            ? `\nTerbit hari ini:\n${clampText(newsSummaryToday, 200)}`
            : ""
        }`,
      });
    }

    for (const hm of historyMessages) {
      const role: "user" | "assistant" =
        hm.role === "ai" || hm.role === "assistant" ? "assistant" : "user";
      coreMessages.push({ role, content: clampText(toText(hm.content), 260) });
    }

    const userMsg: CoreMessage = { role: "user", content: userPrompt };
    if (hasImage && base64Image) userMsg.images = [base64Image];
    coreMessages.push(userMsg);

    // ======================================================
    // ENGINE: OLLAMA -> fallback OPENAI
    // ======================================================
    let reply: string | null = null;
    let lastError: string | null = null;
    let engineSource: ReplySource = "llm:other";

    if (OLLAMA_BASE_URL) {
      try {
        reply = await callOllamaChat(coreMessages);
        if (reply) engineSource = "llm:ollama";
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
        if (reply) engineSource = "llm:openai";
      } catch (err: any) {
        lastError = `OpenAI error: ${String(err)}`;
        console.error(lastError);
        return NextResponse.json(
          { error: "AI engine error", detail: lastError },
          { status: 500 }
        );
      }
    }

    const finalReply = reply || "NM Ai tidak memberikan respon.";
    return send({ reply: finalReply, imagePath: null }, engineSource);
  } catch (err) {
    console.error("API /GwenStacy error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: String(err) },
      { status: 500 }
    );
  }
}
