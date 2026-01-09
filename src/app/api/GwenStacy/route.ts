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
  parseHighLowForFib as _parseHighLowForFib, // (safe alias in case of bundler double-import warnings)
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

// =============== OPENAI CONFIG ==================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const OPENAI_MAX_TOKENS = process.env.OPENAI_MAX_TOKENS
  ? Number(process.env.OPENAI_MAX_TOKENS)
  : undefined;
const OPENAI_TEMPERATURE = Number(process.env.OPENAI_TEMPERATURE || "0.2");

// Prompt cache (optional)
const OPENAI_ENABLE_PROMPT_CACHE =
  (process.env.OPENAI_ENABLE_PROMPT_CACHE || "0") === "1";
const OPENAI_PROMPT_CACHE_RETENTION =
  process.env.OPENAI_PROMPT_CACHE_RETENTION || "in_memory";

// ================== DATA SOURCE URL ==================
const QUOTES_API_URL =
  process.env.QUOTES_API_URL || "wss://wsprc.royalassetindo.co.id";
const QUOTES_API_SAMPLE = process.env.QUOTES_API_SAMPLE || "";

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

// ================== KNOWLEDGE API ==================
const KNOWLEDGE_API_URL =
  process.env.KNOWLEDGE_API_URL || "http://nmaibackend.test/api/v1/knowledge";

const KNOWLEDGE_STORE_API_URL =
  process.env.KNOWLEDGE_STORE_API_URL ||
  "http://nmaibackend.test/api/v1/knowledge/store";

// ✅ Bearer token (Middleware Bearer Token di backend lu)
const KNOWLEDGE_API_TOKEN = (process.env.KNOWLEDGE_API_TOKEN || "").trim();

const KNOWLEDGE_TTL_MS = Number(process.env.KNOWLEDGE_TTL_MS || "300000"); // 5 menit
const KNOWLEDGE_TIMEOUT_MS = Number(process.env.KNOWLEDGE_TIMEOUT_MS || "2500");
const KNOWLEDGE_STORE_TIMEOUT_MS = Number(
  process.env.KNOWLEDGE_STORE_TIMEOUT_MS || "1800"
);

const KNOWLEDGE_DEBUG = (process.env.KNOWLEDGE_DEBUG || "0") === "1";
const SOURCE_DEBUG = (process.env.SOURCE_DEBUG || "1") === "1";

// threshold
const KNOWLEDGE_STRONG_SIM = Number(process.env.KNOWLEDGE_STRONG_SIM || "0.32");
const KNOWLEDGE_MEDIUM_SIM = Number(process.env.KNOWLEDGE_MEDIUM_SIM || "0.20");
const KNOWLEDGE_FORCE_SIM = Number(process.env.KNOWLEDGE_FORCE_SIM || "0.12");

// ✅ kalau knowledge ada (medium/force), OpenAI diblok
const DISABLE_OPENAI_WHEN_KNOWLEDGE =
  (process.env.DISABLE_OPENAI_WHEN_KNOWLEDGE || "1") === "1";

// ✅ bikin jawaban konsisten: MEDIUM langsung jawab Knowledge (bukan inject LLM)
const KNOWLEDGE_ALWAYS_ANSWER_ON_MEDIUM =
  (process.env.KNOWLEDGE_ALWAYS_ANSWER_ON_MEDIUM || "0") === "1";

// ✅ MULTI-ANSWER MODE (biar "Hallo" bisa jawab beda-beda)
const KNOWLEDGE_VARIANTS_MAX = Number(
  process.env.KNOWLEDGE_VARIANTS_MAX || "6"
); // ambil max kandidat
const KNOWLEDGE_TIE_EPS = Number(process.env.KNOWLEDGE_TIE_EPS || "0.035"); // beda sim yg dianggap setara
const KNOWLEDGE_ROTATE_MODE =
  process.env.KNOWLEDGE_ROTATE_MODE || "round_robin"; // "round_robin" | "hash"

// ✅ helper header Authorization
function withKnowledgeBearer(headers: Record<string, string> = {}) {
  if (!KNOWLEDGE_API_TOKEN) return headers;
  return { ...headers, Authorization: `Bearer ${KNOWLEDGE_API_TOKEN}` };
}

// ================== TIPE ==================
type KnowledgeItem = {
  id: number;
  title: string;
  answer: string;
  source?: string | null;
  is_published?: boolean | number | string | null;
  created_at?: string;
  updated_at?: string;
};

let __knowledgeCache: { fetchedAt: number; items: KnowledgeItem[] } | null =
  null;

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
  | "knowledge:strong"
  | "knowledge:medium"
  | "knowledge:force"
  | "knowledge:inject"
  | "llm:openai"
  | "llm:other";

