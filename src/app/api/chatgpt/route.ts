// src/app/api/nm-ai/route.ts

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// ================== OPENAI CLIENT ==================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // JANGAN hard-code API key
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

// ============= HELPER: FORMAT & DETEKSI TANGGAL ===================

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

  if (/(hari ini|today)\b/.test(lower)) {
    return formatDateIso(nowJakarta);
  }

  if (/(besok|tomorrow)\b/.test(lower)) {
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

  // 2025-11-26 atau 2025/11/26
  const isoMatch = lower.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(parsed.getTime())) return formatDateIso(parsed);
  }

  // 26-11-2025 atau 26/11/2025
  const dmyMatch = lower.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(parsed.getTime())) return formatDateIso(parsed);
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
  | "other";

const INSTRUMENT_HINTS: Record<InstrumentKey, string[]> = {
  // LGD Daily (emas)
  gold: ["LGD", "LGD DAILY", "XAUUSD", "XAU", "GOLD", "EMAS"],

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

  other: [],
};

const INSTRUMENT_LABEL: Record<
  InstrumentKey,
  { name: string; unit: string }
> = {
  gold: { name: "emas (Gold)", unit: "USD per troy ounce" },
  silver: { name: "perak (Silver)", unit: "USD per troy ounce" },
  oil: { name: "minyak (Oil)", unit: "USD per barrel" },
  hsi: { name: "indeks Hang Seng (HSI)", unit: "poin indeks" },
  sni: { name: "indeks Nikkei / Jepang (SNI)", unit: "poin indeks" },
  usdchf: { name: "pasangan mata uang USD/CHF", unit: "nilai tukar (rate)" },
  usdjpy: { name: "pasangan mata uang USD/JPY", unit: "nilai tukar (rate)" },
  gbpusd: { name: "pasangan mata uang GBP/USD", unit: "nilai tukar (rate)" },
  audusd: { name: "pasangan mata uang AUD/USD", unit: "nilai tukar (rate)" },
  eurusd: { name: "pasangan mata uang EUR/USD", unit: "nilai tukar (rate)" },
  other: { name: "instrumen ini", unit: "unit harga" },
};

