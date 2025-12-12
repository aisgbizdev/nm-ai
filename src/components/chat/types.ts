export interface UiMessage {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
  imagePath?: string;
}

export type ApiRoute = "/api/GwenStacy";

export const navigatorMenu = [
  {
    id: "1",
    title: "Margin Lab",
    description:
      "Simulasi margin XAUUSD berdasarkan lot, leverage, dan asumsi harga.",
    example: "Simulasi margin XAUUSD 1 lot leverage 1:100 di harga 4200",
    pill: "Margin",
  },
  {
    id: "2",
    title: "Pivot Studio",
    description:
      "Hitung level Pivot Classic, Woodie, dan Camarilla dari data OHLC.",
    example: "Hitung pivot dari O 4210, H 4250, L 4180, C 4220",
    pill: "Pivot",
  },
  // {
  //   id: "3",
  //   title: "Fibonacci Zone",
  //   description:
  //     "Hitung level Fibonacci retracement & projection untuk uptrend/downtrend.",
  //   example: "Hitung Fibonacci uptrend dari high 4300 dan low 4200",
  //   pill: "Fibonacci",
  // },
  {
    id: "4",
    title: "Trading Rules",
    description:
      "Lihat ringkasan aturan SPA, margin, equity ratio, dan auto liquidation.",
    example: "Jelaskan trading rules secara singkat",
    pill: "Rules",
  },
  {
    id: "5",
    title: "Trading Rules Table",
    description:
      "Tampilkan tabel lengkap trading rules per produk: Index, Commodity, dan Currency.",
    example: "Tampilkan tabel trading rules semua produk",
    pill: "Tabel Rules",
  },
  {
    id: "6",
    title: "Price Checker",
    description:
      "Cek harga terkini emas, perak, oil, indeks atau pasangan mata uang.",
    example: "Berapa harga emas dan perak sekarang?",
    pill: "Harga Live",
  },
  {
    id: "7",
    title: "Calendar Today",
    description: "Lihat kalender ekonomi hari ini dalam bentuk tabel lengkap.",
    example: "Tampilkan kalender ekonomi hari ini",
    pill: "Kalender",
  },
  {
    id: "8",
    title: "High Impact Events",
    description:
      "Filter kalender ekonomi untuk event berdampak tinggi (high impact / ★★★).",
    example: "Kalender ekonomi hari ini yang high impact saja",
    pill: "High Impact",
  },
  {
    id: "9",
    title: "Base Rules Help",
    description:
      "Panduan singkat apa saja yang bisa dilakukan mode NM Base Rules.",
    example: "Apa saja yang bisa dilakukan NM Base Rules?",
    pill: "Panduan",
  },
];

/** Hapus Markdown supaya TTS nggak baca simbol */
export const stripMarkdown = (input: string): string => {
  let text = input;

  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^>\s+/gm, "");
  text = text.replace(/^(\s*)[-*+]\s+/gm, "$1");
  text = text.replace(/^(\s*)\d+\.\s+/gm, "$1");
  text = text.replace(/(\*{1,3}|_{1,3})(.*?)\1/g, "$2");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/^\s*\|/gm, "");
  text = text.replace(/\|\s*$/gm, "");
  text = text.replace(/^\s*[-:]+\s*$/gm, "");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
};