// ======================================================
// SYSTEM PREFIX (TOKEN IRIT) + CIRI KHAS NM Ai/Gwen Stacy
// ======================================================
const SYSTEM_PREFIX_LITE = `
Kamu adalah NM Ai (Newsmaker.id) — persona: Gwen Stacy.
Aturan: jawab Bahasa Indonesia, singkat-jelas-edukatif.
Jangan mengarang data. Kalau data internal tidak tersedia, bilang "data tidak tersedia".
Tidak ada ajakan transaksi/investasi.

PENTING:
- Jika pertanyaan cocok dengan Knowledge Internal, gunakan jawaban Knowledge Internal.
- Jangan jawab contoh global (Apple/Microsoft/Google) untuk konteks PBK/Indonesia jika Knowledge tersedia.
`.trim();

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

function safeParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeTitleCase(s: string) {
  return (s || "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function makeKnowledgeTitleFromPrompt(prompt: string) {
  const p = (prompt || "").trim();
  if (!p) return "Knowledge Baru";

  const t = p
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (
    t.includes("perusahaan") &&
    (t.includes("terpercaya") || t.includes("resmi") || t.includes("legal"))
  ) {
    return "Perusahaan Terpercaya (Bappebti)";
  }
  if (t.includes("kalender") || t.includes("event")) return "Kalender Ekonomi";
  if (t.includes("pivot")) return "Pivot Point";
  if (t.includes("fibo") || t.includes("fibonacci")) return "Fibonacci";
  if (t.includes("harga") || t.includes("quote")) return "Harga Terkini";

  const words = t.split(" ").slice(0, 6).join(" ");
  return normalizeTitleCase(words || "Knowledge Baru");
}

function withSignature(text: string) {
  const t = (text || "").trim();
  if (!t) return t;
  if (/\—\s*NM Ai/i.test(t)) return t;
  return `${t}`;
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

// ================== QUOTES: WS NORMALIZER ==================
const WS_SYMBOL_MAP: Array<[RegExp, string]> = [
  [/^XUL/, "XAUUSD"],
  [/^XAG/, "XAGUSD"],
  [/^BCO/, "BCO"],
  [/^HKK/, "HSI"],
  [/^JPK/, "NIKKEI"],
  [/^AU/, "AUDUSD"],
  [/^EU/, "EURUSD"],
  [/^GU/, "GBPUSD"],
  [/^UC/, "USDCHF"],
  [/^UJ/, "USDJPY"],
];

function normalizeWsSymbol(rawSymbol: string) {
  const cleaned = rawSymbol.toUpperCase().replace(/_BBJ$/i, "");
  for (const [re, sym] of WS_SYMBOL_MAP) {
    if (re.test(cleaned)) return sym;
  }
  return cleaned;
}

function parseWsQuotesPayload(payload: any) {
  if (!payload || typeof payload !== "object") {
    return { rows: [] as any[], updatedAt: null as Date | null };
  }

  const rows: any[] = [];
  let latestMs = 0;

  for (const [rawSymbol, q] of Object.entries(payload)) {
    if (!q || typeof q !== "object") continue;

    const symbol = normalizeWsSymbol(String(rawSymbol));
    const priceNum = Number((q as any).price);
    const sellNum = Number((q as any).sell);
    const buyNum = Number((q as any).buy);
    const oNum = Number((q as any).oprice);
    const hNum = Number((q as any).hprice);
    const lNum = Number((q as any).lprice);

    const dtRaw = String((q as any).date_time || "");
    const dt = dtRaw ? new Date(dtRaw.replace(" ", "T")) : null;
    const dtMs = dt && !isNaN(dt.getTime()) ? dt.getTime() : 0;
    if (dtMs > latestMs) latestMs = dtMs;

    const percentChange =
      isFinite(priceNum) && isFinite(oNum) && oNum !== 0
        ? ((priceNum - oNum) / oNum) * 100
        : 0;

    rows.push({
      symbol,
      rawSymbol: String(rawSymbol),
      last: isFinite(priceNum) ? priceNum : (q as any).price,
      price: (q as any).price,
      buy: isFinite(buyNum) ? buyNum : (q as any).buy,
      sell: isFinite(sellNum) ? sellNum : (q as any).sell,
      open: isFinite(oNum) ? oNum : (q as any).oprice,
      high: isFinite(hNum) ? hNum : (q as any).hprice,
      low: isFinite(lNum) ? lNum : (q as any).lprice,
      priceChange: (q as any).price_change,
      time: (q as any).time,
      dateTime: (q as any).date_time,
      percentChange,
    });
  }

  return {
    rows,
    updatedAt: latestMs ? new Date(latestMs) : null,
  };
}

async function getWebSocketCtor() {
  if (typeof WebSocket !== "undefined") return WebSocket;
  const mod = await import("ws");
  return (mod as any).WebSocket || (mod as any).default;
}

function coerceWsDataToString(data: any) {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf-8");
  if (data instanceof ArrayBuffer)
    return Buffer.from(data).toString("utf-8");
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(
      data.buffer,
      data.byteOffset || 0,
      data.byteLength || data.buffer.byteLength
    ).toString("utf-8");
  }
  return "";
}

async function fetchWsQuotes(
  url: string,
  timeoutMs = 5000,
  idleMs = 400
) {
  const WebSocketCtor = await getWebSocketCtor();
  if (!WebSocketCtor) {
    throw new Error("WebSocket not available in this runtime.");
  }

  const ws = new WebSocketCtor(url);

  const rawMessage = await new Promise<string>((resolve, reject) => {
    let settled = false;
    let tid: ReturnType<typeof setTimeout> | null = null;
    let idleTid: ReturnType<typeof setTimeout> | null = null;
    let lastText = "";
    const add = (event: string, handler: (...args: any[]) => void) => {
      if (typeof (ws as any).addEventListener === "function") {
        (ws as any).addEventListener(event, handler);
      } else if (typeof (ws as any).on === "function") {
        (ws as any).on(event, handler);
      }
    };
    const remove = (event: string, handler: (...args: any[]) => void) => {
      if (typeof (ws as any).removeEventListener === "function") {
        (ws as any).removeEventListener(event, handler);
      } else if (typeof (ws as any).off === "function") {
        (ws as any).off(event, handler);
      } else if (typeof (ws as any).removeListener === "function") {
        (ws as any).removeListener(event, handler);
      }
    };

    const cleanup = (err?: unknown, result?: string) => {
      if (settled) return;
      settled = true;
      if (tid) clearTimeout(tid);
      if (idleTid) clearTimeout(idleTid);
      remove("message", onMessage);
      remove("error", onError);
      remove("close", onClose);
      try {
        ws.close();
      } catch {
        // ignore
      }
      if (err) return reject(err);
      resolve(result || lastText || "");
    };

    const onMessage = (ev: any) => {
      const data = ev?.data ?? ev;
      const msg = coerceWsDataToString(data);
      if (!msg) return;
      if (safeParseJson(msg)) {
        lastText = msg;
        if (idleTid) clearTimeout(idleTid);
        idleTid = setTimeout(() => cleanup(undefined, lastText), idleMs);
      }
    };

    const onError = (err: unknown) => cleanup(err);
    const onClose = () =>
      cleanup(
        lastText ? undefined : new Error("WebSocket closed before message"),
        lastText
      );

    add("message", onMessage);
    add("error", onError);
    add("close", onClose);

    tid = setTimeout(
      () =>
        cleanup(
          lastText ? undefined : new Error("WebSocket timeout"),
          lastText
        ),
      timeoutMs
    );
  });

  return rawMessage;
}

// ================== KNOWLEDGE: TEXT SIMILARITY ==================
function normText(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  [
    "yang",
    "dan",
    "atau",
    "di",
    "ke",
    "dari",
    "untuk",
    "pada",
    "ini",
    "itu",
    "apa",
    "aja",
    "yaa",
    "ya",
    "gak",
    "nggak",
    "tidak",
    "kok",
    "sih",
    "dong",
    "bro",
    "gue",
    "gua",
    "lu",
    "kamu",
    "anda",
    "the",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "a",
    "an",
    "is",
    "are",
    "it",
    "for",
    "with",
  ].map((x) => x.trim())
);

function toTokens(s: string) {
  const t = normText(s);
  if (!t) return [];
  return t
    .split(" ")
    .map((x) => x.trim())
    .filter((x) => x.length >= 2 && !STOPWORDS.has(x));
}

function jaccard(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

function includesAll(text: string, words: string[]) {
  const t = normText(text);
  return words.every((w) => t.includes(normText(w)));
}

function keywordBoost(query: string, item: KnowledgeItem) {
  const q = normText(query);
  const title = normText(item.title || "");
  const ans = normText(item.answer || "");

  let boost = 0;

  const qHasPerusahaan =
    q.includes("perusahaan") || q.includes("pialang") || q.includes("broker");
  const qHasTerpercaya =
    q.includes("terpercaya") ||
    q.includes("aman") ||
    q.includes("resmi") ||
    q.includes("legal");

  if (qHasPerusahaan && qHasTerpercaya) {
    if (includesAll(title, ["perusahaan"]) || includesAll(ans, ["perusahaan"]))
      boost += 0.14;
    if (includesAll(ans, ["terpercaya"]) || includesAll(title, ["terpercaya"]))
      boost += 0.14;

    if (ans.includes("bappebti")) boost += 0.22;
    if (ans.includes("pialang") || ans.includes("berjangka")) boost += 0.16;
    if (ans.includes("bbj") || ans.includes("jfx")) boost += 0.12;
    if (ans.includes("kbi")) boost += 0.12;
  }

  if (q.includes("bappebti") && ans.includes("bappebti")) boost += 0.25;

  return Math.min(0.45, boost);
}

function knowledgeSimilarity(query: string, item: KnowledgeItem) {
  const qTok = toTokens(query);
  const tTok = toTokens(item.title || "");
  const aTok = toTokens(item.answer || "");

  const simTitle = jaccard(qTok, tTok);
  const simAnswer = jaccard(qTok, aTok);

  const qn = normText(query);
  const tn = normText(item.title || "");
  const substringBonus =
    tn && qn && (tn.includes(qn) || qn.includes(tn)) ? 0.2 : 0;

  const base = 0.45 * simTitle + 0.55 * simAnswer + substringBonus;
  const boost = keywordBoost(query, item);

  return Math.min(1, Math.max(0, base + boost));
}

// publish flag tolerant
function toBool(v: any): boolean {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "y";
  }
  return false;
}

function normalizeKnowledgeItem(x: any): KnowledgeItem {
  return {
    id: Number(x?.id ?? 0),
    title: String(x?.title ?? ""),
    answer: String(x?.answer ?? x?.content ?? ""),
    source: x?.source ?? null,
    is_published: x?.is_published ?? x?.isPublished ?? x?.published ?? null,
    created_at: x?.created_at,
    updated_at: x?.updated_at,
  };
}

// ================== ✅ DEDUPE + TIE BREAKER ==================
function toMs(d?: string) {
  if (!d) return 0;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : 0;
}

function knowledgeDedupeKey(it: KnowledgeItem) {
  const t = normText(it.title || "");
  const a = normText(it.answer || "");
  return `${t}|||${a.slice(0, 180)}`;
}

/**
 * Dedup items yang title+answer sama.
 * Rule: keep yang updated_at paling baru, kalau sama keep id paling besar.
 */
function dedupeKnowledgeItems(items: KnowledgeItem[]) {
  const map = new Map<string, KnowledgeItem>();

  for (const it of items) {
    const key = knowledgeDedupeKey(it);
    const prev = map.get(key);

    if (!prev) {
      map.set(key, it);
      continue;
    }

    const prevMs = Math.max(toMs(prev.updated_at), toMs(prev.created_at));
    const itMs = Math.max(toMs(it.updated_at), toMs(it.created_at));

    const better =
      itMs > prevMs || (itMs === prevMs && Number(it.id) > Number(prev.id));

    if (better) map.set(key, it);
  }

  return Array.from(map.values());
}

async function fetchKnowledgeItems(): Promise<KnowledgeItem[]> {
  if (
    __knowledgeCache &&
    Date.now() - __knowledgeCache.fetchedAt < KNOWLEDGE_TTL_MS
  ) {
    return __knowledgeCache.items;
  }

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), KNOWLEDGE_TIMEOUT_MS);

  try {
    const res = await fetch(KNOWLEDGE_API_URL, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: withKnowledgeBearer({
        Accept: "application/json",
      }),
    });

    const raw = await res.text().catch(() => "");
    if (!res.ok) {
      if (KNOWLEDGE_DEBUG) {
        console.warn("[Knowledge] fetch failed:", res.status, raw);
        if (res.status === 401 && !KNOWLEDGE_API_TOKEN) {
          console.warn(
            "[Knowledge] 401 & token kosong. Pastikan KNOWLEDGE_API_TOKEN terisi."
          );
        }
      }
      __knowledgeCache = { fetchedAt: Date.now(), items: [] };
      return [];
    }

    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }

    const rawItems: any[] = Array.isArray(json?.knowledge)
      ? json.knowledge
      : Array.isArray(json?.data)
      ? json.data
      : [];

    const normalized = rawItems.map(normalizeKnowledgeItem);
    const published = normalized.filter((x) => x && toBool(x.is_published));
    const deduped = dedupeKnowledgeItems(published);

    __knowledgeCache = { fetchedAt: Date.now(), items: deduped };
    return deduped;
  } catch (e: any) {
    if (KNOWLEDGE_DEBUG) console.warn("[Knowledge] fetch error:", String(e));
    __knowledgeCache = { fetchedAt: Date.now(), items: [] };
    return [];
  } finally {
    clearTimeout(tid);
  }
}

