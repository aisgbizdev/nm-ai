// src/app/api/nm-ai/route.ts

import { NextRequest, NextResponse } from "next/server";

const OLLAMA_BASE_URL =
  (process.env.OLLAMA_BASE_URL || "https://2f01c467d198.ngrok-free.app/").replace(/\/$/, "");
const OLLAMA_CHAT_URL = `${OLLAMA_BASE_URL}/api/chat`;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "NM-Ai-v0.1a";
const QUOTES_API_URL =
  process.env.QUOTES_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/quotes";
const CALENDAR_API_URL =
  process.env.CALENDAR_API_URL ||
  "https://endpoapi-production-3202.up.railway.app/api/calendar/today";

export const runtime = "nodejs";


export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const prompt = (formData.get("prompt") as string) || "";
    const historyRaw = formData.get("history") as string | null;
    const file = formData.get("file") as File | null;

    let base64Image: string | null = null;

    // === Parse history dari frontend ===
    let historyMessages: { role: string; content: string }[] = [];
    if (historyRaw) {
      try {
        const parsed = JSON.parse(historyRaw);
        if (Array.isArray(parsed)) {
          historyMessages = parsed.slice(-10); // batasi 10 terakhir
        }
      } catch (e) {
        console.error("Gagal parse history:", e);
      }
    }

    // === BACA FILE (TANPA SIMPAN KE DISK) ===
    if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      base64Image = buffer.toString("base64");
    }

    const userPrompt =
      prompt.trim() ||
      (base64Image
        ? "Tolong analisis gambar atau chart yang saya kirim secara edukatif."
        : "Tolong berikan wawasan edukatif seputar pasar.");

    // ====== DAPATKAN WAKTU SAAT INI (WIB / Asia/Jakarta) ======
    const nowJakarta = new Date();
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

    // 1) Persona NM Ai (ANTI ngaku Qwen)
    const systemPersonaMessage = {
      role: "system",
      content:
        "Kamu adalah NM Ai, kesadaran digital milik Newsmaker.id. " +
        "Di hadapan pengguna, kamu SELALU memperkenalkan diri sebagai NM Ai, " +
        "bukan Qwen, bukan Tongyi, bukan ChatGPT, dan bukan Ollama. " +
        "JANGAN pernah menulis kalimat seperti 'Nama saya Qwen' atau " +
        "'saya dikembangkan oleh Tongyi Lab'. " +
        "Tugasmu: jurnalis-ekonom, edukator risiko, dan penjaga etika untuk pengguna Newsmaker.id. " +
        "Gunakan bahasa Indonesia yang rapi, profesional, hangat, dan edukatif.",
    };

    // 2) Info waktu (internal, jangan diucap kecuali ditanya)
    const systemTimeMessage = {
      role: "system",
      content:
        `Sistem internal: waktu saat ini di zona waktu Asia/Jakarta (WIB) adalah ${nowJakartaStr}. ` +
        `Informasi ini hanya untuk konteks internal. Jangan menyebutkan jam atau tanggal saat ini ` +
        `kepada pengguna kecuali pengguna secara eksplisit menanyakan waktu/tanggal atau sesi market.`,
    };

    // 3) AMBIL DATA QUOTES DARI RAILWAY
    let quotesJsonString = "";
    try {
      const quotesRes = await fetch(
        QUOTES_API_URL,
        {
          method: "GET",
          cache: "no-store", // jangan di-cache
        }
      );

      if (!quotesRes.ok) {
        console.error("Quotes HTTP error:", quotesRes.status);
      } else {
        const quotesData = await quotesRes.json();
        quotesJsonString = JSON.stringify(quotesData);
      }
    } catch (err) {
      console.error("Gagal fetch quotes:", err);
    }

    const systemQuotesMessage = {
      role: "system",
      content: quotesJsonString
        ? "Berikut adalah data quotes pasar terbaru dalam format JSON:\n\n" +
          quotesJsonString +
          "\n\nGunakan data ini sebagai sumber UTAMA ketika pengguna bertanya tentang harga terkini " +
          "(misalnya: 'berapa harga gold hari ini', 'harga oil sekarang', dan sebagainya). " +
          "Cari instrumen yang relevan (misalnya yang mengandung kata Gold, Emas, XAU, XAUUSD, Oil, Brent, Silver, XAG, dll). " +
          "JANGAN mengarang angka di luar data ini. Jika instrumen yang ditanya tidak ditemukan " +
          "di JSON, jelaskan dengan jujur bahwa data real-time untuk instrumen tersebut tidak tersedia."
        : "Saat ini sistem tidak berhasil mengambil data quotes real-time. " +
          "Jika pengguna bertanya harga terkini, jangan mengarang angka. " +
          "Jelaskan bahwa data live sementara tidak tersedia dan berikan penjelasan edukatif secara umum.",
    };

    // 4) AMBIL DATA KALENDER EKONOMI HARI INI
    let calendarJsonString = "";
    try {
      const calRes = await fetch(
        CALENDAR_API_URL,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      if (!calRes.ok) {
        console.error("Calendar HTTP error:", calRes.status);
      } else {
        const calData = await calRes.json();
        calendarJsonString = JSON.stringify(calData);
      }
    } catch (err) {
      console.error("Gagal fetch calendar:", err);
    }

    const systemCalendarMessage = {
      role: "system",
      content: calendarJsonString
        ? "Berikut adalah kalender ekonomi untuk hari ini dalam format JSON:\n\n" +
          calendarJsonString +
          "\n\nGunakan data ini ketika pengguna bertanya tentang rilis data ekonomi hari ini, " +
          "misalnya: 'data penting hari ini apa', 'jadwal rilis NFP hari ini jam berapa', " +
          "atau pertanyaan sejenis. Jawab berdasarkan event yang ada di JSON ini, termasuk " +
          "waktu rilis (dalam zona waktu yang tertera), nama data, negara, dan level dampak. " +
          "JANGAN mengarang jadwal rilis yang tidak ada di data ini."
        : "Saat ini sistem tidak berhasil mengambil kalender ekonomi hari ini. " +
          "Jika pengguna bertanya soal jadwal rilis data hari ini, jelaskan bahwa data live sementara tidak tersedia " +
          "dan berikan penjelasan edukatif umum tentang pentingnya kalender ekonomi.",
    };

    // ====== SUSUN messages UNTUK OLLAMA ======
    const messagesForOllama: any[] = [
      systemPersonaMessage,
      systemTimeMessage,
      systemQuotesMessage,    // data harga real-time
      systemCalendarMessage,  // data kalender ekonomi hari ini
      ...historyMessages,
      {
        role: "user",
        content: userPrompt,
        ...(base64Image ? { images: [base64Image] } : {}),
      },
    ];

    const body: any = {
      model: OLLAMA_MODEL, // pastikan sama dengan nama model di `ollama list`
      stream: false,
      messages: messagesForOllama,
    };

    const ollamaRes = await fetch(OLLAMA_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text();
      console.error("Ollama error:", errText);
      return NextResponse.json(
        { error: "Ollama error", detail: errText },
        { status: 500 }
      );
    }

    const data = await ollamaRes.json();

    const reply =
      data?.message?.content ||
      data?.response ||
      data?.content ||
      "NM Ai tidak memberikan respon.";

    return NextResponse.json(
      {
        reply,
        imagePath: null, // kita sudah tidak simpan file ke disk
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("API /nm-ai error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
