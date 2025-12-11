// src/app/api/nm-ai/route.ts

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// =============== TRADING RULES CONFIG IMPORTS ==================
import { INDEX_MARGIN_CONFIG } from "./config/indexMarginConfig";
import { COMMODITY_MARGIN_CONFIG } from "./config/commodityMarginConfig";
import { CURRENCY_MARGIN_CONFIG } from "./config/currencyMarginConfig";

// =============== TRADING RULES UTILS (TABLE BUILDER) ============
import {
  buildTradingRulesTableThreeCols,
  GenericMarginConfig,
} from "./utils/tradingRules";

// =============== KALENDER TABLE UTILS ==================
import { buildCalendarTable, CalendarEventRow } from "./utils/calendarContext";

// =============== COMMON & UTILS BARU ==================
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
  pickQuoteForInstrument,
} from "./utils/instrumentUtils";

// ================== DATA SOURCE URL ==================
const QUOTES_API_URL =
  process.env.QUOTES_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/quotes";

const CALENDAR_API_URL =
  process.env.CALENDAR_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/calendar/today";

// ======================================================
// ================ HANDLER POST ========================
// ======================================================

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const rawPrompt = (formData.get("prompt") as string) || "";
    const userPrompt = rawPrompt.trim();
    const lowerPrompt = userPrompt.toLowerCase();

    if (!userPrompt) {
      return NextResponse.json(
        {
          reply:
            "Halo, ini endpoint *NM Base Rules*.\n\n" +
            "Silakan tanya hal-hal seperti:\n" +
            "- Trading rules\n" +
            "- Pivot (Classic/Woodie/Camarilla)\n" +
            "- Fibonacci (uptrend/downtrend)\n" +
            "- Simulasi margin XAUUSD\n" +
            "- Harga emas/perak/oil/indeks/forex sekarang\n" +
            "- Kalender ekonomi hari ini",
          imagePath: null,
        },
        { status: 200 }
      );
    }

    // ======================================================
    // 0) DETEKSI TOPIK DASAR
    // ======================================================

    // Trading Rules
    const isTradingRulesQuestion =
      lowerPrompt.includes("trading rules") ||
      lowerPrompt.includes("trading rule") ||
      lowerPrompt.includes("aturan trading") ||
      lowerPrompt.includes("regulasi trading") ||
      lowerPrompt.includes("rule trading");

    const isTradingRulesTableQuestion =
      isTradingRulesQuestion &&
      (lowerPrompt.includes("tabel") || lowerPrompt.includes("table"));

    // Fibonacci
    const isFibQuestion =
      lowerPrompt.includes("fibo") || lowerPrompt.includes("fibonacci");

    // Pivot
    const isPivotQuestion =
      lowerPrompt.includes("pivot") || lowerPrompt.includes("pp ");

    // Kalender
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

    // Margin XAUUSD
    const isMarginQuestion =
      lowerPrompt.includes("margin") &&
      (lowerPrompt.includes("xauusd") ||
        lowerPrompt.includes(" emas") ||
        lowerPrompt.includes(" gold"));

    // Harga (price/quote)
    const isPriceQuestionBase =
      !lowerPrompt.includes("margin") &&
      !lowerPrompt.includes("leverage") &&
      !lowerPrompt.includes(" lot") &&
      (lowerPrompt.includes("berapa harga") ||
        lowerPrompt.includes("harga berapa") ||
        lowerPrompt.startsWith("harga ") ||
        lowerPrompt.includes("harga emas sekarang") ||
        lowerPrompt.includes("harga xauusd sekarang") ||
        lowerPrompt.includes("price ") ||
        lowerPrompt.includes("quote "));

    const requestedInstrument: InstrumentKey =
      detectInstrumentFromPrompt(userPrompt);

    const requestedInstrumentsMulti =
      detectInstrumentsFromPromptMulti(userPrompt);

    // ======================================================
    // 🔥 SHORT-CIRCUIT 1: TRADING RULES (TABEL)
    // ======================================================
    if (isTradingRulesTableQuestion) {
      const indexTableMd = buildTradingRulesTableThreeCols(
        "Index & Global Index",
        INDEX_MARGIN_CONFIG as GenericMarginConfig
      );

      const commodityTableMd = buildTradingRulesTableThreeCols(
        "Commodity (Gold, Silver, Oil, dll.)",
        COMMODITY_MARGIN_CONFIG as GenericMarginConfig
      );

      const currencyTableMd = buildTradingRulesTableThreeCols(
        "Currency (Forex Pairs)",
        CURRENCY_MARGIN_CONFIG as GenericMarginConfig
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

    // ======================================================
    // 🔥 SHORT-CIRCUIT 2: TRADING RULES (NARASI)
    // ======================================================
    if (isTradingRulesQuestion) {
      const replyStandard = [
        "Berikut ringkasan 📘 **Trading Rules NM Standard** yang menjadi acuan utama dalam sistem edukasi NM Base Rules:\n\n",
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
        "_**Catatan**_:",
        "- **Facility Fee** = biaya transaksi (per lot per side).",
        "- **VAT** = PPN 11% dari facility fee (sesuai regulasi yang berlaku).",
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
        "_Disusun oleh **NM23 Base Rules System** — Powered by **Newsmaker.id**_  ",
        "⚠️ Informasi ini bersifat **edukatif**, bukan saran investasi atau ajakan untuk bertransaksi.",
      ].join("\n");

      return NextResponse.json(
        { reply: replyStandard, imagePath: null },
        { status: 200 }
      );
    }

    // ======================================================
    // 🔥 SHORT-CIRCUIT 3: FIBONACCI (UP/DOWN)
    // ======================================================
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

        const footerFib = "\n\n---\n_- Newsmaker23 Base Rules -_";

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
    // 🔥 SHORT-CIRCUIT 4: PIVOT (CLASSIC / WOODIE / CAMARILLA)
    // ======================================================
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
    // 1) PERSIAPAN DATA UNTUK MARGIN / HARGA / KALENDER
    // ======================================================

    // Waktu Jakarta + tanggal target kalender
    const nowJakarta = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
    );
    const todayIso = formatDateIso(nowJakarta);

    const targetCalendarDate = detectRequestedDate(userPrompt) || todayIso;

    // Label human untuk tanggal kalender
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
      }
    } catch {
      calendarHumanLabel = `tanggal ${targetCalendarDate}`;
    }

    // Hanya fetch data kalau memang relevan
    const needsQuotes = isMarginQuestion || isPriceQuestionBase;
    const needsCalendar = isCalendarOverview;

    let quotesRows: any[] = [];
    let quotesUpdatedAtLocal = "";

    let calendarHasData = false;
    let calendarTableAll = "";
    let calendarTableHighImpact = "";

    const fetchPromises: Promise<any>[] = [];

    if (needsQuotes) {
      fetchPromises.push(
        fetch(QUOTES_API_URL, { method: "GET", cache: "no-store" }).then(
          async (res) => {
            if (!res.ok) throw new Error(`Quotes HTTP ${res.status}`);
            const data = await res.json();
            const rows: any[] = Array.isArray(data.data) ? data.data : [];
            quotesRows = rows.slice(0, 50);

            if (data.updatedAt) {
              const updatedRaw = new Date(data.updatedAt);
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
          }
        )
      );
    }

    if (needsCalendar) {
      const calendarUrl = buildCalendarUrl(
        CALENDAR_API_URL,
        targetCalendarDate
      );
      fetchPromises.push(
        fetch(calendarUrl, { method: "GET", cache: "no-store" }).then(
          async (res) => {
            if (!res.ok) throw new Error(`Calendar HTTP ${res.status}`);
            const calData = await res.json();
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

            const highImpact = events.filter(
              (ev: CalendarEventRow) =>
                typeof ev.impact === "string" &&
                (ev.impact.includes("★★★") ||
                  ev.impact.toLowerCase().includes("high"))
            );

            calendarTableAll = buildCalendarTable(events, {
              emptyMessage:
                "- Tidak ada event terdaftar pada tanggal ini di sistem Newsmaker.",
            });

            calendarTableHighImpact = buildCalendarTable(highImpact, {
              emptyMessage:
                "- Tidak ada event berdampak sangat tinggi (★★★) pada tanggal ini.",
            });
          }
        )
      );
    }

    if (fetchPromises.length > 0) {
      await Promise.allSettled(fetchPromises);
    }

    // ======================================================
    // 🔥 SHORT-CIRCUIT 5: MARGIN XAUUSD (BUTUH QUOTES / ATAU HARGA DI PROMPT)
    // ======================================================
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

      // fallback: pakai harga Gold dari quotes
      if ((!isFinite(price) || price <= 0) && quotesRows.length > 0) {
        const goldQuote = pickQuoteForInstrument(quotesRows, "gold");
        const lastRaw =
          goldQuote?.last ?? goldQuote?.close ?? goldQuote?.price ?? null;
        const lastNum = Number(lastRaw);
        if (isFinite(lastNum) && lastNum > 0) {
          price = lastNum;
        }
      }

      if (!isFinite(price) || price <= 0 || leverage <= 0) {
        return NextResponse.json(
          {
            reply:
              "Untuk simulasi margin XAUUSD, tolong sertakan minimal salah satu:\n" +
              "- Harga XAUUSD (misal: `harga 4200`), atau\n" +
              "- Pastikan sistem quotes aktif sehingga harga bisa diambil otomatis.\n\n" +
              "Contoh:\n" +
              "`simulasi margin xauusd 1 lot leverage 1:100 di harga 4200`",
            imagePath: null,
          },
          { status: 200 }
        );
      }

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

    // ======================================================
    // 🔥 SHORT-CIRCUIT 6: HARGA LANGSUNG (PRICE/QUOTE) - NON AI
    // ======================================================
    const isPriceQuestion = isPriceQuestionBase && quotesRows.length > 0;

    if (isPriceQuestion) {
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
          `Harga terkini berdasarkan data internal Newsmaker${updatedInfo}:\n\n` +
          linesPrice.join("\n") +
          "\n\nIni hanya informasi edukatif, bukan rekomendasi beli/jual.";

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
    // 🔥 SHORT-CIRCUIT 7: KALENDER EKONOMI (TABEL)
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
          ? `\n\nFokus di atas hanya event berdampak tinggi. Jika ingin melihat semua event, tulis saja: kalender ekonomi ${calendarHumanLabel} lengkap.`
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
          "Jadi, NM Base Rules tidak bisa menyebut jam dan event spesifik untuk hari ini.";

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
    // FALLBACK: MODE BASE RULES SAJA
    // ======================================================
    const fallbackReply =
      "Saat ini kamu sedang berinteraksi dengan Gwen — model NM Base Rules (mode kalkulasi teknis, tanpa modul AI penuh).\n\n" +
      "Yang bisa gue bantu di mode ini:\n" +
      "1. Ringkasan **Trading Rules** (SPA, margin, equity, P/L, dll.)\n" +
      "2. Perhitungan **Pivot Point** (Classic / Woodie / Camarilla)\n" +
      "3. Perhitungan **Fibonacci** (uptrend/downtrend)\n" +
      "4. Simulasi **margin XAUUSD** (lot, leverage, harga)\n" +
      "5. Informasi **harga terkini** (Gold, Silver, Oil, indeks, forex) dari data internal\n" +
      "6. Tampilan **kalender ekonomi** hari ini dalam bentuk tabel\n\n" +
      "Silakan ulangi pertanyaannya dengan salah satu format di atas, ya 🙂";

    return NextResponse.json(
      {
        reply: fallbackReply,
        imagePath: null,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("API /nm-ai (Base Rules) error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: String(err) },
      { status: 500 }
    );
  }
}
