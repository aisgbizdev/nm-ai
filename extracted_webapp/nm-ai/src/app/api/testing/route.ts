// src/app/api/testing/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const OLLAMA_BASE_URL = (
  process.env.OLLAMA_BASE_URL || "http://localhost:11434"
).replace(/\/+$/, "");

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "NM-Ai";

export async function POST(req: NextRequest) {
  try {
    // Ambil dari FormData (karena FE kirim FormData)
    const formData = await req.formData();

    const prompt = (formData.get("prompt") as string) || "";
    const historyRaw = formData.get("history") as string | null;

    let history: { role: "user" | "assistant"; content: string }[] = [];

    if (historyRaw) {
      try {
        history = JSON.parse(historyRaw);
      } catch (e) {
        console.warn("Gagal parse history, di-skip:", e);
      }
    }

    // Bangun messages untuk Ollama /api/chat
    const messages = [
      // history lama
      ...history.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      // user message terbaru
      {
        role: "user" as const,
        content: prompt,
      },
    ];

    // Panggil Ollama /api/chat dengan format yang benar
    const ollamaRes = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
      }),
    });

    if (!ollamaRes.ok) {
      const text = await ollamaRes.text();
      console.error("Ollama error:", ollamaRes.status, text);
      return NextResponse.json(
        { error: "Ollama error", detail: text },
        { status: 500 }
      );
    }

    const data = await ollamaRes.json();
    console.log("Ollama raw data:", data); // debug kalau perlu

    const reply: string =
      data?.message?.content ||
      data?.response || // jaga-jaga kalau model balikin style generate
      data?.output ||
      "NM Ai tidak memberikan respon.";

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error("Internal error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        detail: String(err),
        OLLAMA_BASE_URL,
      },
      { status: 500 }
    );
  }
}
