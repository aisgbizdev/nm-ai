// src/app/api/nm-ai/utils/newsContext.ts
import { formatDateIso } from "./dateUtils";

export interface NewsContext {
  systemMessage: { role: "system"; content: string };
}

export async function buildNewsContext(opts: {
  newsApiUrl: string;
  todayIso: string;
  isNewsQuery: boolean;
}): Promise<NewsContext> {
  const { newsApiUrl, todayIso, isNewsQuery } = opts;

  let newsSummaryAll = "";
  let newsSummaryToday = "";
  let newsHasData = false;

  try {
    const res = await fetch(newsApiUrl, { method: "GET", cache: "no-store" });
    if (res.ok) {
      const newsData: any = await res.json();
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

          const penulisLabel = authorName ? `, ditulis oleh ${authorName}` : "";

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
    } else {
      console.error("News HTTP error:", res.status);
    }
  } catch (err) {
    console.error("News fetch error:", err);
  }

  const systemContent = newsHasData
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
    : "Sistem berita pasar Newsmaker.id saat ini tidak berhasil mengambil data. Jika pengguna bertanya 'berita terbaru', jelaskan bahwa data berita internal sedang tidak dapat diakses dan beri penjelasan pasar secara umum.";

  return {
    systemMessage: { role: "system", content: systemContent },
  };
}
