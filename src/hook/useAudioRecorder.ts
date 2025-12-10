// src/hooks/useAudioRecorder.ts
"use client";

import { useRef, useState } from "react";

export interface UseAudioRecorderResult {
  isRecording: boolean;
  isUploading: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
}

/**
 * Hook untuk:
 * - Rekam suara via MediaRecorder (browser)
 * - Kirim blob audio ke /api/stt
 * - Balikkan teks lewat callback onResult
 */
export function useAudioRecorder(
  onResult: (text: string) => void
): UseAudioRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const startRecording = async () => {
    try {
      if (typeof window === "undefined") {
        console.warn("startRecording dipanggil di server, diabaikan.");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        alert("Browser kamu tidak mendukung perekaman audio.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        stream.getTracks().forEach((track) => track.stop());
        await uploadAndTranscribe(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Gagal mengakses mikrofon:", error);
      alert("Gagal mengakses mikrofon. Cek izin di browser.");
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadAndTranscribe = async (blob: Blob) => {
    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("file", blob, "voice.webm");

      const res = await fetch("/api/stt", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Gagal transcribe audio");
      }

      const data = await res.json();
      const text = (data.text as string) || "";

      if (text.trim()) {
        onResult(text);
      } else {
        alert("Tidak ada teks yang terdeteksi dari suara.");
      }
    } catch (err) {
      console.error("STT error:", err);
      alert("Gagal memproses voice, coba lagi.");
    } finally {
      setIsUploading(false);
    }
  };

  return {
    isRecording,
    isUploading,
    startRecording,
    stopRecording,
  };
}
