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

const NEWS_API_URL =
  process.env.NEWS_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/news-id";

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
  gold: ["LGD", "LGD DAILY", "XAUUSD", "XAU", "GOLD", "EMAS"],
  silver: ["LSI", "LSI DAILY", "XAGUSD", "XAG", "SILVER", "PERAK"],
  oil: ["BCO", "BCO DAILY", "OIL", "BRENT"],
  hsi: ["HSI", "HSI DAILY", "HANG SENG"],
  sni: ["SNI", "SNI DAILY", "NIKKEI", "N225", "JAPAN INDEX"],
  usdchf: ["USD/CHF", "USDCHF", "CHF"],
  usdjpy: ["USD/JPY", "USDJPY", "YEN", "JPY"],
  gbpusd: ["GBP/USD", "GBPUSD", "CABLE", "POUND"],
  audusd: ["AUD/USD", "AUDUSD", "AUSSIE"],
  eurusd: ["EUR/USD", "EURUSD", "EURO"],
  other: [],
};

const INSTRUMENT_LABEL: Record<InstrumentKey, { name: string; unit: string }> =
{
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

  if (
    p.includes("emas") ||
    p.includes("gold") ||
    p.includes("xau") ||
    p.includes("lgd")
  ) {
    return "gold";
  }
  if (
    p.includes("perak") ||
    p.includes("silver") ||
    p.includes("xag") ||
    p.includes("lsi")
  ) {
    return "silver";
  }
  if (
    p.includes("oil") ||
    p.includes("minyak") ||
    p.includes("bco") ||
    p.includes("brent")
  ) {
    return "oil";
  }
  if (p.includes("hsi") || p.includes("hang seng")) {
    return "hsi";
  }
  if (
    p.includes("sni") ||
    p.includes("nikkei") ||
    p.includes("n225") ||
    p.includes("jepang")
  ) {
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

  return "other";
};

// Pilih deret historis untuk instrumen tertentu dari bySymbol
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

// Deteksi kategori berita dari prompt
const detectNewsCategoryFromPrompt = (lowerPrompt: string): string | null => {
  // Sesuaikan dengan kategori real di DB
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

// ================ HANDLER POST =======================

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const prompt = (formData.get("prompt") as string) || "";
    const historyRaw = formData.get("history") as string | null;
    const file = formData.get("file") as File | null;

    let base64Image: string | null = null;
    let imageMimeType: string | null = null;
    let uploadedFileText: string | null = null; // <-- untuk TXT/CSV/Excel

    // === Parse history dari frontend ===
    let historyMessages: { role: string; content: any }[] = [];
    if (historyRaw) {
      try {
        const parsed = JSON.parse(historyRaw);
        if (Array.isArray(parsed)) {
          historyMessages = parsed.slice(-10); // ambil max 10 terakhir
        }
      } catch (e) {
        console.error("Gagal parse history:", e);
      }
    }

    const isFirstInteraction = historyMessages.length === 0;

    // === BACA FILE (TANPA SIMPAN KE DISK) ===
    if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const mime = file.type || "";
      const filename = file.name || "";

      // 1) Image -> vision
      if (mime.startsWith("image/")) {
        base64Image = buffer.toString("base64");
        imageMimeType = mime || "image/png";
      }
      // 2) TXT / CSV -> langsung jadi string
      else if (
        mime === "text/plain" ||
        mime === "text/csv" ||
        filename.endsWith(".txt") ||
        filename.endsWith(".csv")
      ) {
        uploadedFileText = buffer.toString("utf-8");
      }
      // 3) Excel (XLS/XLSX) -> pakai xlsx
      else if (
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
      }
      // 4) File lain -> treat sebagai text mentah
      else {
        uploadedFileText = buffer.toString("utf-8");
      }

      // Batasi panjang teks dari file supaya tidak jebol context
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

    // Deteksi instrumen untuk historical
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
        "- Jika model tidak bisa membaca gambar, jujur sampaikan bahwa NM Ai belum bisa menganalisis gambar dan minta pengguna menjelaskan chart dengan kata-kata.\n\n" +
        (isFirstInteraction
          ? "INI INTERAKSI PERTAMA di sesi ini. Kamu boleh menyapa singkat kalau mau, " +
          "tapi setelah itu langsung masuk ke inti jawaban. Di pesan berikutnya, jangan mengulang salam pembuka yang sama.\n"
          : "Dalam sesi ini SUDAH ada riwayat percakapan. JANGAN lagi mengulang salam seperti 'Halo, saya NM Ai.' " +
          "Langsung masuk ke inti jawaban berdasarkan konteks percakapan.\n"),
    };

    // 2) Info waktu
    const systemTimeMessage = {
      role: "system",
      content:
        `Sistem internal: waktu saat ini di zona waktu Asia/Jakarta (WIB) adalah ${nowJakartaStr}. ` +
        `Jika pengguna menanyakan tanggal/jam sekarang, gunakan informasi ini. Di luar itu, jangan sebutkan tanggal/jam secara spontan.`,
    };

    // 3) QUOTES (HARGA LIVE)
    let quotesSummary = "";
    let quotesUpdatedAtLocal = "";

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
      role: "system",
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

        const events = normalizedEvents.slice(0, 40); // batasi 40 event max
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

    const tanggalLabel =
      targetCalendarDate === todayIso
        ? `hari ini (${targetCalendarDate})`
        : `tanggal ${targetCalendarDate}`;

    const extraCalendarInstruction = wantsHighImpactOnly
      ? "Pengguna menanyakan event berdampak tinggi (high impact / ★★★). Utamakan event tersebut.\n"
      : isCalendarOverview
        ? "Pengguna menanyakan kalender ekonomi secara umum. Tampilkan seluruh event tanggal tersebut dalam bentuk bullet.\n"
        : "Jika pengguna bertanya event tertentu (NFP, CPI, suku bunga), fokus ke event tersebut.\n";

    const systemCalendarMessage = {
      role: "system",
      content: calendarHasData
        ? wantsHighImpactOnly
          ? `Kalender ekonomi untuk ${tanggalLabel}:\n\n` +
          `Event berdampak tinggi:\n${calendarSummaryHighImpact}\n\n` +
          `Daftar lengkap event (${tanggalLabel}) (gunakan jika perlu):\n${calendarSummaryAll}\n\n` +
          "Catatan untuk model:\n" +
          extraCalendarInstruction
          : `Kalender ekonomi untuk ${tanggalLabel}:\n\n` +
          `Daftar lengkap event (${tanggalLabel}):\n${calendarSummaryAll}\n\n` +
          `Ringkasan event berdampak tinggi:\n${calendarSummaryHighImpact}\n\n` +
          "Catatan untuk model:\n" +
          extraCalendarInstruction
        : `Sistem tidak berhasil mengambil kalender ekonomi untuk ${tanggalLabel}. Jika pengguna bertanya jadwal rilis, jelaskan keterbatasan data dan jangan mengarang event/jam rilis.`,
    };

    // 5) HISTORICAL DATA – ANALISIS PERGERAKAN
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
          ? histData.data.slice(0, 2000) // batasi row supaya nggak kebanyakan
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

        // Ringkasan X hari sebelumnya untuk instrumen diminta
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
        " hari sebelumnya** dari hari ini (WIB). " +
        `Anggap tanggal tersebut sebagai kurang-lebih **${historicalRelativeDateIso}**.\n` +
        "- Jika pertanyaan seperti: 'historical data [instrumen] 5 hari sebelumnya', gunakan data historis instrumen tersebut (jika tersedia) untuk merangkum harga per hari.\n" +
        "- Jika data per hari untuk periode tersebut tidak lengkap, jelaskan keterbatasan dan jangan mengarang angka.\n"
        : "Jika pengguna menggunakan frasa 'X hari sebelumnya' atau 'X hari lalu', anggap X sebagai jumlah hari mundur dari tanggal hari ini (WIB) dan gunakan data historis untuk mendekati tanggal tersebut.\n";

    const systemHistoricalMessage = {
      role: "system",
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

    // 6) NEWS (BERITA PASAR TERBARU) – FILTER CATEGORY + 5 TERBARU
    let newsSummaryAll = "";
    let newsSummaryToday = "";

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

          // fallback kalau tidak ada data
          if (filtered.length === 0) {
            filtered = rows;
          }
        }

        const sorted = [...filtered].sort((a, b) => {
          const da = a.published_at || a.createdAt || a.date;
          const db = b.published_at || b.createdAt || b.date;
          const ta = da ? new Date(da).getTime() : 0;
          const tb = db ? new Date(db).getTime() : 0;
          return tb - ta; // terbaru duluan
        });

        const latest = sorted.slice(0, 5); // AMBIL 5 TERBARU

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
          let tanggalIso = "";

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
              tanggalIso = formatDateIso(dtJakarta);
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
            `- ${jamLabel}: **${title}** (${catLabel}${langLabel ? `, ${langLabel}` : ""
            }${penulisLabel}).` +
            (ringkas ? ` Ringkasan singkat: ${ringkas}` : "") +
            (link ? ` Sumber: ${link}` : "");

          allLines.push(baseLine);

          if (tanggalIso === todayIso) {
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
      role: "system",
      content: newsSummaryAll
        ? (() => {
          let txt =
            "Sistem Berita Pasar (internal Newsmaker.id – endpoint `/api/news-id`):\n\n" +
            "Ringkasan beberapa berita/analisis TERBARU (maksimal 5 artikel):\n" +
            newsSummaryAll +
            "\n\n";

          if (newsSummaryToday) {
            txt +=
              "Highlight berita yang TERBIT HARI INI (WIB):\n" +
              newsSummaryToday +
              "\n\n";
          }

          txt +=
            "Panduan menjawab ketika pengguna bertanya soal BERITA:\n" +
            "- Jika pengguna bertanya 'berita terbaru tentang apa', pilih 3–5 judul paling relevan dan jelaskan isinya dengan bahasamu sendiri.\n" +
            "- Jika menyebut instrumen tertentu (emas, minyak, dolar, Nikkei, kripto), prioritaskan berita yang terkait.\n" +
            "- Jangan menyalin bullet di atas mentah-mentah sebagai jawaban final.\n";

          if (isNewsQuery) {
            txt +=
              "\nPesan terakhir pengguna tampaknya menanyakan berita terbaru. Fokuskan jawaban pada 1–3 berita utama yang paling relevan.\n";
          }

          return txt;
        })()
        : "Sistem berita pasar Newsmaker.id saat ini tidak berhasil mengambil data. Jika pengguna bertanya 'berita terbaru', jelaskan bahwa data berita internal sedang tidak dapat diakses dan berikan konteks pasar umum.",
    };

    // 7) INSTRUKSI PENGGUNAAN DATA vs GAMBAR
    const systemDataUsageMessage = {
      role: "system",
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

    // ====== SUSUN USER CONTENT (TEXT + IMAGE + FILE-TEXT JIKA ADA) ======

    const fileContextText = uploadedFileText
      ? `\n\n=== DATA DARI FILE TERLAMPIR ===\n` +
      `Format bisa berupa teks/CSV/Excel yang sudah diringkas ke tabel.\n\n` +
      uploadedFileText
      : "";

    const userContent: any[] = [
      {
        type: "input_text",
        text: userPrompt + fileContextText,
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
      systemNewsMessage,
      systemDataUsageMessage,
      ...historyMessages,
      {
        role: "user",
        content: userContent,
      },
    ];

    // ====== PANGGIL OPENAI (RESPONSES API) ======
    const aiResponse: any = await openai.responses.create({
      model: OPENAI_MODEL,
      input: messagesForModel,
      store: false,
    });

    // Responses API biasanya sudah sediakan helper output_text
    const reply: string =
      aiResponse.output_text ??
      aiResponse.output?.[0]?.message?.content?.[0]?.text ??
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
