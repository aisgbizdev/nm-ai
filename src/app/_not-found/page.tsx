// src/app/_not-found/page.tsx
import { Suspense } from "react";
import NotFoundClient from "../404/NotFoundClient";

export default function InternalNotFoundPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-black/20 p-6">
        <h1 className="text-2xl font-bold">Not Found</h1>
        <p className="mt-2 text-sm opacity-80">Halaman internal not-found.</p>

        <Suspense
          fallback={<div className="mt-4 text-sm opacity-70">Memuat…</div>}
        >
          <NotFoundClient />
        </Suspense>

        <div className="mt-6">
          <a
            href="/"
            className="inline-flex items-center rounded-lg px-4 py-2 border border-white/10 hover:bg-white/5"
          >
            Kembali ke Home
          </a>
        </div>
      </div>
    </main>
  );
}
