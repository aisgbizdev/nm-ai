// src/app/api/nm-ai/utils/historicalContext.ts
import { formatDateIso } from "./dateUtils";
import {
  InstrumentKey,
  INSTRUMENT_LABEL,
  pickHistoricalSeriesForInstrument,
} from "./instrumentUtils";

export interface HistoricalContext {
  systemMessage: { role: "system"; content: string };
  historicalFromLabel: string;
}

export async function buildHistoricalContext(opts: {
  historicalApiUrl: string;
  requestedInstrument: InstrumentKey;
  historicalDaysAgo: number | null;
  historicalRelativeDateIso: string | null;
  nowJakarta: Date;
}): Promise<HistoricalContext> {
  const {
    historicalApiUrl,
    requestedInstrument,
    historicalDaysAgo,
    historicalRelativeDateIso,
    nowJakarta,
  } = opts;

  let historicalSummary = "";
  let historicalInstrumentWindowSummary = "";
  let historicalFromLabel = "";

  try {
    try {
      const url = new URL(historicalApiUrl);
      const df = url.searchParams.get("dateFrom");
      if (df) historicalFromLabel = df;
    } catch {
      historicalFromLabel = "";
    }

    const res = await fetch(historicalApiUrl, {
      method: "GET",
      cache: "no-store",
    });

    if (res.ok) {
      const histData: any = await res.json();
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
        const pctChange = startClose !== 0 ? (absChange / startClose) * 100 : 0;

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
          )}** menjadi sekitar **${fmtLocal(endClose)}**, perubahan ±${fmtLocal(
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
            row.symbol || row.Symbol || row.ticker || row.Ticker || "UNKNOWN";
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
      console.error("Historical HTTP error:", res.status);
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

  const systemContent = historicalSummary
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
    : "Sistem data historis saat ini tidak berhasil mengambil data. Jika pengguna bertanya tentang pergerakan historis, jawab secara konseptual tanpa menyebut angka spesifik.";

  return {
    systemMessage: { role: "system", content: systemContent },
    historicalFromLabel,
  };
}
