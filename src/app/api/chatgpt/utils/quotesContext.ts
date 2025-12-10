// src/app/api/nm-ai/utils/quotesContext.ts
import { formatDateIso } from "./dateUtils";

export interface QuotesContext {
  rows: any[];
  updatedAtLocal: string;
  systemMessage: { role: "system"; content: string };
}

export async function buildQuotesContext(
  quotesApiUrl: string
): Promise<QuotesContext> {
  let rows: any[] = [];
  let updatedAtLocal = "";
  let summary = "";

  try {
    const res = await fetch(quotesApiUrl, { method: "GET", cache: "no-store" });
    if (res.ok) {
      const data: any = await res.json();
      const rawRows: any[] = Array.isArray(data.data) ? data.data : [];

      if (data.updatedAt) {
        const updatedRaw = new Date(data.updatedAt);
        if (!isNaN(updatedRaw.getTime())) {
          const updatedJakarta = new Date(
            updatedRaw.toLocaleString("en-US", {
              timeZone: "Asia/Jakarta",
            })
          );
          updatedAtLocal = updatedJakarta.toLocaleString("id-ID", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      }

      rows = rawRows.slice(0, 50);

      summary = rows
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
    } else {
      console.error("Quotes HTTP error:", res.status);
    }
  } catch (err) {
    console.error("Quotes fetch error:", err);
  }

  const systemContent = summary
    ? (() => {
        const updateInfo = updatedAtLocal
          ? `Data harga terakhir diperbarui sekitar **${updatedAtLocal} WIB**.\n\n`
          : "";
        return (
          "Sistem Harga Live (internal Newsmaker):\n\n" +
          updateInfo +
          "Ringkasan harga terkini (angka di bawah hanya referensi internal, rangkai ulang dengan bahasamu sendiri):\n" +
          summary +
          "\n\n" +
          "ATURAN PENTING TENTANG ANGKA:\n" +
          "- Jika menyebut HARGA TERKINI, gunakan angka last apa adanya, boleh ditambah kata 'sekitar', tapi JANGAN mengubahnya jadi rentang baru jika tidak ada di data.\n" +
          "- Jangan mengarang rentang harga atau level spesifik yang tidak muncul di data internal.\n"
        );
      })()
    : "Sistem harga live tidak berhasil mengambil data. Jika pengguna bertanya harga terkini, jangan mengarang angka; jelaskan bahwa data live sementara tidak tersedia.";

  return {
    rows,
    updatedAtLocal,
    systemMessage: { role: "system", content: systemContent },
  };
}
