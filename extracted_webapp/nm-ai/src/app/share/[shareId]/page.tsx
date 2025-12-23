"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

interface ShareData {
  text: string;
  imagePath?: string | null;
}

export default function SharePage({ params }: { params: { shareId: string } }) {
  const { shareId } = params;
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchShare = async () => {
      try {
        const ref = doc(db, "shares", shareId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setError("Link tidak ditemukan atau sudah dihapus.");
        } else {
          const payload = snap.data() as ShareData;
          setData(payload);
        }
      } catch (err) {
        console.error("Gagal memuat share:", err);
        setError("Gagal memuat konten.");
      } finally {
        setLoading(false);
      }
    };
    fetchShare();
  }, [shareId]);

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 shadow-lg">
        <h1 className="text-2xl font-semibold text-zinc-900 mb-3">
          Share Preview
        </h1>
        {loading && <p className="text-zinc-500">Memuat konten…</p>}
        {error && <p className="text-red-600">{error}</p>}

        {data && (
          <div className="space-y-4">
            {data.text && (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {data.text}
              </ReactMarkdown>
            )}

            {data.imagePath && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.imagePath}
                  alt="Lampiran"
                  className="max-h-[70vh] w-full object-contain rounded-lg"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