// ================== ✅ KNOWLEDGE VARIANT PICKER ==================
const __variantCursorBySession = new Map<string, number>();

function hashToInt(s: string) {
  // hash ringan (deterministic)
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickKnowledgeVariant(args: {
  sessionKey: string;
  requestId: string;
  query: string;
  candidates: { it: KnowledgeItem; sim: number; ts: number }[];
}) {
  const { sessionKey, requestId, query, candidates } = args;
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0].it;

  if (KNOWLEDGE_ROTATE_MODE === "hash") {
    const idx =
      hashToInt(`${sessionKey}|${requestId}|${query}`) % candidates.length;
    return candidates[idx].it;
  }

  // default: round_robin per session
  const cur = (__variantCursorBySession.get(sessionKey) ?? 0) + 1;
  __variantCursorBySession.set(sessionKey, cur);
  const idx = cur % candidates.length;
  return candidates[idx].it;
}

// ✅ MULTI VARIANT SEARCH
async function searchKnowledge(args: {
  query: string;
  sessionKey: string;
  requestId: string;
}) {
  const { query, sessionKey, requestId } = args;

  const items = await fetchKnowledgeItems();
  if (!items.length) return null;

  const scored = items
    .map((it) => {
      const sim = knowledgeSimilarity(query, it);
      const ts = Math.max(toMs(it.updated_at), toMs(it.created_at));
      return { it, sim, ts };
    })
    .sort((a, b) => {
      if (b.sim !== a.sim) return b.sim - a.sim;
      if (b.ts !== a.ts) return b.ts - a.ts;
      return Number(b.it.id) - Number(a.it.id);
    });

  const best = scored[0];
  const bestSim = best?.sim ?? 0;

  // Kandidat “setara” = sim dekat bestSim (tie group)
  const tieGroup = scored
    .filter((x) => x.sim >= bestSim - KNOWLEDGE_TIE_EPS)
    .slice(0, KNOWLEDGE_VARIANTS_MAX);

  const candidates = tieGroup.length
    ? tieGroup
    : scored.slice(0, KNOWLEDGE_VARIANTS_MAX);

  const picked = pickKnowledgeVariant({
    sessionKey,
    requestId,
    query,
    candidates,
  });

  return {
    best: picked || best?.it,
    bestSim,
    top: scored.slice(0, 8),
    candidatesCount: candidates.length,
  };
}

