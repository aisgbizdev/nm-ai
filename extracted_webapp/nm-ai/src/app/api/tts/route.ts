// src/app/api/tts-gpt/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_TTS_MODEL =
  process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts"; // sesuaikan dengan model TTS yang ada di akun elu

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const text = (body?.text as string | undefined) || "";
    // contoh beberapa voice, nanti lu mapping ke UI:
    // "alloy", "verse", "nova", dll tergantung list dari OpenAI
    const voice = (body?.voice as string | undefined) || "Sage";

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Teks tidak boleh kosong" },
        { status: 400 }
      );
    }

    // OPTIONAL: batasi panjang di sini kalau mau (misal 3000 char)
    const MAX_CHARS = 3000;
    const finalText =
      text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;

    // Panggil TTS OpenAI → hasil berupa audio binary
    const response = await openai.audio.speech.create({
      model: DEFAULT_TTS_MODEL,
      voice, // contoh: "alloy"
      input: finalText,
      response_format: "mp3", // gunakan key resmi SDK
    });

    // response is a ReadableStream or Uint8Array tergantung versi SDK
    const audioBuffer = Buffer.from(await response.arrayBuffer());

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("TTS GPT error:", err);
    return NextResponse.json(
      {
        error: "Gagal generate suara dari GPT",
        detail: String(err?.message || err),
      },
      { status: 500 }
    );
  }
}
