// src/app/api/nm-ai/route.ts

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// =============== OLLAMA CONFIG ==================
const OLLAMA_BASE_URL = (
  process.env.OLLAMA_BASE_URL || "http://localhost:11434"
).replace(/\/+$/, "");

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "NM-Ai";

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

// 🔥 NEW: NEWS API (BERITA TERBARU)
const NEWS_API_URL =
  process.env.NEWS_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/news-id";

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

  // pakai waktu Jakarta sebagai basis
  const nowJakarta = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
  );

  // ===== RELATIF: hari ini / besok / lusa / kemarin / selumbari =====
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
    d.setDate(d.getDate() - 2); // sehari sebelum kemarin
    return formatDateIso(d);
  }

  // ===== ABSOLUT: 2025-11-26 atau 2025/11/26 =====
  const isoMatch = lower.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(parsed.getTime())) return formatDateIso(parsed);
  }

  // ===== ABSOLUT: 26-11-2025 atau 26/11/2025 =====
  const dmyMatch = lower.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(parsed.getTime())) return formatDateIso(parsed);
  }

  // ===== ABSOLUT: 24 november 2025 / 24 nov 2025 / 24 november / 24 nov =====
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
  // LGD Daily (emas)
  gold: ["LGD", "LGD DAILY", "XAUUSD", "XAU", "GOLD", "EMAS", "LGD"],

  // LSI Daily (perak)
  silver: ["LSI", "LSI DAILY", "XAGUSD", "XAG", "SILVER", "PERAK"],

  // BCO Daily (oil)
  oil: ["BCO", "BCO DAILY", "OIL", "BRENT"],

  // HSI Daily (Hang Seng)
  hsi: ["HSI", "HSI DAILY", "HANG SENG"],

  // SNI Daily (Nikkei / index Jepang)
  sni: ["SNI", "SNI DAILY", "NIKKEI", "N225", "JAPAN INDEX"],

  // Forex pairs
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
    usdidr: {name:"Pasangan mata uang USD/IDR", unit: "nilai tukar (rate)"},
    other: { name: "instrumen ini", unit: "unit harga" },
  };

// 💱 FIXED RATE UNTUK SIMULASI / PERHITUNGAN KONSEPTUAL
const FIXED_USD_IDR_RATE = 10000;

// Deteksi instrumen dari teks user (single)
const detectInstrumentFromPrompt = (prompt: string): InstrumentKey => {
  const p = prompt.toLowerCase();

  // GOLD / EMAS / LGD
  if (
    p.includes("emas") ||
    p.includes("gold") ||
    p.includes("xau") ||
    p.includes("lgd")
  ) {
    return "gold";
  }

  // SILVER / PERAK / LSI
  if (
    p.includes("perak") ||
    p.includes("silver") ||
    p.includes("xag") ||
    p.includes("lsi")
  ) {
    return "silver";
  }

  // OIL / BCO / BRENT / MINYAK
  if (
    p.includes("oil") ||
    p.includes("minyak") ||
    p.includes("bco") ||
    p.includes("brent")
  ) {
    return "oil";
  }

  // HSI / Hang Seng
  if (p.includes("hsi") || p.includes("hang seng") || p.includes("hangseng")) {
    return "hsi";
  }

  // SNI / Nikkei / Jepang
  if (
    p.includes("sni") ||
    p.includes("nikkei") ||
    p.includes("n225") ||
    p.includes("jepang")
  ) {
    return "sni";
  }

  // Forex pairs
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

  if (p.includes("usd/idr") || p.includes("usdidr") || p.includes("indo") || p.includes("idr") || p.includes("rupiah")) {
    return "usdidr";
  }

  return "other";
};

// 🔥 NEW: Deteksi banyak instrumen sekaligus dari 1 prompt
const detectInstrumentsFromPromptMulti = (prompt: string): InstrumentKey[] => {
  const p = prompt.toLowerCase();
  const result: InstrumentKey[] = [];

  const pushUnique = (key: InstrumentKey) => {
    if (!result.includes(key)) result.push(key);
  };

  // GOLD / EMAS / LGD
  if (/(emas|gold|xau|lgd)/.test(p)) pushUnique("gold");

  // SILVER / PERAK / LSI
  if (/(perak|silver|xag|lsi)/.test(p)) pushUnique("silver");

  // OIL / BCO / BRENT / MINYAK
  if (/(oil|minyak|bco|brent)/.test(p)) pushUnique("oil");

  // HANG SENG / HSI
  if (/(hang\s*seng|hangseng|hsi)/.test(p)) pushUnique("hsi");

  // NIKKEI / SNI (bonus)
  if (/(nikkei|sni|n225|jepang)/.test(p)) pushUnique("sni");

  // Forex (bonus, kalau suatu saat ditanya barengan)
  if (/(usd\/chf|usdchf|\bchf\b)/.test(p)) pushUnique("usdchf");
  if (/(usd\/jpy|usdjpy|dolar yen|dollar yen|\byen\b|\bjpy\b)/.test(p))
    pushUnique("usdjpy");
  if (/(gbp\/usd|gbpusd|cable|\bpound\b)/.test(p)) pushUnique("gbpusd");
  if (/(aud\/usd|audusd|aussie)/.test(p)) pushUnique("audusd");
  if (/(eur\/usd|eurusd|euro)/.test(p)) pushUnique("eurusd");
  if (/(usd\/idr|usdidr|indo)/.test(p)) pushUnique("usdidr");

  return result;
};

