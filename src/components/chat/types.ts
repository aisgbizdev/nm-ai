export interface UiMessage {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
  imagePath?: string;
}

export type ApiRoute = "/api/nm-ai" | "/api/chatgpt";

export const navigatorMenu = [
  {
    id: "1",
    title: "Trader Mode",
    description: "Analisa teknikal, margin, leverage, dan perilaku trader.",
    example: "Hitung margin XAUUSD 1 lot",
    pill: "Teknikal",
  },
  {
    id: "2",
    title: "Investor Path",
    description:
      "Analisa fundamental, risiko portofolio, dan strategi jangka panjang.",
    example: "Bagaimana outlook emas minggu ini?",
    pill: "Fundamental",
  },
  {
    id: "3",
    title: "Marketing Insight",
    description: "Edukasi produk, strategi komunikasi, dan transparansi harga.",
    example: "Bagaimana menjelaskan leverage ke nasabah?",
    pill: "Marketing",
  },
  {
    id: "4",
    title: "Broker Access",
    description: "Diskusi regulasi, kepatuhan Bappebti, dan model SPA.",
    example: "Apa syarat margin minimal sistem SPA?",
    pill: "Regulasi",
  },
  {
    id: "5",
    title: "Regulatory View",
    description: "Analisa perilaku pasar & etika perdagangan berjangka.",
    example: "Bagaimana NM Ai membantu deteksi manipulasi pasar?",
    pill: "Etika Pasar",
  },
  {
    id: "6",
    title: "Mentor Lab",
    description: "Simulasi risiko dan pembelajaran psikologi trading.",
    example: "Simulasikan ketahanan dana 1000 USD di XAUUSD.",
    pill: "Psikologi & Risk",
  },
  {
    id: "7",
    title: "Public Learn",
    description: "Literasi dasar trading dan manajemen risiko.",
    example: "Apa bedanya spread dan margin?",
    pill: "Pemula",
  },
  {
    id: "8",
    title: "Open Talk",
    description: "Diskusi santai seputar pasar, tren, atau opini pribadi.",
    example: "Kenapa gold sering volatil pas rilis data CPI?",
    pill: "Ngobrol",
  },
  {
    id: "9",
    title: "AI Sandbox",
    description:
      "Uji kemampuan NM Ai atau logika pasar yang lagi bikin penasaran.",
    example: "Coba jelaskan logika XAUUSD kalau DXY naik.",
    pill: "Eksperimen",
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
