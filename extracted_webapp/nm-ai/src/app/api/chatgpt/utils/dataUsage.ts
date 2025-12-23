// src/app/api/nm-ai/utils/dataUsage.ts

export function buildDataUsageSystemMessage(hasImage: boolean): {
  role: "system";
  content: string;
} {
  return {
    role: "system",
    content: hasImage
      ? "Pesan terakhir pengguna menyertakan GAMBAR/CHART.\n" +
        "- Prioritaskan analisis visual: tren, pola, area penting.\n" +
        "- Baru hubungkan ke data harga live/fundamental jika relevan.\n"
      : "Pesan terakhir pengguna TIDAK menyertakan gambar.\n" +
        "- Untuk pertanyaan harga, gunakan data quotes.\n" +
        "- Untuk tren beberapa waktu terakhir, gunakan data historis.\n",
  };
}