// Pilih deret historis untuk instrumen tertentu dari bySymbol
const pickHistoricalSeriesForInstrument = (
  bySymbol: Map<string, any[]>,
  instrument: InstrumentKey
): { symbol: string; rows: any[] } | null => {
  const hints = INSTRUMENT_HINTS[instrument];
  if (!hints.length) return null;

  // 1) match kuat: nama simbol mengandung hint (LGD Daily, BCO Daily, LSI Daily, dll)
  for (const [sym, list] of bySymbol.entries()) {
    const upperSym = sym.toUpperCase();
    if (hints.some((h) => upperSym.includes(h))) {
      return { symbol: sym, rows: list };
    }
  }

  // 2) fallback: kalau "other", pakai simbol pertama saja
  if (instrument === "other") {
    const first = [...bySymbol.entries()][0];
    if (!first) return null;
    return { symbol: first[0], rows: first[1] };
  }

  return null;
};

// 🔎 Pilih simbol dari QUOTES untuk instrumen tertentu
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

  // fallback kalau gak ketemu
  return rows.length ? rows[0] : null;
};

// Helper konversi history ke string (biar hemat token)
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

    // === Parse history dari frontend ===
    let historyMessages: { role: string; content: any }[] = [];
    if (historyRaw) {
      try {
        const parsed = JSON.parse(historyRaw);
        if (Array.isArray(parsed)) {
          // ambil max 10 terakhir
          historyMessages = parsed.slice(-10);
        }
      } catch (e) {
        console.error("Gagal parse history:", e);
      }
    }

    // Flag: interaksi pertama atau tidak
    const isFirstInteraction = historyMessages.length === 0;

    // === BACA FILE (TANPA SIMPAN KE DISK) ===
    if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      base64Image = buffer.toString("base64"); // untuk Ollama: plain base64
    }

    const hasImage = !!base64Image;

    const userPrompt =
      prompt.trim() ||
      (hasImage
        ? "Tolong analisis gambar atau chart yang saya kirim secara edukatif."
        : "Tolong berikan wawasan edukatif seputar pasar.");

    const lowerPrompt = userPrompt.toLowerCase();

    // Deteksi instrumen yang dimaksud user (untuk historical & quotes)
    const requestedInstrument: InstrumentKey =
      detectInstrumentFromPrompt(userPrompt);

    // 🔎 NEW: DETEKSI PERTANYAAN BERITA TERBARU
    const isNewsQuery =
      lowerPrompt.includes("berita terbaru") ||
      lowerPrompt.includes("news terbaru") ||
      lowerPrompt.includes("headline") ||
      lowerPrompt.includes("berita hari ini") ||
      (lowerPrompt.includes("berita") &&
        (lowerPrompt.includes("update") ||
          lowerPrompt.includes("pasar") ||
          lowerPrompt.includes("market")));

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

    // Tanggal target dari prompt (kalau nggak ada → hari ini)
    const targetCalendarDate = detectRequestedDate(userPrompt) || todayIso;

    // Deteksi apakah user lagi minta overview kalender (contoh: "kalender ekonomi hari ini")
    const isCalendarOverview =
      lowerPrompt.includes("kalender ekonomi") ||
      lowerPrompt.includes("economic calendar") ||
      lowerPrompt.includes("calendar ekonomi");

    // Deteksi apakah user minta fokus HIGH IMPACT / dampak tinggi
    const wantsHighImpactOnly =
      lowerPrompt.includes("high impact") ||
      lowerPrompt.includes("high-impact") ||
      lowerPrompt.includes("highimpact") ||
      lowerPrompt.includes("dampak tinggi") ||
      lowerPrompt.includes("impact tinggi") ||
      lowerPrompt.includes("★★★");

    // ===== DETEKSI RELATIF HARI UNTUK HISTORICAL (X hari sebelumnya/lalu) =====
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

    // ===== LABEL MANUSIAWI UNTUK TANGGAL KALENDER (HARI INI / KEMARIN / BESOK) =====
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

    // ========== 1) SYSTEM PERSONA ==========
    const systemPersonaMessage = {
      role: "system" as const,
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
        "- Jangan menjawab dalam bahasa lain (Inggris, Jerman, dll) kecuali pengguna secara eksplisit meminta terjemahan.\n" +
        "- Jika pengguna membuka dengan kata 'Hallo', tetap jawab dengan 'Halo' versi Bahasa Indonesia.\n\n" +
        "⚠️ ATURAN SAPAAN / PEMBUKA JAWABAN:\n" +
        "- Kamu TIDAK BOLEH membuka setiap jawaban dengan salam tetap seperti 'Halo! Saya NM Ai.'\n" +
        "- Fokus utama adalah menjawab inti pertanyaan dengan singkat, jelas, dan edukatif.\n" +
        "- Hanya pada interaksi pertama di satu sesi, kamu BOLEH menyapa singkat jika dirasa perlu, " +
        "tapi tidak wajib, dan jangan diulang di pesan berikutnya.\n" +
        "- Kamu juga TIDAK boleh membuka jawaban dengan blok seperti 'Update terbaru:' diikuti waktu sekarang dan kalender ekonomi. Format seperti itu sudah TIDAK dipakai lagi.\n\n" +
        "⚠️ KEJUJURAN DATA (ANTI NGAWUR):\n" +
        "- Jika data internal (harga, kalender, berita, historis) di system message mengatakan TIDAK TERSEDIA, kamu **WAJIB** menjawab bahwa data tidak tersedia dan **DILARANG** menebak angka, jam rilis, atau event spesifik.\n" +
        "- Jika kamu tidak yakin, jawab saja 'data internal NM saat ini tidak cukup untuk menjawab secara spesifik'. Jangan mengarang.\n\n" +
        "Peranmu: jurnalis-ekonom, edukator risiko, dan penjaga etika untuk pengguna Newsmaker.id. " +
        "Gunakan bahasa Indonesia yang rapi, profesional, hangat, dan edukatif.\n\n" +
        "Jika pengguna mengirim **gambar atau chart**, lakukan hal berikut:\n" +
        "- Jelaskan terlebih dulu apa yang tampak di chart (tren, pola, support/resistance, area penting).\n" +
        "- Baru setelah itu, kalau relevan, hubungkan dengan konteks data live atau fundamental.\n" +
        "- Jangan mengabaikan gambar dan langsung menjawab hanya dari data live.\n" +
        "- Jika model ini ternyata tidak bisa menganalisis gambar, jujur sampaikan bahwa untuk saat ini NM Ai " +
        "belum bisa membaca gambar dan minta pengguna menjelaskan chart dengan kata-kata.\n\n" +
        (isFirstInteraction
          ? "INI INTERAKSI PERTAMA di sesi ini. Kamu boleh menyapa singkat kalau mau, " +
            "tapi setelah itu langsung masuk ke inti jawaban. Di pesan-pesan berikutnya, " +
            "JANGAN mengulang salam pembuka yang sama.\n"
          : "Dalam sesi ini SUDAH ada riwayat percakapan. JANGAN lagi memakai salam pembuka seperti 'Halo, saya NM Ai.' " +
            "Langsung jawab inti berdasarkan konteks percakapan.\n"),
    };

    // ========== 2) SYSTEM TIME ==========
    const systemTimeMessage = {
      role: "system" as const,
      content:
        `Sistem internal: waktu saat ini di zona waktu Asia/Jakarta (WIB) adalah ${nowJakartaStr}. ` +
        `Jika pengguna secara eksplisit menanyakan 'tanggal berapa hari ini', 'sekarang jam berapa', ` +
        `atau pertanyaan serupa, jawablah dengan tanggal dan jam tersebut dalam format yang wajar. ` +
        `Selain itu, jangan menyebutkan tanggal/jam saat ini secara spontan tanpa diminta.`,
    };

    // ========== 2b) ATURAN ANTI BLOK "UPDATE TERBARU" ==========
    const systemNoUpdateBlockMessage = {
      role: "system" as const,
      content:
        "ATURAN KHUSUS TENTANG BLOK UPDATE:\n" +
        "- Jangan pernah membuka jawaban dengan judul atau subjudul seperti 'Update terbaru:', 'Update pasar hari ini:', atau format serupa.\n" +
        "- Jangan secara otomatis membuat blok yang berisi gabungan: waktu sekarang + kalender ekonomi + event besok, kecuali pengguna meminta secara eksplisit.\n" +
        "- Jika pengguna bertanya umum (tanpa minta waktu/jam/tanggal), langsung jawab inti pertanyaan tanpa menyebut jam/tanggal dan tanpa label 'Update terbaru'.\n" +
        "- Jika pengguna minta 'update pasar' atau 'kalender ekonomi', berikan ringkasan secukupnya, tetapi tetap tanpa menulis heading 'Update terbaru:'.\n",
    };

    // ========== 2c) ATURAN FIXED RATE KURS USD/IDR ==========
    const systemFxRuleMessage = {
      role: "system" as const,
      content:
        "ATURAN KONVERSI KURS (FIXED RATE UNTUK SIMULASI):\n" +
        `- Untuk contoh perhitungan margin, nilai kontrak, atau simulasi biaya dalam Rupiah, gunakan asumsi kurs tetap **1 USD = Rp ${FIXED_USD_IDR_RATE.toLocaleString(
          "id-ID"
        )}**.\n` +
        "- Selalu sebutkan dengan jelas bahwa kurs ini adalah *asumsi tetap (fixed rate)*, bukan kurs real-time pasar.\n" +
        "- Jika pengguna secara eksplisit memberikan kurs lain (misalnya: 'anggap 1 USD = 10.000'), gunakan kurs dari pengguna dan abaikan fixed rate.\n" +
        "- Jangan mengklaim bahwa fixed rate ini adalah kurs resmi hari ini; gunakan istilah seperti 'contoh simulasi', 'asumsi kurs tetap', atau 'perhitungan konseptual'.\n" +
        "- Untuk XAUUSD, jika pengguna minta contoh margin standar, kamu boleh menggunakan asumsi: ukuran kontrak 1000 oz per lot, sehingga nilai kontrak = harga per oz × 1000, dan margin = nilai kontrak / leverage (misalnya leverage 1:100 = 1% dari nilai kontrak).\n",
    };

    // ========== 3) FETCH DATA PARALLEL (QUOTES, CALENDAR, HISTORICAL, NEWS) ==========
    let quotesSummary = "";
    let quotesUpdatedAtLocal = "";
    let quotesRows: any[] = [];

    let calendarSummaryAll = "";
    let calendarSummaryHighImpact = "";
    let calendarHasData = false;

    let historicalSummary = "";
    let historicalInstrumentWindowSummary = "";
    let historicalFromLabel = "";

    let newsSummaryAll = "";
    let newsSummaryToday = "";
    let newsHasData = false;

    const calendarUrl = buildCalendarUrl(CALENDAR_API_URL, targetCalendarDate);

    const [quotesResult, calendarResult, historicalResult, newsResult] =
      await Promise.allSettled([
        fetch(QUOTES_API_URL, { method: "GET", cache: "no-store" }),
        fetch(calendarUrl, { method: "GET", cache: "no-store" }),
        fetch(HISTORICAL_API_URL, { method: "GET", cache: "no-store" }),
        fetch(NEWS_API_URL, { method: "GET", cache: "no-store" }),
      ]);

    // ----- QUOTES -----
    if (quotesResult.status === "fulfilled") {
      const quotesRes = quotesResult.value;
      if (quotesRes.ok) {
        try {
          const quotesData: any = await quotesRes.json();
          const rows: any[] = Array.isArray(quotesData.data)
            ? quotesData.data
            : [];

          // format waktu update ke WIB (kalau ada)
          if (quotesData.updatedAt) {
            const updatedRaw = new Date(quotesData.updatedAt);
            if (!isNaN(updatedRaw.getTime())) {
              const updatedJakarta = new Date(
                updatedRaw.toLocaleString("en-US", {
                  timeZone: "Asia/Jakarta",
                })
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

          // batasi maksimal 50 simbol biar nggak kepanjangan
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
                `- **${symbol}** (${kategori}) ` +
                `sekitar **${last}**, ` +
                `bergerak ${arah} ±${change} poin (~${pct}%).`
              );
            })
            .join("\n");
        } catch (e) {
          console.error("Gagal parse quotes JSON:", e);
        }
      } else {
        console.error("Quotes HTTP error:", quotesRes.status);
      }
    } else {
      console.error("Quotes fetch error:", quotesResult.reason);
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
              "Ringkasan harga terkini (angka di bawah hanya referensi internal, rangkai ulang dengan bahasamu sendiri):\n" +
              quotesSummary +
              "\n\n" +
              "ATURAN PENTING TENTANG ANGKA:\n" +
              "- Jika menyebut HARGA TERKINI, gunakan angka **last** apa adanya dari data di atas, boleh ditambah kata 'sekitar', tetapi **JANGAN** mengubahnya menjadi rentang baru (misalnya 4.220–4.250) jika rentang itu tidak ada di data.\n" +
              "- Jangan mengarang rentang harga atau level spesifik yang tidak muncul di data internal.\n" +
              "- Jika angka terlihat tidak masuk akal untuk instrumen tertentu, boleh jelaskan arah (naik/turun/stabil) tanpa menyebut angka detail.\n" +
              "- Jika instrumen yang diminta tidak ada, sampaikan dengan sopan dan beri penjelasan edukatif umum.\n"
            );
          })()
        : "Sistem harga live saat ini tidak berhasil mengambil data. Jika pengguna bertanya harga terkini, jangan mengarang angka; jelaskan bahwa data live sementara tidak tersedia dan beri penjelasan edukatif secara umum.",
    };

    // ----- CALENDAR -----
    if (calendarResult.status === "fulfilled") {
      const calRes = calendarResult.value;
      if (calRes.ok) {
        try {
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

          // batasi maksimal 40 event biar nggak kepanjangan
          const normalizedEvents = filteredEvents
            .slice(0, 40)
            .map((ev: any) => ({
              date: targetCalendarDate,
              time: ev.time ?? "-",
              currency: ev.currency ?? "-",
              impact: ev.impact ?? "-",
              event: ev.event ?? "-",
              previous: ev.previous ?? "-",
              forecast: ev.forecast ?? "-",
              actual: ev.actual ?? "",
            }));

          const events = normalizedEvents;
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
                `Dampak **${impactLabel}** (${impact}). ` +
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
        } catch (e) {
          console.error("Gagal parse calendar JSON:", e);
        }
      } else {
        console.error("Calendar HTTP error:", calRes.status);
      }
    } else {
      console.error("Calendar fetch error:", calendarResult.reason);
    }

    const extraCalendarInstruction = wantsHighImpactOnly
      ? "Pengguna meminta event berdampak tinggi (high impact / ★★★). Utamakan event tersebut.\n"
      : isCalendarOverview
      ? "Pengguna menanyakan kalender ekonomi secara umum. Tampilkan seluruh event tanggal tersebut dalam bentuk bullet.\n"
      : "Jika pengguna bertanya event tertentu (misalnya NFP, CPI, suku bunga), fokus ke event tersebut dan jelaskan dampaknya.\n";

    const systemCalendarMessage = {
      role: "system" as const,
      content: calendarHasData
        ? (() => {
            const baseHeader = `Kalender ekonomi internal untuk ${calendarHumanLabel}:\n\n`;

            const noteRel =
              `Catatan penting: hari ini adalah ${todayIso}. ` +
              `Tanggal yang sedang dibahas adalah ${targetCalendarDate}. ` +
              `Gunakan frasa **${calendarHumanLabel}** saat menyebut tanggal ini, ` +
              "dan jangan menggantinya dengan istilah yang salah (misalnya menyebut 'besok' untuk tanggal yang sudah lewat).\n\n";

            if (wantsHighImpactOnly) {
              return (
                baseHeader +
                noteRel +
                "Event berdampak tinggi:\n" +
                calendarSummaryHighImpact +
                "\n\n" +
                "Jika pengguna minta semua event, kamu boleh menyebutkan ringkasan lain secara singkat.\n" +
                extraCalendarInstruction
              );
            }

            return (
              baseHeader +
              noteRel +
              "Daftar event utama:\n" +
              calendarSummaryAll +
              "\n\n" +
              "Ringkasan event berdampak tinggi:\n" +
              calendarSummaryHighImpact +
              "\n\n" +
              extraCalendarInstruction
            );
          })()
        : `Kalender ekonomi internal untuk ${calendarHumanLabel} tidak berhasil diambil. ` +
          "Jika pengguna bertanya jadwal rilis, jelaskan keterbatasan data dan jangan mengarang jam/event.",
    };

    // ----- HISTORICAL -----
    try {
      // coba baca dateFrom dari URL (kalau ada)
      try {
        const url = new URL(HISTORICAL_API_URL);
        const df = url.searchParams.get("dateFrom");
        if (df) historicalFromLabel = df;
      } catch {
        historicalFromLabel = "";
      }

      if (historicalResult.status === "fulfilled") {
        const histRes = historicalResult.value;
        if (histRes.ok) {
          const histData: any = await histRes.json();
          const rows: any[] = Array.isArray(histData.data) ? histData.data : [];

          // Kelompokkan per simbol
          const bySymbol = new Map<string, any[]>();
          for (const row of rows) {
            const symbol: string =
              row.symbol || row.Symbol || row.ticker || row.Ticker || "UNKNOWN";
            if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
            bySymbol.get(symbol)!.push(row);
          }

          // ====== SUMMARY BESAR PER SIMBOL ======
          const lines: string[] = [];

          for (const [symbol, list] of bySymbol.entries()) {
            if (!list.length) continue;

            // sort by date kalau ada
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

            const fmt = (n: number) =>
              Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2);

            lines.push(
              `- **${symbol}**: dari sekitar **${fmt(startClose)}** ` +
                `menjadi sekitar **${fmt(endClose)}**, perubahan ±${fmt(
                  absChange
                )} poin (~${pctChange.toFixed(
                  2
                )}%). Secara garis besar instrumen ini ${arah}`
            );
          }

          historicalSummary = lines.join("\n");

          // ====== RINGKASAN KHUSUS: X HARI SEBELUMNYA UNTUK INSTRUMEN YANG DIMINTA ======
          if (historicalDaysAgo && historicalDaysAgo > 0) {
            const series = pickHistoricalSeriesForInstrument(
              bySymbol,
              requestedInstrument
            );

            if (series && series.rows.length) {
              const { symbol: histSymbol, rows: histRows } = series;

              // map tanggal ISO -> harga close
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
                INSTRUMENT_LABEL[requestedInstrument] ||
                INSTRUMENT_LABEL.other;
              const instrName =
                requestedInstrument === "other" ? histSymbol : labelInfo.name;
              const unit = labelInfo.unit;

              const maxWindow = Math.min(historicalDaysAgo, 10); // batasi max 10 hari
              const detailLines: string[] = [];

              for (let i = maxWindow; i >= 1; i--) {
                const d = new Date(nowJakarta);
                d.setDate(d.getDate() - i);
                const iso = formatDateIso(d);
                const price = datePriceMap.get(iso);
                if (price != null) {
                  const priceFmt =
                    Math.abs(price) >= 100
                      ? price.toFixed(0)
                      : price.toFixed(2);
                  detailLines.push(
                    `- ${iso}: sekitar **${priceFmt}** ${unit}.`
                  );
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
      } else {
        console.error("Historical fetch error:", historicalResult.reason);
      }
    } catch (err) {
      console.error("Gagal proses historical:", err);
    }

    const historicalRangeLabel = historicalFromLabel
      ? `sejak **${historicalFromLabel}** hingga data terbaru yang tersedia`
      : "selama periode data historis yang tersedia";

    // Instruksi ekstra khusus untuk pertanyaan relatif "X hari sebelumnya"
    const extraHistoricalInstruction =
      historicalRelativeDateIso && historicalDaysAgo !== null
        ? "Pengguna menggunakan frasa waktu relatif, misalnya **" +
          historicalDaysAgo +
          " hari sebelumnya** dari hari ini (WIB), kira-kira tanggal **" +
          historicalRelativeDateIso +
          "**.\n" +
          "- Jika pertanyaan seperti: 'historical data [instrumen] 5 hari sebelumnya', gunakan data historis instrumen tersebut (jika tersedia) untuk merangkum harga per hari.\n" +
          "- Jika data per hari untuk periode tersebut tidak lengkap, jelaskan keterbatasan dan jangan mengarang angka.\n"
        : "Jika pengguna menggunakan frasa 'X hari sebelumnya' atau 'X hari lalu', " +
          "anggap X sebagai jumlah hari mundur dari tanggal hari ini (WIB) dan gunakan data historis untuk mendekati tanggal tersebut.\n";

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
          "- Anggap data historis ini sebagai data internal sistem, bukan dataset yang dikirim pengguna.\n" +
          "- Jangan berkata seolah-olah pengguna mengirim dataset ini (hindari frasa 'data Anda', 'dataset Anda').\n" +
          "- Gunakan saat pengguna bertanya tentang tren beberapa waktu terakhir atau X hari sebelumnya.\n" +
          "- Jangan mengarang angka historis yang tidak didukung data.\n\n" +
          extraHistoricalInstruction
        : "Sistem data historis saat ini tidak berhasil mengambil data. Jika pengguna bertanya tentang pergerakan historis, jawab secara konseptual tanpa menyebut angka spesifik.",
    };

    // ----- 🔥 NEW: NEWS (BERITA PASAR) -----
    if (newsResult.status === "fulfilled") {
      const newsRes = newsResult.value;
      if (newsRes.ok) {
        try {
          const newsData: any = await newsRes.json();
          const rows: any[] = Array.isArray(newsData.data)
            ? newsData.data
            : [];

          if (rows.length > 0) {
            // sort terbaru dulu (pakai published_at / createdAt)
            const sorted = [...rows].sort((a, b) => {
              const da = a.published_at || a.createdAt || a.date;
              const db = b.published_at || b.createdAt || b.date;
              const ta = da ? new Date(da).getTime() : 0;
              const tb = db ? new Date(db).getTime() : 0;
              return tb - ta;
            });

            // ambil max 15 berita terakhir
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

              const penulisLabel = authorName
                ? `, ditulis oleh ${authorName}`
                : "";

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
          }
        } catch (e) {
          console.error("Gagal parse news JSON:", e);
        }
      } else {
        console.error("News HTTP error:", newsRes.status);
      }
    } else {
      console.error("News fetch error:", newsResult.reason);
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
              "- Jika pengguna bertanya **'berita terbaru tentang apa'**, pilih 3–5 judul paling relevan dari daftar di atas, lalu jelaskan isinya dengan bahasamu sendiri secara ringkas dan mudah dipahami.\n" +
              "- Jika pengguna menyebut instrumen tertentu (misalnya *emas, minyak, dolar, Nikkei, Hang Seng, kripto*), prioritaskan berita yang judul/summary-nya mengandung kata tersebut.\n" +
              "- Jangan menyalin daftar di atas mentah-mentah sebagai jawaban final; rangkai ulang menjadi narasi yang enak dibaca.\n" +
              "- Jika pengguna hanya minta satu topik utama, cukup ambil 1–3 berita yang paling kuat keterkaitannya.\n";

            if (isNewsQuery) {
              txt +=
                "\nPengguna di pesan terakhir tampaknya sedang MENANYAKAN BERITA TERBARU. Fokuskan jawabanmu untuk merangkum 1–3 berita utama yang paling relevan dengan pertanyaan pengguna.\n";
            } else {
              txt +=
                "\nJika pengguna tidak menyinggung berita sama sekali, tidak perlu memaksa menyebut judul berita; gunakan daftar ini hanya bila relevan.\n";
            }

            return txt;
          })()
        : "Sistem berita pasar Newsmaker.id (endpoint `/api/news-id`) saat ini tidak berhasil mengambil data. Jika pengguna bertanya 'berita terbaru', jelaskan bahwa data berita internal sedang tidak dapat diakses dan berikan penjelasan pasar secara umum tanpa menyebut artikel spesifik.",
    };

    // ========== 6) INSTRUKSI PENGGUNAAN DATA vs GAMBAR ==========
    const systemDataUsageMessage = {
      role: "system" as const,
      content: hasImage
        ? "PENTING: Pesan terakhir pengguna menyertakan GAMBAR/CHART.\n" +
          "- Prioritaskan analisis VISUAL: jelaskan tren, pola, area penting.\n" +
          "- Barulah, jika relevan, hubungkan dengan data harga live / fundamental.\n" +
          "- Jangan membuka jawaban hanya dengan rangkuman data tanpa menyebut chart.\n"
        : "PENTING: Pesan terakhir pengguna TIDAK menyertakan gambar.\n" +
          "- Untuk pertanyaan harga terkini, gunakan ringkasan data quotes.\n" +
          "- Untuk tren beberapa waktu terakhir, gunakan ringkasan data historis.\n" +
          "- Untuk pertanyaan 'historical data [instrumen] X hari sebelumnya', gunakan ringkasan per hari jika tersedia.\n" +
          "- Untuk pertanyaan berita, gunakan ringkasan dari sistem berita internal jika relevan.\n",
    };

    // 🔥🔥 SHORT-CIRCUIT 1: PERTANYAAN HARGA LANGSUNG DARI API, TANPA OLLAMA 🔥🔥
    const isPriceQuestion =
      (lowerPrompt.includes("harga ") ||
        lowerPrompt.startsWith("harga") ||
        lowerPrompt.includes("level harga") ||
        lowerPrompt.includes("level emas") ||
        lowerPrompt.includes("price ") ||
        lowerPrompt.includes("quote ")) &&
      quotesRows.length > 0;

    if (isPriceQuestion) {
      // Deteksi apakah user menyebut beberapa instrumen sekaligus
      const requestedInstrumentsMulti =
        detectInstrumentsFromPromptMulti(userPrompt);

      // Kalau tidak ada keyword spesifik, pakai yang single (existing behavior)
      const instrumentsToShow: InstrumentKey[] =
        requestedInstrumentsMulti.length > 0
          ? requestedInstrumentsMulti
          : [requestedInstrument];

      const lines: string[] = [];

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

        // Nama yang lebih enak dibaca di list
        let displayName = labelInfo.name;
        if (instr === "gold") displayName = "Gold";
        if (instr === "silver") displayName = "Silver";
        if (instr === "oil") displayName = "Oil";
        if (instr === "hsi") displayName = "Hang Seng";
        if (instr === "sni") displayName = "Nikkei 225";

        lines.push(
          `- **${displayName}**: sekitar **${lastText}** (${labelInfo.unit}), ` +
            `${changeText}${pctText}.`
        );
      }

      if (lines.length > 0) {
        const updatedInfo = quotesUpdatedAtLocal
          ? ` (pembaruan sekitar ${quotesUpdatedAtLocal} WIB)`
          : "";

const replyText =
  `Harga terkini berdasarkan data internal Newsmaker${updatedInfo}:\n\n` +
  lines.join("\n") +
  "\n\nJika mau, kamu bisa minta penjelasan faktor yang mempengaruhi salah satu instrumen di atas (fundamental, sentimen, atau teknikal).";

        return NextResponse.json(
          {
            reply: replyText,
            imagePath: null,
          },
          { status: 200 }
        );
      }

      // Kalau nggak ada satupun instrumen yang ketemu di quotes, biarkan lanjut ke Ollama
    }

    // 🔥🔥 SHORT-CIRCUIT 2: PERTANYAAN KALENDER EKONOMI LANGSUNG DARI API 🔥🔥
    if (isCalendarOverview) {
      if (calendarHasData) {
        const header = `Kalender ekonomi ${calendarHumanLabel} di sistem Newsmaker:\n\n`;
        const body = wantsHighImpactOnly
          ? calendarSummaryHighImpact ||
            "- Tidak ada event berdampak sangat tinggi (★★★) pada tanggal ini."
          : calendarSummaryAll ||
            "- Tidak ada event terdaftar pada tanggal ini di sistem Newsmaker.";

        const note = wantsHighImpactOnly
          ? "\n\nFokus di atas hanya event berdampak tinggi. Jika ingin melihat semua event, tulis saja: kalender ekonomi hari ini lengkap."
          : "";

        return NextResponse.json(
          {
            reply: header + body + note,
            imagePath: null,
          },
          { status: 200 }
        );
      } else {
        const msg =
          `Kalender ekonomi ${calendarHumanLabel} di sistem Newsmaker saat ini tidak tersedia atau kosong.\n` +
          "Jadi, gue nggak bisa menyebut jam dan event spesifik untuk hari ini. " +
          "Kalau mau, gue bisa jelaskan contoh event ekonomi penting secara umum (misalnya NFP, CPI, FOMC, keputusan suku bunga) tanpa menyebut tanggal dan jam tertentu.";

        return NextResponse.json(
          {
            reply: msg,
            imagePath: null,
          },
          { status: 200 }
        );
      }
    }

    // ====== SUSUN MESSAGES UNTUK OLLAMA ======
    const ollamaMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
      images?: string[];
    }> = [];

    // system messages dulu (urutan penting)
    const systemMessages = [
      systemPersonaMessage,
      systemTimeMessage,
      systemNoUpdateBlockMessage, // 🚫 larangan blok "Update terbaru"
      systemFxRuleMessage, // 💱 aturan fixed rate
      systemQuotesMessage,
      systemCalendarMessage,
      systemHistoricalMessage,
      systemNewsMessage, // 🔥 NEW: berita
      systemDataUsageMessage,
    ];

    for (const sm of systemMessages) {
      ollamaMessages.push({
        role: "system",
        content: sm.content,
      });
    }

    // history dari frontend (anggap role "ai" = "assistant")
    for (const hm of historyMessages) {
      const role =
        hm.role === "ai" || hm.role === "assistant" ? "assistant" : "user";
      ollamaMessages.push({
        role,
        content: toText(hm.content),
      });
    }

    // user message terakhir
    const userMsg: {
      role: "user";
      content: string;
      images?: string[];
    } = {
      role: "user",
      content: userPrompt,
    };

    if (hasImage && base64Image) {
      // Ollama /api/chat: images = [base64] tanpa header data:
      userMsg.images = [base64Image];
    }

    ollamaMessages.push(userMsg);

    // ====== PANGGIL OLLAMA /api/chat (DIPERKETAT AGAR TIDAK NGAWUR) ======
    const ollamaRes = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: ollamaMessages,
        stream: false,
        options: {
          temperature: 0.2,
          top_p: 0.9,
          top_k: 40,
          repeat_penalty: 1.05,
          num_ctx: 8192,
          seed: 1,
        },
      }),
    });

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text().catch(() => "");
      console.error("Ollama HTTP error:", ollamaRes.status, errText);
      return NextResponse.json(
        {
          error: "Ollama error",
          detail: `Status ${ollamaRes.status}: ${errText}`,
        },
        { status: 500 }
      );
    }

    const ollamaJson: any = await ollamaRes.json();

    // Format standar Ollama /api/chat:
    // { model, created_at, message: { role, content }, done, ... }
    const reply: string =
      ollamaJson?.message?.content?.toString() ||
      "NM Ai tidak memberikan respon.";

    return NextResponse.json(
      {
        reply,
        imagePath: null,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("API /nm-ai error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: String(err) },
      { status: 500 }
    );
  }
}
