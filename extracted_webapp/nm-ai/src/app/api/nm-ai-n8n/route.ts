// src/app/api/nm-ai/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL!;
// .env.local:
// N8N_WEBHOOK_URL="https://fptra28.app.n8n.cloud/webhook/7c159a29-81fb-403b-b9a0-00752ae182ee"

export async function POST(req: NextRequest) {
  try {
    // Frontend kirim FormData (bukan JSON)
    const formData = await req.formData();

    const prompt = (formData.get("prompt") as string) || "";
    const historyRaw = (formData.get("history") as string) || "[]";

    if (!prompt.trim()) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    let history: { role: "user" | "assistant"; content: string }[] = [];
    try {
      history = JSON.parse(historyRaw);
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }

    // Kirim ke n8n webhook sebagai JSON
    const n8nRes = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: prompt, // ⬅️ ini yang dipakai workflow n8n
        history, // kalau ingin dipakai di n8n
      }),
    });

    if (!n8nRes.ok) {
      const text = await n8nRes.text();
      console.error("n8n error:", n8nRes.status, text);
      return NextResponse.json(
        {
          error: "NM Ai (n8n) tidak merespon dengan benar.",
          details: text,
        },
        { status: 500 }
      );
    }

    const raw = await n8nRes.json().catch(() => ({}));

    // 🔧 Normalisasi bentuk response dari n8n → { reply: string }
    let reply = "";

    // Kasus 1: n8n sudah balikin { reply: "..." }
    if (typeof (raw as any)?.reply === "string") {
      reply = (raw as any).reply;
    }
    // Kasus 2: n8n balikin array [ { reply / output / answer / result } ]
    else if (Array.isArray(raw) && raw.length > 0) {
      const first = raw[0] as any;
      reply =
        (typeof first.reply === "string" && first.reply) ||
        (typeof first.output === "string" && first.output) ||
        (typeof first.answer === "string" && first.answer) ||
        (typeof first.result === "string" && first.result) ||
        "";
    }
    // Kasus 3: n8n balikin { output: "..." } langsung
    else if (typeof (raw as any)?.output === "string") {
      reply = (raw as any).output;
    }

    if (!reply) {
      reply = "NM Ai tidak memberikan respon.";
    }

    return NextResponse.json({ reply }, { status: 200 });
  } catch (err: any) {
    console.error("Error call n8n:", err);
    return NextResponse.json(
      { error: "Gagal menghubungi NM Ai (n8n)." },
      { status: 500 }
    );
  }
}