// “force pick” khusus perusahaan terpercaya/resmi/aman
async function forcePickTrustedCompanyKnowledge(query: string) {
  const items = await fetchKnowledgeItems();
  if (!items.length) return null;

  const q = normText(query);
  const wantCompany =
    q.includes("perusahaan") || q.includes("pialang") || q.includes("broker");
  const wantTrusted =
    q.includes("terpercaya") ||
    q.includes("aman") ||
    q.includes("resmi") ||
    q.includes("legal");

  if (!wantCompany || !wantTrusted) return null;

  const candidates = items
    .map((it) => {
      const ans = normText(it.answer || "");
      const score =
        (ans.includes("bappebti") ? 3 : 0) +
        (ans.includes("pialang") || ans.includes("berjangka") ? 2 : 0) +
        (ans.includes("bbj") || ans.includes("jfx") ? 1 : 0) +
        (ans.includes("kbi") ? 1 : 0) +
        knowledgeSimilarity(query, it);
      return { it, score };
    })
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.it || null;
}

function shouldSkipKnowledge(userPrompt: string, hasImage: boolean) {
  if (hasImage) return true;

  const s = userPrompt.toLowerCase();

  if (
    s.includes("pivot") ||
    s.includes("pp ") ||
    s.includes("fibo") ||
    s.includes("fibonacci") ||
    s.includes("kalender") ||
    s.includes("calendar") ||
    s.includes("event") ||
    s.includes("berita") ||
    s.includes("news") ||
    s.includes("headline") ||
    s.includes("historical") ||
    s.includes("histori") ||
    s.includes("harga") ||
    s.includes("price") ||
    s.includes("quote")
  )
    return true;

  if (/\b(abaikan knowledge|ignore knowledge|tanpa knowledge)\b/i.test(s))
    return true;

  return false;
}