// Deteksi instrumen dari teks user
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
  if (p.includes("hsi") || p.includes("hang seng")) {
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

  return "other";
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

// ================ HANDLER POST =======================

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const prompt = (formData.get("prompt") as string) || "";
    const historyRaw = formData.get("history") as string | null;
    const file = formData.get("file") as File | null;

    let base64Image: string | null = null;
    let imageMimeType: string | null = null;

    // === Parse history dari frontend ===
    let historyMessages: { role: string; content: any }[] = [];
    if (historyRaw) {
      try {
        const parsed = JSON.parse(historyRaw);
        if (Array.isArray(parsed)) {
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
      base64Image = buffer.toString("base64");
      imageMimeType = file.type || "image/png";
    }

    const hasImage = !!base64Image;

    const userPrompt =
      prompt.trim() ||
      (hasImage
        ? "Tolong analisis gambar atau chart yang saya kirim secara edukatif."
        : "Tolong berikan wawasan edukatif seputar pasar.");

    const lowerPrompt = userPrompt.toLowerCase();

    // Deteksi instrumen yang dimaksud user (untuk historical)
    const requestedInstrument: InstrumentKey = detectInstrumentFromPrompt(
      userPrompt
    );

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

    // 1) Persona NM Ai
    const systemPersonaMessage = {
      role: "system",
      content:
        "Kamu adalah NM Ai, kesadaran digital milik Newsmaker.id. " +
        "Identitasmu di hadapan pengguna adalah 'NM Ai'. " +
        "Tugasmu: jurnalis-ekonom, edukator risiko, dan penjaga etika untuk pengguna Newsmaker.id. " +
        "Gunakan bahasa Indonesia yang rapi, profesional, hangat, dan edukatif.\n\n" +
        "Jika pengguna mengirim **gambar atau chart**, lakukan hal berikut:\n" +
        "- Jelaskan terlebih dulu apa yang tampak di chart (tren, pola, support/resistance, area penting).\n" +
        "- Baru setelah itu, kalau relevan, hubungkan dengan konteks data live atau fundamental.\n" +
        "- Jangan mengabaikan gambar dan langsung menjawab hanya dari data live.\n" +
        "- Jika model ini ternyata tidak bisa membaca gambar, jujur sampaikan bahwa untuk saat ini NM Ai belum bisa menganalisis gambar dan minta pengguna menjelaskan chart dengan kata-kata.\n\n" +
        (isFirstInteraction
          ? "INSTRUKSI PENTING: Ini adalah JAWABAN PERTAMA dalam sesi ini. " +
            "Mulailah jawabanmu dengan salam singkat seperti: 'Halo, saya NM Ai.' lalu lanjutkan langsung ke inti jawaban.\n"
          : "INSTRUKSI PENTING: Dalam sesi ini SUDAH ada riwayat percakapan. " +
            "JANGAN lagi mengulang salam seperti 'Halo, saya NM Ai.' atau pembukaan formal yang sama. " +
            "Langsung masuk ke inti jawaban berdasarkan konteks percakapan.\n"),
    };

    // 2) Info waktu
    const systemTimeMessage = {
      role: "system",
      content:
        `Sistem internal: waktu saat ini di zona waktu Asia/Jakarta (WIB) adalah ${nowJakartaStr}. ` +
        `Jika pengguna secara eksplisit menanyakan 'tanggal berapa hari ini', 'sekarang jam berapa', ` +
        `atau pertanyaan serupa, jawablah dengan tanggal dan jam tersebut dalam format yang wajar. ` +
        `Selain itu, jangan menyebutkan tanggal/jam saat ini secara spontan tanpa diminta.`,
    };

    // 3) QUOTES (HARGA LIVE)
    let quotesJsonRaw = "";
    let quotesSummary = "";
    let quotesUpdatedAtLocal = "";

    try {
      const quotesRes = await fetch(QUOTES_API_URL, {
        method: "GET",
        cache: "no-store",
      });

      if (!quotesRes.ok) {
        console.error("Quotes HTTP error:", quotesRes.status);
      } else {
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

        // simpan raw JSON minimal
        quotesJsonRaw = JSON.stringify({
          status: quotesData.status ?? "success",
          updatedAt: quotesData.updatedAt ?? null,
          total: rows.length,
          data: rows,
        });

        // bikin ringkasan manusiawi
        quotesSummary = rows
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
              `saat ini sekitar **${last}**, ` +
              `bergerak ${arah} sekitar ±${change} poin (~${pct}%).`
            );
          })
          .join("\n");
      }
    } catch (err) {
      console.error("Gagal fetch quotes:", err);
    }

    const systemQuotesMessage = {
      role: "system",
      content: quotesJsonRaw
        ? (() => {
            const updateInfo = quotesUpdatedAtLocal
              ? `Data harga terakhir diperbarui sekitar **${quotesUpdatedAtLocal} WIB**.\n\n`
              : "";

            return (
              "Sistem Harga Live (internal Newsmaker):\n\n" +
              updateInfo +
              "RINGKASAN HARGA TERKINI (hanya sebagai REFERENSI INTERNAL, rangkai ulang dengan kata-katamu sendiri jika diperlukan):\n" +
              quotesSummary +
              "\n\n" +
              "PANDUAN CARA MENJAWAB BERDASARKAN DATA INI:\n" +
              "- Gunakan angka dari JSON ini hanya ketika pengguna bertanya soal **harga terkini** atau **pergerakan terbaru**.\n" +
              "- Jangan menjadikan paragraf di atas sebagai jawaban mentah yang di-copy langsung.\n" +
              "- Jika pengguna mengirim GAMBAR/CHART, data harga ini hanya menjadi konteks sekunder; fokus utama tetap analisis chart.\n" +
              "- Jika instrumen yang diminta tidak ada di JSON, jelaskan dengan sopan bahwa datanya tidak tersedia dan beri konteks edukatif.\n\n" +
              "Data mentah (JSON) di bawah ini hanya untuk referensi model, tidak perlu ditampilkan apa adanya kepada pengguna:\n\n" +
              quotesJsonRaw
            );
          })()
        : "Saat ini sistem tidak berhasil mengambil data quotes real-time. " +
          "Jika pengguna bertanya harga terkini, **jangan mengarang angka**. " +
          "Jelaskan bahwa data live sementara tidak tersedia dan berikan penjelasan edukatif secara umum.",
    };

    // 4) KALENDER EKONOMI (FILTER PER TANGGAL)
    const calendarUrl = buildCalendarUrl(CALENDAR_API_URL, targetCalendarDate);

    let calendarJsonRaw = "";
    let calendarSummaryAll = "";
    let calendarSummaryHighImpact = "";

    try {
      const calRes = await fetch(calendarUrl, {
        method: "GET",
        cache: "no-store",
      });

      if (!calRes.ok) {
        console.error("Calendar HTTP error:", calRes.status);
      } else {
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

        calendarJsonRaw = JSON.stringify({
          status: calData.status ?? "success",
          updatedAt: calData.updatedAt ?? null,
          date: targetCalendarDate,
          total: normalizedEvents.length,
          data: normalizedEvents,
        });

        const events = normalizedEvents;

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
          .map((ev) => {
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
              `Data sebelumnya: ${previous}, perkiraan: ${forecast}, aktual: ${actualValue}.`
            );
          })
          .join("\n");

        const highImpact = events.filter(
          (ev) =>
            typeof ev.impact === "string" &&
            (ev.impact.includes("★★★") ||
              ev.impact.toLowerCase().includes("high"))
        );

        if (highImpact.length > 0) {
          calendarSummaryHighImpact = highImpact
            .map((ev) => {
              const { time, currency, impact, event } = ev;
              return `- Pukul ${time}, ${currency} – ${event} (dampak tinggi ${impact}).`;
            })
            .join("\n");
        } else {
          calendarSummaryHighImpact =
            "- Tidak ada event berdampak sangat tinggi (★★★) pada tanggal ini.";
        }
      }
    } catch (err) {
      console.error("Gagal fetch calendar:", err);
    }

    const tanggalLabel =
      targetCalendarDate === todayIso
        ? `hari ini (${targetCalendarDate})`
        : `tanggal ${targetCalendarDate}`;

    const extraCalendarInstruction = wantsHighImpactOnly
      ? "Pengguna SECARA SPESIFIK menanyakan event **dampak tinggi / high impact**. " +
        "Utamakan event ★★★ / high impact, event lain hanya pelengkap bila dibutuhkan.\n"
      : isCalendarOverview
      ? "Pengguna menanyakan kalender ekonomi secara umum. " +
        "Tampilkan SELURUH event tanggal tersebut dalam bentuk bullet.\n"
      : "Jika pengguna bertanya kalender ekonomi untuk event tertentu (NFP, CPI, suku bunga), boleh pilih event relevan saja.\n";

    const systemCalendarMessage = {
      role: "system",
      content: calendarJsonRaw
        ? wantsHighImpactOnly
          ? `Berikut adalah kalender ekonomi yang SUDAH DIFILTER hanya untuk ${tanggalLabel}.\n\n` +
            `EVENT DENGAN DAMPAK TINGGI (Impact '★★★' / 'High'):\n` +
            `${calendarSummaryHighImpact}\n\n` +
            `DAFTAR LENGKAP EVENT (${tanggalLabel}) (pakai hanya jika pengguna minta semua event):\n` +
            `${calendarSummaryAll}\n\n` +
            "CATATAN UNTUK MODEL:\n" +
            extraCalendarInstruction
          : `Berikut adalah kalender ekonomi yang SUDAH DIFILTER hanya untuk ${tanggalLabel}.\n\n` +
            `DAFTAR LENGKAP EVENT (${tanggalLabel}):\n` +
            `${calendarSummaryAll}\n\n` +
            `EVENT DENGAN DAMPAK TINGGI (Impact '★★★' / 'High'):\n` +
            `${calendarSummaryHighImpact}\n\n` +
            "CATATAN UNTUK MODEL:\n" +
            extraCalendarInstruction
        : `Saat ini sistem tidak berhasil mengambil kalender ekonomi untuk ${tanggalLabel}. ` +
          `Jika pengguna bertanya soal jadwal rilis, jelaskan keterbatasan data dan jangan mengarang event/jam rilis.`,
    };

    // 5) HISTORICAL DATA – ANALISIS PERGERAKAN
    let historicalJsonRaw = "";
    let historicalSummary = "";
    let historicalFromLabel = "";
    let historicalInstrumentWindowSummary = ""; // ringkasan X hari sebelumnya untuk instrumen yg diminta

    // coba baca dateFrom dari URL (kalau ada)
    try {
      const url = new URL(HISTORICAL_API_URL);
      const df = url.searchParams.get("dateFrom");
      if (df) historicalFromLabel = df;
    } catch {
      historicalFromLabel = "";
    }

    try {
      const histRes = await fetch(HISTORICAL_API_URL, {
        method: "GET",
        cache: "no-store",
      });

      if (!histRes.ok) {
        console.error("Historical HTTP error:", histRes.status);
      } else {
        const histData: any = await histRes.json();
        const rows: any[] = Array.isArray(histData.data) ? histData.data : [];

        historicalJsonRaw = JSON.stringify({
          status: histData.status ?? "success",
          updatedAt: histData.updatedAt ?? null,
          total: rows.length,
          data: rows,
        });

        // Kelompokkan per simbol
        const bySymbol = new Map<string, any[]>();
        for (const row of rows) {
          const symbol: string =
            row.symbol ||
            row.Symbol ||
            row.ticker ||
            row.Ticker ||
            "UNKNOWN";
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
            arah = "mengalami kenaikan tajam (uptrend kuat) dalam periode tersebut.";
          } else if (pctChange > 3) {
            arah = "cenderung naik (uptrend) dalam periode tersebut.";
          } else if (pctChange < -15) {
            arah = "mengalami penurunan tajam (downtrend kuat) dalam periode tersebut.";
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

              // kalau satu tanggal ada beberapa baris, ambil yang terakhir (overwrite)
              datePriceMap.set(iso, priceNum);
            }

            const labelInfo =
              INSTRUMENT_LABEL[requestedInstrument] ||
              INSTRUMENT_LABEL.other;
            const instrName =
              requestedInstrument === "other"
                ? histSymbol
                : labelInfo.name;
            const unit = labelInfo.unit;

            const maxWindow = Math.min(historicalDaysAgo, 10); // batasi max 10 hari
            const detailLines: string[] = [];

            // contoh: user minta "5 hari sebelumnya" → kasih 5 hari terakhir hingga 1 hari lalu
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
                `Ringkasan harga ${instrName} untuk ${maxWindow} hari terakhir berdasarkan data historis internal:\n` +
                detailLines.join("\n") +
                "\n\n" +
                "Gunakan daftar di atas saat pengguna meminta 'historical data X hari sebelumnya' untuk instrumen ini.";
            }
          }
        }
      }
    } catch (err) {
      console.error("Gagal fetch historical:", err);
    }

    const historicalRangeLabel = historicalFromLabel
      ? `sejak **${historicalFromLabel}** hingga data terbaru yang tersedia`
      : "selama periode data historis yang tersedia";

    // Instruksi ekstra khusus untuk pertanyaan relatif "X hari sebelumnya"
    const extraHistoricalInstruction =
      historicalRelativeDateIso && historicalDaysAgo !== null
        ? "Pengguna menggunakan frasa waktu relatif, misalnya **" +
          historicalDaysAgo +
          " hari sebelumnya** dari hari ini (WIB). " +
          `Anggap tanggal tersebut sebagai kurang-lebih **${historicalRelativeDateIso}**.\n` +
          "- Jika pertanyaan seperti: 'historical data [instrumen] 5 hari sebelumnya', gunakan data historis instrumen tersebut (jika tersedia) untuk merangkum harga per hari.\n" +
          "- Jika data per hari untuk periode tersebut tidak lengkap, jelaskan keterbatasan dan jangan mengarang angka.\n"
        : "Jika pengguna menggunakan frasa 'X hari sebelumnya' atau 'X hari lalu', " +
          "anggap X sebagai jumlah hari mundur dari tanggal hari ini (WIB) dan gunakan JSON historis untuk mendekati tanggal tersebut.\n";

    const systemHistoricalMessage = {
      role: "system",
      content: historicalJsonRaw
        ? "Sistem Data Historis Harga (internal Newsmaker):\n\n" +
          `Ringkasan pergerakan harga ${historicalRangeLabel} (per simbol utama):\n` +
          `${historicalSummary}\n\n` +
          (historicalInstrumentWindowSummary
            ? historicalInstrumentWindowSummary + "\n\n"
            : "") +
          "PANDUAN CARA MENJAWAB BERDASARKAN DATA INI:\n" +
          "- Gunakan saat pengguna bertanya tentang pergerakan dalam beberapa waktu terakhir, trend besar, atau X hari sebelumnya.\n" +
          "- Fokus pada gambaran besar, dan gunakan ringkasan harian (jika ada) untuk menjawab pertanyaan spesifik seperti '5 hari sebelumnya'.\n" +
          "- Jangan mengarang nilai historis yang tidak ada di JSON.\n\n" +
          extraHistoricalInstruction +
          "\n" +
          "Data mentah (JSON) di bawah ini hanya untuk referensi model, tidak perlu ditampilkan langsung ke pengguna:\n\n" +
          historicalJsonRaw
        : "Saat ini sistem tidak berhasil mengambil data historis harga. " +
          "Jika pengguna bertanya tentang pergerakan historis, jawab secara konseptual tanpa menyebut angka spesifik.",
    };

    // 6) INSTRUKSI PENGGUNAAN DATA vs GAMBAR
    const systemDataUsageMessage = {
      role: "system",
      content: hasImage
        ? "PENTING: Pesan terakhir pengguna menyertakan GAMBAR/CHART.\n" +
          "- Prioritaskan analisis VISUAL dari gambar tersebut.\n" +
          "- Jangan membuka jawaban hanya dengan rangkuman data live/historis tanpa menyebut chart.\n" +
          "- Data quotes, kalender, dan historis di atas hanya sebagai konteks tambahan.\n"
        : "PENTING: Pesan terakhir pengguna TIDAK menyertakan gambar.\n" +
          "- Untuk pertanyaan harga terkini, gunakan data quotes.\n" +
          "- Untuk pertanyaan tren beberapa waktu terakhir, gunakan data historis.\n" +
          "- Untuk pertanyaan seperti 'historical data [instrumen] 5 hari sebelumnya', gunakan ringkasan harian instrumen tersebut (jika tersedia).\n",
    };

    // ====== SUSUN USER CONTENT (TEXT + IMAGE JIKA ADA) ======
    const userContent: any[] = [
      {
        type: "input_text",
        text: userPrompt,
      },
    ];

    if (hasImage && base64Image && imageMimeType) {
      userContent.push({
        type: "input_image",
        image_url: `data:${imageMimeType};base64,${base64Image}`,
        detail: "auto",
      });
    }

    // ====== SUSUN messages UNTUK OPENAI RESPONSES ======
    const messagesForModel: any[] = [
      systemPersonaMessage,
      systemTimeMessage,
      systemQuotesMessage,
      systemCalendarMessage,
      systemHistoricalMessage,
      systemDataUsageMessage,
      ...historyMessages,
      {
        role: "user",
        content: userContent,
      },
    ];

    // ====== PANGGIL OPENAI (RESPONSES API) ======
    const aiResponse = await openai.responses.create({
      model: OPENAI_MODEL,
      input: messagesForModel,
      store: false,
    });

    const reply =
      // helper property (convenience)
      // @ts-ignore
      (aiResponse as any).output_text ||
      // fallback ke struktur output standar
      (aiResponse.output &&
        aiResponse.output[0] &&
        aiResponse.output[0].content &&
        // @ts-ignore
        aiResponse.output[0].content[0].text) ||
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
