// src/app/404/NotFoundClient.tsx
"use client";

import { useSearchParams } from "next/navigation";

export default function NotFoundClient() {
  const sp = useSearchParams();

  // contoh: kalau lu punya logic baca query string
  const from = sp.get("from");
  const q = sp.get("q");

  if (!from && !q) return null;

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-semibold">Info (query):</div>
      <ul className="mt-2 text-sm opacity-90 space-y-1">
        {from ? <li>- from: {from}</li> : null}
        {q ? <li>- q: {q}</li> : null}
      </ul>
    </div>
  );
}