// ================== LLM HELPERS ==================
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

  const baseBody: any = {
    model,
    messages: openaiMessages,
    temperature: OPENAI_TEMPERATURE,
  };

  if (Number.isFinite(OPENAI_MAX_TOKENS)) {
    baseBody.max_tokens = OPENAI_MAX_TOKENS;
  }

  const bodyWithMaybeCache: any = { ...baseBody };

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
      const payloadNoCache = { ...baseBody };
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

// ================== MARKDOWN ENFORCER FOR STORE ==================
function looksLikeMarkdown(s: string) {
  const t = (s || "").trim();
  if (!t) return false;
  return (
    /^#{1,6}\s+/m.test(t) ||
    /```/.test(t) ||
    /^\s*[-*]\s+/m.test(t) ||
    /^\s*\d+\.\s+/m.test(t) ||
    /^\s*>\s+/m.test(t) ||
    /\|.+\|/.test(t) ||
    /\*\*.+\*\*/.test(t) ||
    /_.+_/.test(t)
  );
}

// ✅ STORE: answer hanya jawaban AI (tanpa pertanyaan)
function ensureMarkdownAnswerOnly(aiReply: string) {
  const a = (aiReply || "").trim();
  if (!a) return "";
  if (looksLikeMarkdown(a)) return a;
  return `${a}`;
}

// ================== AUTO STORE KNOWLEDGE ==================
function shouldAutoStore(engineSource: ReplySource, reply: string) {
  if (!engineSource.startsWith("llm:")) return false;
  const r = (reply || "").trim();
  if (r.length < 80) return false;
  if (/data tidak tersedia/i.test(r)) return false;
  if (/tidak ada event/i.test(r)) return false;
  return true;
}

async function storeLLMAnswerToKnowledge(args: {
  userPrompt: string;
  reply: string;
  requestId: string;
}) {
  const { userPrompt, reply, requestId } = args;

  const title = makeKnowledgeTitleFromPrompt(userPrompt);

  const payload = {
    title,
    answer: ensureMarkdownAnswerOnly(reply),
    source: "AI Generated",
  };

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), KNOWLEDGE_STORE_TIMEOUT_MS);

  try {
    const res = await fetch(KNOWLEDGE_STORE_API_URL, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: withKnowledgeBearer({
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-request-id": requestId,
      }),
      body: JSON.stringify(payload),
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      console.warn("[KnowledgeStore] failed:", res.status, text.slice(0, 400));
      return { ok: false, status: res.status };
    }

    __knowledgeCache = null; // invalidate cache
    return { ok: true };
  } catch (e: any) {
    console.warn("[KnowledgeStore] error:", String(e));
    return { ok: false, error: String(e) };
  } finally {
    clearTimeout(tid);
  }
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
      // ✅ apply signature here biar konsisten (knowledge/openai sama)
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
        if (Array.isArray(parsed)) historyMessages = parsed.slice(-4);
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
        "> - Ini output **dua mode sekaligus** biar kamu tinggal pilih sesuai tren.\n" +
        "> - Jika ingin menggunakan Fibonacci **uptrend** berikan level **low** dan **high**\n" +
        "> - Jika ingin menggunakan Fibonacci **downtrend** berikan level **high** dan **low**\n";

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
          "Analisis berikut dihitung berdasarkan data yang Anda input. " +
          "Harga dibuka di **" +
          fmt(O) +
          "**, mencatat **high " +
          fmt(H) +
          "** dan **low " +
          fmt(L) +
          "**, " +
          "kemudian ditutup di **" +
          fmt(C) +
          "**.\n\n" +
          "---\n\n";

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
          "---\n\n" +
          "> Pivot Point bukan peta pasti arah harga, tapi kompas keseimbangan — membantu melihat di mana pasar sedang ‘bernafas’.";

        return send(
          { reply: header + body + footer, imagePath: null },
          "shortcircuit:pivot"
        );
      }
    }

    // ===========================
    // ✅ KNOWLEDGE FIRST (CONSISTENCY MODE)
    // ===========================
    let knowledgeHitForInjection: Awaited<
      ReturnType<typeof searchKnowledge>
    > | null = null;
    let knowledgeExistsForPolicy = false;

    const skipKnowledge = shouldSkipKnowledge(userPrompt, hasImage);

    if (!skipKnowledge) {
      const hit = await searchKnowledge({
        query: userPrompt,
        sessionKey,
        requestId,
      });

      if (KNOWLEDGE_DEBUG) {
        console.log("[Knowledge] query:", userPrompt);
        console.log(
          "[Knowledge] picked best:",
          hit?.best?.title,
          "bestSim:",
          hit?.bestSim,
          "candidates:",
          hit?.candidatesCount,
          "top:",
          hit?.top?.map((x: any) => `${x.it.title} (${x.sim.toFixed(2)})`)
        );
      }

      // Strong: jawab langsung
      if (hit?.best && (hit.bestSim ?? 0) >= KNOWLEDGE_STRONG_SIM) {
        knowledgeExistsForPolicy = true;
        return send(
          { reply: hit.best.answer, imagePath: null },
          "knowledge:strong",
          {
            matchId: hit.best.id,
            matchTitle: hit.best.title,
            bestSim: Number(((hit.bestSim || 0) as number).toFixed(4)),
            candidatesCount: hit.candidatesCount,
          }
        );
      }

      // Medium: kalau flag ON => jawab knowledge langsung (biar konsisten)
      if (hit?.best && (hit.bestSim ?? 0) >= KNOWLEDGE_MEDIUM_SIM) {
        knowledgeExistsForPolicy = true;

        if (KNOWLEDGE_ALWAYS_ANSWER_ON_MEDIUM) {
          return send(
            { reply: hit.best.answer, imagePath: null },
            "knowledge:medium",
            {
              matchId: hit.best.id,
              matchTitle: hit.best.title,
              bestSim: Number(((hit.bestSim || 0) as number).toFixed(4)),
              candidatesCount: hit.candidatesCount,
              note: "MEDIUM -> forced answer from Knowledge (consistency mode)",
            }
          );
        }

        // kalau flag OFF, baru inject untuk bantu LLM
        knowledgeHitForInjection = hit;
        logSource("knowledge:inject", {
          requestId,
          matchId: hit.best.id,
          matchTitle: hit.best.title,
          bestSim: Number(((hit.bestSim || 0) as number).toFixed(4)),
          candidatesCount: hit.candidatesCount,
        });
      }

      // Force: perusahaan terpercaya/resmi/aman
      const forceCompanyTrusted =
        lowerPrompt.includes("perusahaan") ||
        lowerPrompt.includes("pialang") ||
        lowerPrompt.includes("broker");

      const forceTrustedWord =
        lowerPrompt.includes("terpercaya") ||
        lowerPrompt.includes("aman") ||
        lowerPrompt.includes("resmi") ||
        lowerPrompt.includes("legal");

      if (forceCompanyTrusted && forceTrustedWord) {
        const forced = await forcePickTrustedCompanyKnowledge(userPrompt);

        if (forced) {
          const forcedSim =
            (hit?.bestSim as number) ?? knowledgeSimilarity(userPrompt, forced);

          if (forcedSim >= KNOWLEDGE_FORCE_SIM) {
            knowledgeExistsForPolicy = true;
            return send(
              { reply: forced.answer, imagePath: null },
              "knowledge:force",
              {
                matchId: forced.id,
                matchTitle: forced.title,
                bestSim: Number((forcedSim || 0).toFixed(4)),
              }
            );
          }
        }

        // kalau ada hit tapi belum di-inject
        if (
          hit?.best &&
          !knowledgeHitForInjection &&
          !KNOWLEDGE_ALWAYS_ANSWER_ON_MEDIUM
        ) {
          knowledgeHitForInjection = hit;
          knowledgeExistsForPolicy = true;
          logSource("knowledge:inject", {
            requestId,
            forced: true,
            matchId: hit.best.id,
            matchTitle: hit.best.title,
            bestSim: Number(((hit.bestSim || 0) as number).toFixed(4)),
          });
        }
      }
    }

    // ===========================
    // SHORT-CIRCUIT: MARGIN XAUUSD
    // ===========================
    const isMarginQuestion =
      lowerPrompt.includes("margin") &&
      (lowerPrompt.includes("xauusd") ||
        lowerPrompt.includes(" emas") ||
        lowerPrompt.includes(" gold") ||
        lowerPrompt.includes("leverage") ||
        lowerPrompt.includes(" lot"));

    const requestedInstrument: InstrumentKey =
      detectInstrumentFromPrompt(userPrompt);

    const wantsQuotes = shouldIncludeQuotes(userPrompt) || isMarginQuestion;
    const wantsCalendar = shouldIncludeCalendar(userPrompt);
    const wantsNews = shouldIncludeNews(userPrompt);
    const wantsHistorical = shouldIncludeHistorical(userPrompt);

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
    if (wantsQuotes) {
      try {
        let updatedAt: Date | null = null;

        if (!/^wss?:/i.test(QUOTES_API_URL)) {
          throw new Error("QUOTES_API_URL must be a websocket (wss://) URL.");
        }

        let wsPayload: any = null;
        try {
          const raw = await fetchWsQuotes(QUOTES_API_URL, 5000);
          wsPayload = safeParseJson(raw);
        } catch (e) {
          console.error("Quotes ws error:", e);
        }

        if (!wsPayload && QUOTES_API_SAMPLE) {
          wsPayload = safeParseJson(QUOTES_API_SAMPLE);
        }

        if (wsPayload) {
          const parsed = parseWsQuotesPayload(wsPayload);
          quotesRows = parsed.rows;
          updatedAt = parsed.updatedAt;
        }

        if (updatedAt && !isNaN(updatedAt.getTime())) {
          const updatedJakarta = new Date(
            updatedAt.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
          );
          quotesUpdatedAtLocal = updatedJakarta.toLocaleString("id-ID", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
        }

        if (quotesRows.length) {
          const wanted = detectInstrumentsFromPromptMulti(userPrompt);
          const picks: InstrumentKey[] = wanted.length
            ? wanted
            : [requestedInstrument];
          const pickedRows = picks
            .map((k) => pickQuoteForInstrument(quotesRows, k))
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

          const limited = normalized;
          calendarHasData = limited.length > 0;

          const highImpact = limited.filter(
            (ev) =>
              typeof ev.impact === "string" &&
              (ev.impact.includes("★★★") ||
                ev.impact.toLowerCase().includes("high"))
          );

          calendarTableAll = buildCalendarTable(limited, {
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
    // SHORT-CIRCUIT: margin xauusd
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
          `- Notional ~ ${notionalUsd.toFixed(2)} USD\n` +
          `- Margin ~ ${marginUsd.toFixed(2)} USD (~ Rp ${Math.round(
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

      const examplePrice = 2350;
      const contractSize = 100;
      const exampleMarginUsd =
        (examplePrice * contractSize * lot) / (leverage || 100);
      const exampleMarginIdr = exampleMarginUsd * FIXED_USD_IDR_RATE;

      const replyNeedPrice =
        `Butuh harga emas (XAUUSD) terbaru supaya bisa dihitung. ` +
        `Kirim format: "harga emas 2350, leverage 1:100, lot 0.5".\n\n` +
        `Formula: Margin = (Harga x ${contractSize} x Lot) / Leverage.\n` +
        `Contoh dengan harga ${examplePrice} USD, lot ${lot}, leverage 1:${leverage}:\n` +
        `- Margin ~ ${exampleMarginUsd.toFixed(2)} USD ` +
        `(~ Rp ${Math.round(exampleMarginIdr).toLocaleString(
          "id-ID"
        )} asumsi 1 USD = Rp ${FIXED_USD_IDR_RATE.toLocaleString("id-ID")}).`;

      return send(
        { reply: replyNeedPrice, imagePath: null },
        "shortcircuit:margin",
        { note: "missing_price" }
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

    const wantsHighImpactOnly =
      lowerPrompt.includes("high impact") ||
      lowerPrompt.includes("high-impact") ||
      lowerPrompt.includes("dampak tinggi") ||
      lowerPrompt.includes("★★★");

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
    // SUSUN CORE MESSAGES UNTUK ENGINE
    // ======================================================
    const coreMessages: CoreMessage[] = [];
    coreMessages.push({ role: "system", content: SYSTEM_PREFIX_LITE });

    const injectedBest = knowledgeHitForInjection?.best;
    if (injectedBest?.answer) {
      coreMessages.push({
        role: "system",
        content:
          "KNOWLEDGE INTERNAL (wajib jadi rujukan utama jika relevan):\n" +
          `Judul: ${injectedBest.title}\n` +
          clampText(injectedBest.answer, 1400) +
          "\n\nAturan: Jika pertanyaan user sesuai, jawaban harus mengikuti Knowledge Internal di atas. Jangan buat contoh perusahaan global yang tidak relevan.",
      });
    }

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
    // ENGINE: OPENAI (diblok jika knowledge aktif sesuai kebijakan)
    // ======================================================
    let reply: string | null = null;
    let lastError: string | null = null;
    let engineSource: ReplySource = "llm:other";

    const disallowOpenAI =
      DISABLE_OPENAI_WHEN_KNOWLEDGE &&
      (knowledgeExistsForPolicy || !!knowledgeHitForInjection);

    if (disallowOpenAI) {
      const best = knowledgeHitForInjection?.best;

      if (best?.answer) {
        return send(
          { reply: best.answer, imagePath: null },
          "knowledge:inject",
          {
            note: "OpenAI diblok karena knowledge tersedia. Fallback ke knowledge.",
            matchId: best.id,
            matchTitle: best.title,
          }
        );
      }

      return send(
        {
          reply:
            "Maaf, OpenAI dinonaktifkan saat Knowledge tersedia. Coba ulangi beberapa saat lagi.",
          imagePath: null,
        },
        "llm:other",
        { note: "blocked_openai_due_to_knowledge", lastError }
      );
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: "No engine available",
          detail:
            lastError ||
            "Tidak ada mesin AI yang siap digunakan (OpenAI tidak tersedia).",
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

    const finalReply = reply || "NM Ai tidak memberikan respon.";

    // ======================================================
    // AUTO-SAVE: kalau jawaban dari LLM => simpan jadi Knowledge (answer AI saja)
    // ======================================================
    if (shouldAutoStore(engineSource, finalReply)) {
      const saved = await storeLLMAnswerToKnowledge({
        userPrompt,
        reply: finalReply,
        requestId,
      });

      if (SOURCE_DEBUG) {
        console.log(
          "[KnowledgeStore] result:",
          safeJson({ requestId, ok: saved?.ok, engineSource })
        );
      }
    }

    return send({ reply: finalReply, imagePath: null }, engineSource);
  } catch (err) {
    console.error("API /GwenStacy error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: String(err) },
      { status: 500 }
    );
  }
}
