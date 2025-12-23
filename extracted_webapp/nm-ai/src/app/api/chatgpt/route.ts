// src/app/api/nm-ai/route.ts

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

import {
  formatDateIso,
  detectRequestedDate,
  buildCalendarUrl,
} from "./utils/dateUtils";

import {
  InstrumentKey,
  INSTRUMENT_LABEL,
  FIXED_USD_IDR_RATE,
  detectInstrumentFromPrompt,
  detectInstrumentsFromPromptMulti,
  pickHistoricalSeriesForInstrument,
  pickQuoteForInstrument,
} from "./utils/instrumentUtils";

// =============== OPENAI / CHATGPT CONFIG ==================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

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

// ======================================================
// ================ HANDLER POST ========================
// ======================================================

export async function POST(req: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY belum di-set di environment");
      return NextResponse.json(
        { error: "Server config error: OPENAI_API_KEY is missing" },
        { status: 500 }
      );
    }

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
          historyMessages = parsed.slice(-10);
        }
      } catch (e) {
        console.error("Gagal parse history:", e);
      }
    }

    const isFirstInteraction = historyMessages.length === 0;

    if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      base64Image = buffer.toString("base64");
    }

    const hasImage = !!base64Image;

    const userPrompt =
      prompt.trim() ||
      (hasImage
        ? "Tolong analisis gambar atau chart yang saya kirim secara edukatif."
        : "Tolong berikan wawasan edukatif seputar pasar.");

    const lowerPrompt = userPrompt.toLowerCase();
    // ======================================================
    // 🔥 SHORT-CIRCUIT 1: TRADING RULES (INDEX/COMMODITY/CURRENCY)
    // ======================================================
    const isTradingRulesQuestion =
      lowerPrompt.includes("trading rules") ||
      lowerPrompt.includes("trading rule") ||
      lowerPrompt.includes("aturan trading") ||
      lowerPrompt.includes("regulasi trading") ||
      lowerPrompt.includes("rule trading");

    const isTradingRulesTableQuestion =
      isTradingRulesQuestion &&
      (lowerPrompt.includes("tabel") || lowerPrompt.includes("table"));

    // ======================================================
    // 🔥 SHORT-CIRCUIT 1: TRADING RULES (NARASI vs TABEL)
    // ======================================================
    if (isTradingRulesTableQuestion) {
      // 👉 Mode KHUSUS: kalau user minta "tabel trading rules"
      // hanya tampilkan tabel trading rules, terpisah per kelompok produk.

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
        "Tabel berikut merangkum spesifikasi utama (trade code, margin, jam transaksi, biaya, dan ketentuan harga) per kelompok produk.\n\n" +
        "---\n\n" +
        "### 1️⃣ Index & Global Index\n\n" +
        indexTableMd +
        "\n---\n\n" +
        "### 2️⃣ Commodity (Gold, Silver, Oil, dll.)\n\n" +
        commodityTableMd +
        "\n---\n\n" +
        "### 3️⃣ Currency (Forex Pairs)\n\n" +
        currencyTableMd +
        "\n---\n\n" +
        "_**Catatan**: Trading rules di atas adalah ketentuan produk. " +
        "Manajemen risiko & gaya trading tetap disesuaikan dengan profil risiko masing-masing trader._";

      return NextResponse.json(
        { reply: tablesSection, imagePath: null },
        { status: 200 }
      );
    }

    if (isTradingRulesQuestion) {
      // 👉 Mode umum: user cuma nanya "trading rules", jawab dengan narasi edukatif saja (tanpa tabel)

      const replyStandard = [
        "Berikut ringkasan 📘 **Trading Rules NM Standard** yang menjadi acuan utama dalam sistem edukasi NM Ai:\n\n",
        "---",
        "# 🧭 Dasar Regulasi",
        "",
        "Berdasarkan:",
        "- Peraturan **BAPPEBTI No. 6 Tahun 2023**",
        "- Peraturan Kepala **Bappebti No. 5 Tahun 2017**",
        "",
        "### 📂 **Status:** _Official Knowledge Reference_ — versi netral (tanpa identitas perusahaan)",
        "",
        "---",
        "",
        "# ⚖️ **Pokok Aturan SPA (Sistem Perdagangan Alternatif)**",
        "",
        "**Definisi SPA**  ",
        "Transaksi derivatif di luar Bursa Berjangka yang dilakukan secara bilateral, dengan margin dan kliring di Lembaga Kliring Berjangka.",
        "",
        "**Jenis Kontrak**",
        "- **Rolling Contract:** diperpanjang otomatis setiap hari.",
        "- **Day Trading:** posisi dibuka dan ditutup di hari yang sama.",
        "- **Overnight Trading:** posisi ditahan ke hari berikutnya → kena biaya **storage/rollover + PPN 11%**.",
        "",
        "**Margin dan Ketahanan Dana**",
        "- **Deposit Margin:** minimal **USD 10.000**.",
        "- **Initial Margin:** jaminan awal sesuai produk.",
        "- **Maintenance Margin:** **70%** dari Initial Margin.",
        "- **Margin Call:** ketika dana **< 70%** dari Initial Margin.",
        "- **Auto Liquidation:** saat dana **≤ 30%** dari Initial Margin.",
        "",
        "---",
        "",
        "# 📌 **Order dan Eksekusi**",
        "",
        "- **Market Order (MO):** harga terbaik tersedia, eksekusi ± ≤ 1 detik (dalam kondisi normal).",
        "- **Limit Order (LO):** harga lebih baik dari pasar, valid **Good Till Canceled (GTC)**.",
        "- **Stop Order (SO):** untuk membatasi kerugian atau ambil posisi baru di level tertentu.",
        "- **OCO (One Cancels the Other):** kombinasi Limit & Stop — jika salah satu tereksekusi, yang lain batal otomatis.",
        "",
        "---",
        "",
        "# 📑 **Pelaporan & Kliring**",
        "",
        "- Semua transaksi **done** dilaporkan ke:",
        "  - **Bursa Berjangka Jakarta (JFX)** dan",
        "  - **Kliring Berjangka Indonesia (KBI)**",
        "- Pelaporan dilakukan secara elektronik sesuai ketentuan Bappebti.",
        "",
        "---",
        "",
        "# 👤 **Manajemen Rekening**",
        "",
        "- **Previous Balance / New Balance:** saldo sebelum & sesudah transaksi.",
        "- **Equity** = New Balance ± Floating P/L",
        "- **Equity Ratio** = (Equity / Margin) × 100%",
        "",
        "Equity Ratio digunakan untuk mengukur **ketahanan posisi** dan potensi trigger margin call.",
        "",
        "---",
        "",
        "# 📐 **Formula P/L (Profit/Loss)**",
        "",
        "`P/L = [(Selling Price - Buying Price) × Contract Size × Lot] - [(Facility Fee + VAT) × Lot]`",
        "",
        "Catatan:",
        "- Facility Fee = biaya transaksi (per lot per side).",
        "- VAT = PPN 11% dari facility fee (sesuai regulasi yang berlaku).",
        "",
        "---",
        "",
        "# 🔐 **Kerahasiaan & Keamanan**",
        "",
        "- **User ID, Password, OTP** bersifat pribadi.",
        "- Nasabah wajib menjaga kerahasiaan akses sistem.",
        "- Pihak resmi **tidak akan meminta password/OTP** lewat chat, telepon, atau email non-resmi.",
        "",
        "---",
        "",
        "# 🔄 **Perubahan Aturan**",
        "",
        "Trading rules dapat disesuaikan sewaktu-waktu mengikuti dinamika industri PBK dan perubahan regulasi, dengan pemberitahuan resmi sesuai ketentuan yang berlaku.",
        "",
        "---",
        "",
        "# 📊 **Keterkaitan Modul Edukasi NM Ai**",
        "",
        "- **Risk Planner & RSP Module**",
        "  - Menghitung margin, equity ratio, dan risiko margin call.",
        "- **User Protection Module**",
        "  - Menjelaskan legalitas, perlindungan nasabah, dan kerangka regulasi Bappebti.",
        "",
        "---",
        "",
        "# 💬 **Insight Edukatif NM Ai**",
        "",
        "> “Memahami trading rules bukan sekadar syarat teknis,  ",
        "> tapi fondasi untuk melindungi diri dari risiko dan salah persepsi pasar.”",
        "",
        "---",
        "",
        "_Disusun oleh **NM23 Ai Editorial System** — Powered by **Newsmaker.id**_  ",
        "⚠️ Informasi ini bersifat **edukatif**, bukan saran investasi atau ajakan untuk bertransaksi.",
      ].join("\n");

      return NextResponse.json(
        { reply: replyStandard, imagePath: null },
        { status: 200 }
      );
    }

    // ================== PREP: INSTRUMEN & TANGGAL ==================

    const requestedInstrument: InstrumentKey =
      detectInstrumentFromPrompt(userPrompt);

    const isNewsQuery =
      lowerPrompt.includes("berita terbaru") ||
      lowerPrompt.includes("news terbaru") ||
      lowerPrompt.includes("headline") ||
      lowerPrompt.includes("berita hari ini") ||
      (lowerPrompt.includes("berita") &&
        (lowerPrompt.includes("update") ||
          lowerPrompt.includes("pasar") ||
          lowerPrompt.includes("market")));

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

    const wantsMediumImpactOnly =
      lowerPrompt.includes("medium impact") ||
      lowerPrompt.includes("medium-impact") ||
      lowerPrompt.includes("mediumimpact") ||
      lowerPrompt.includes("dampak sedang") ||
      lowerPrompt.includes("impact sedang") ||
      lowerPrompt.includes("★★");

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

    // ======================================================
    // 1) SYSTEM PERSONA & TIME
    // ======================================================

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

    const systemTimeMessage = {
      role: "system" as const,
      content:
        `Sistem internal: waktu saat ini di zona waktu Asia/Jakarta (WIB) adalah ${nowJakartaStr}. ` +
        `Jika pengguna menanyakan tanggal/jam sekarang, gunakan waktu ini. Selain itu, jangan sebut tanggal/jam spontan tanpa diminta.`,
    };

    const systemNoUpdateBlockMessage = {
      role: "system" as const,
      content:
        "ATURAN KHUSUS TENTANG BLOK UPDATE:\n" +
        "- Jangan buka jawaban dengan judul seperti 'Update terbaru:' atau blok waktu+kalender otomatis.\n" +
        "- Jika pengguna minta 'update pasar' atau 'kalender ekonomi', jawab secukupnya tanpa heading 'Update terbaru:'.\n",
    };

    const systemFxRuleMessage = {
      role: "system" as const,
      content:
        "ATURAN KONVERSI KURS (FIXED RATE SIMULASI):\n" +
        `- Untuk contoh perhitungan dalam Rupiah, gunakan asumsi **1 USD = Rp ${FIXED_USD_IDR_RATE.toLocaleString(
          "id-ID"
        )}** kecuali pengguna memberi kurs lain.\n` +
        "- Jelaskan bahwa kurs ini hanya asumsi tetap (fixed rate), bukan kurs real-time.\n" +
        "- Untuk XAUUSD, kamu boleh gunakan asumsi ukuran kontrak 1000 oz per lot dan margin = nilai kontrak / leverage sebagai contoh edukatif.\n",
    };

    // ======================================================
    // 2) FETCH DATA (QUOTES, CALENDAR, HISTORICAL, NEWS)
    // ======================================================

    let quotesSummary = "";
    let quotesUpdatedAtLocal = "";
    let quotesRows: any[] = [];

    let calendarSummaryAll = "";
    let calendarSummaryHighImpact = "";
    let calendarHasData = false;
    let calendarTableAll = "";
    let calendarTableHighImpact = "";

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

    // ---------------- QUOTES ----------------
    if (quotesResult.status === "fulfilled") {
      const quotesRes = quotesResult.value;
      if (quotesRes.ok) {
        try {
          const quotesData: any = await quotesRes.json();
          const rows: any[] = Array.isArray(quotesData.data)
            ? quotesData.data
            : [];

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
              "- Jika menyebut HARGA TERKINI, gunakan angka last apa adanya, boleh ditambah kata 'sekitar', tapi JANGAN mengubahnya jadi rentang baru jika tidak ada di data.\n" +
              "- Jangan mengarang rentang harga atau level spesifik yang tidak muncul di data internal.\n"
            );
          })()
        : "Sistem harga live tidak berhasil mengambil data. Jika pengguna bertanya harga terkini, jangan mengarang angka; jelaskan bahwa data live sementara tidak tersedia.",
    };

    // ---------------- CALENDAR ----------------
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

          const normalizedEvents: CalendarEventRow[] = filteredEvents
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
            .map((ev: CalendarEventRow) => {
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
                `- Tanggal **${time}, ${currency}** - **${event}**. ` +
                `Dampak **${impactLabel} (${impact})**. ` +
                `Sebelumnya: ${previous}, perkiraan: ${forecast}, aktual: ${actualValue}.`
              );
            })
            .join("\n");

          const highImpact = events.filter(
            (ev: CalendarEventRow) =>
              typeof ev.impact === "string" &&
              (ev.impact.includes("★★★") ||
                ev.impact.toLowerCase().includes("high"))
          );

          calendarSummaryHighImpact =
            highImpact.length > 0
              ? highImpact
                  .map((ev: CalendarEventRow) => {
                    const { time, currency, impact, event } = ev;
                    return `- ${time}, ${currency} – ${event} **(dampak ${impact})**.`;
                  })
                  .join("\n")
              : "- Tidak ada event berdampak sangat tinggi (★★★) pada tanggal ini.";

          calendarTableAll = buildCalendarTable(events, {
            emptyMessage:
              "- Tidak ada event terdaftar pada tanggal ini di sistem Newsmaker.",
          });

          calendarTableHighImpact = buildCalendarTable(highImpact, {
            emptyMessage:
              "- Tidak ada event berdampak sangat tinggi (★★★) pada tanggal ini.",
          });
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
      ? "Pengguna menanyakan kalender ekonomi secara umum. Tampilkan seluruh event tanggal tersebut dalam bentuk tabel dan penjelasan singkat jika perlu.\n"
      : "Jika pengguna bertanya event tertentu, fokus ke event tersebut dan jelaskan dampaknya.\n";

    const systemCalendarMessage = {
      role: "system" as const,
      content: calendarHasData
        ? (() => {
            const baseHeader = `Kalender ekonomi internal untuk ${calendarHumanLabel}:\n\n`;

            const noteRel =
              `Catatan: hari ini adalah ${todayIso}. ` +
              `Tanggal yang dibahas adalah ${targetCalendarDate}. ` +
              `Gunakan frasa **${calendarHumanLabel}** saat menyebut tanggal ini.\n\n`;

            return (
              baseHeader +
              noteRel +
              "Daftar event utama (boleh diringkas dalam bentuk narasi, atau jika diminta khusus jadikan tabel):\n" +
              calendarSummaryAll +
              "\n\nRingkasan event berdampak tinggi:\n" +
              calendarSummaryHighImpact +
              "\n\n" +
              extraCalendarInstruction
            );
          })()
        : `Kalender ekonomi internal untuk ${calendarHumanLabel} tidak berhasil diambil. ` +
          "Jika pengguna bertanya jadwal rilis, jelaskan keterbatasan data dan jangan mengarang jam/event.",
    };

    // ---------------- HISTORICAL ----------------
    try {
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
            const bySym = new Map<string, any[]>();
            for (const row of rows) {
              const symbol: string =
                row.symbol ||
                row.Symbol ||
                row.ticker ||
                row.Ticker ||
                "UNKNOWN";
              if (!bySym.has(symbol)) bySym.set(symbol, []);
              bySym.get(symbol)!.push(row);
            }

            const series = pickHistoricalSeriesForInstrument(
              bySym,
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
          "- Anggap data historis ini sebagai data internal sistem.\n" +
          "- Jangan berkata seolah-olah ini dataset yang dikirim pengguna.\n" +
          "- Jangan mengarang angka historis yang tidak ada di data.\n\n" +
          extraHistoricalInstruction
        : "Sistem data historis saat ini tidak berhasil mengambil data. Jika pengguna bertanya tentang pergerakan historis, jawab secara konseptual tanpa menyebut angka spesifik.",
    };

    // ---------------- NEWS ----------------
    if (newsResult.status === "fulfilled") {
      const newsRes = newsResult.value;
      if (newsRes.ok) {
        try {
          const newsData: any = await newsRes.json();
          const rows: any[] = Array.isArray(newsData.data) ? newsData.data : [];

          if (rows.length > 0) {
            const sorted = [...rows].sort((a, b) => {
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

    const systemDataUsageMessage = {
      role: "system" as const,
      content: hasImage
        ? "Pesan terakhir pengguna menyertakan GAMBAR/CHART.\n" +
          "- Prioritaskan analisis visual: tren, pola, area penting.\n" +
          "- Baru hubungkan ke data harga live/fundamental jika relevan.\n"
        : "Pesan terakhir pengguna TIDAK menyertakan gambar.\n" +
          "- Untuk pertanyaan harga, gunakan data quotes.\n" +
          "- Untuk tren beberapa waktu terakhir, gunakan data historis.\n",
    };

    // ======================================================
    // 🔥 SHORT-CIRCUIT 2: FIBONACCI (UP/DOWN)
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
          `\`${fmtFib(D)}\`\n---\n\n`;

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
    // 🔥 SHORT-CIRCUIT 3: PIVOT (CLASSIC / WOODIE / CAMARILLA)
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
          "|-------|--------|--------|--------|\n" +
          `| R4 | ${fmt(classicPivot.R4)} | ${fmt(woodiePivot.R4)} | ${fmt(
            camarillaPivot.R4
          )} |\n` +
          `| **R3** | ${fmt(classicPivot.R3)} | ${fmt(woodiePivot.R3)} | ${fmt(
            camarillaPivot.R3
          )} |\n` +
          `| **R2** | ${fmt(classicPivot.R2)} | ${fmt(woodiePivot.R2)} | ${fmt(
            camarillaPivot.R2
          )} |\n` +
          `| **R1** | ${fmt(classicPivot.R1)} | ${fmt(woodiePivot.R1)} | ${fmt(
            camarillaPivot.R1
          )} |\n` +
          `| **Pivot**  | ${fmt(classicPivot.P)} | ${fmt(
            woodiePivot.P
          )} | ${fmt(camarillaPivot.P)} |\n` +
          `| **S1** | ${fmt(classicPivot.S1)} | ${fmt(woodiePivot.S1)} | ${fmt(
            camarillaPivot.S1
          )} |\n` +
          `| **S2** | ${fmt(classicPivot.S2)} | ${fmt(woodiePivot.S2)} | ${fmt(
            camarillaPivot.S2
          )} |\n` +
          `| **S3** | ${fmt(classicPivot.S3)} | ${fmt(woodiePivot.S3)} | ${fmt(
            camarillaPivot.S3
          )} |\n` +
          `| S4 | ${fmt(classicPivot.S4)} | ${fmt(woodiePivot.S4)} | ${fmt(
            camarillaPivot.S4
          )} |\n\n`;

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

    // ======================================================
    // 🔥 SHORT-CIRCUIT 4: MARGIN XAUUSD
    // ======================================================
    const isMarginQuestion =
      lowerPrompt.includes("margin") &&
      (lowerPrompt.includes("xauusd") ||
        lowerPrompt.includes(" emas") ||
        lowerPrompt.includes(" gold"));

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
        if (isFinite(lastNum) && lastNum > 0) {
          price = lastNum;
        }
      }

      if (!isFinite(price) || price <= 0 || leverage <= 0) {
        // kalau datanya gak cukup, lanjut ke ChatGPT biasa
      } else {
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
          `= ${fmtPrice} × ${contractSize.toLocaleString("id-ID")} × ${lot}\n` +
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

    // ======================================================
    // 🔥 SHORT-CIRCUIT 5: HARGA LANGSUNG (PRICE/QUOTE)
    // ======================================================
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

        const symbol: string = quoteRow.symbol || quoteRow.Symbol || "UNKNOWN";
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
          isFinite(pctNum) && pctNum !== 0 ? ` (~${pctNum.toFixed(2)}%)` : "";

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
          `Harga terkini berdasarkan data internal Newsmaker${updatedInfo}:\n     ` +
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

    // ======================================================
    // 🔥 SHORT-CIRCUIT 6: KALENDER (OUTPUT TABEL)
    // ======================================================
    if (isCalendarOverview) {
      if (calendarHasData) {
        const headerCal = `Kalender ekonomi ${calendarHumanLabel} di sistem Newsmaker:\n\n`;

        const bodyCal = wantsHighImpactOnly
          ? calendarTableHighImpact ||
            "- Tidak ada event berdampak sangat tinggi (★★★) pada tanggal ini."
          : calendarTableAll ||
            "- Tidak ada event terdaftar pada tanggal ini di sistem Newsmaker.";

        const noteCal = wantsHighImpactOnly
          ? `\n\n---\n` +
            `**Catatan**:\n` +
            `- Informasi pada Kalender Ekonomi bersifat sebagai rujukan analisis. Dampak pergerakan pasar dapat berbeda pada setiap kondisi. Selalu sesuaikan keputusan trading dengan rencana dan profil risiko masing-masing.\n` +
            `- Fokus di atas hanya event berdampak tinggi. Jika ingin melihat semua event, tulis saja: kalender ekonomi ${calendarHumanLabel} lengkap.`
          : `\n\n---\n` +
            `**Catatan**:\n` +
            `- Informasi pada Kalender Ekonomi bersifat sebagai rujukan analisis. Dampak pergerakan pasar dapat berbeda pada setiap kondisi. Selalu sesuaikan keputusan trading dengan rencana dan profil risiko masing-masing.`;

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

    // ======================================================
    // 3) SUSUN MESSAGES UNTUK CHATGPT
    // ======================================================

    const ollamaMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
      images?: string[];
    }> = [];

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

    for (const sm of systemMessages) {
      ollamaMessages.push({
        role: "system",
        content: sm.content,
      });
    }

    for (const hm of historyMessages) {
      const role =
        hm.role === "ai" || hm.role === "assistant" ? "assistant" : "user";
      ollamaMessages.push({
        role,
        content: toText(hm.content),
      });
    }

    const userMsg: {
      role: "user";
      content: string;
      images?: string[];
    } = {
      role: "user",
      content: userPrompt,
    };

    if (hasImage && base64Image) {
      userMsg.images = [base64Image];
    }

    ollamaMessages.push(userMsg);

    // Konversi ke format ChatGPT (OpenAI) – support teks + gambar (image_url)
    const openaiMessages = ollamaMessages.map((msg) => {
      if (msg.role === "user" && msg.images && msg.images.length > 0) {
        const parts: any[] = [
          { type: "text", text: msg.content },
          ...msg.images.map((img) => ({
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${img}`,
            },
          })),
        ];
        return {
          role: "user",
          content: parts,
        };
      }

      return {
        role: msg.role,
        content: msg.content,
      };
    });

    // ======================================================
    // 4) CALL CHATGPT (OPENAI) GANTI OLLAMA
    // ======================================================

    const openaiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: openaiMessages,
        }),
      }
    );

    if (!openaiRes.ok) {
      const errText = await openaiRes.text().catch(() => "");
      console.error("OpenAI HTTP error:", openaiRes.status, errText);
      return NextResponse.json(
        {
          error: "OpenAI error",
          detail: `Status ${openaiRes.status}: ${errText}`,
        },
        { status: 500 }
      );
    }

    const openaiJson: any = await openaiRes.json();
    const reply: string =
      openaiJson?.choices?.[0]?.message?.content?.toString() ||
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
