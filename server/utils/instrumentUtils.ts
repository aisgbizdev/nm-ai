// src/app/api/nm-ai/utils/instrumentUtils.ts

import { formatDateIso } from "./dateUtils";

export type InstrumentKey =
  | "gold"
  | "silver"
  | "oil"
  | "hsi"
  | "sni"
  | "usdchf"
  | "usdjpy"
  | "gbpusd"
  | "audusd"
  | "eurusd"
  | "usdidr"
  | "other";

export const INSTRUMENT_HINTS: Record<InstrumentKey, string[]> = {
  gold: ["XUL10", "XUL", "XAUUSD", "XAU", "GOLD", "EMAS", "LGD", "LGD DAILY"],
  silver: ["XAGUSD", "XAG", "SILVER", "PERAK", "LSI", "LSI DAILY"],
  oil: ["BCO10_BBJ", "BCO", "OIL", "BRENT", "BCO DAILY"],
  hsi: ["HKK50_BBJ", "HSI", "HANG SENG", "HSI DAILY"],
  sni: ["JPK50_BBJ", "SNI", "NIKKEI", "N225", "JAPAN INDEX", "SNI DAILY"],
  usdchf: ["UC10F_BBJ", "USD/CHF", "USDCHF", "CHF"],
  usdjpy: ["UJ10F_BBJ", "USD/JPY", "USDJPY", "YEN", "JPY"],
  gbpusd: ["GU10F_BBJ", "GBP/USD", "GBPUSD", "CABLE", "POUND"],
  audusd: ["AU10F_BBJ", "AUD/USD", "AUDUSD", "AUSSIE"],
  eurusd: ["EU10F_BBJ", "EUR/USD", "EURUSD", "EURO"],
  usdidr: ["USD/IDR", "USDIDR", "INDO"],
  other: [],
};

export const INSTRUMENT_LABEL: Record<
  InstrumentKey,
  { name: string; unit: string }
> = {
  gold: { name: "emas (Gold)", unit: "USD per troy ounce" },
  silver: { name: "perak (Silver)", unit: "USD per troy ounce" },
  oil: { name: "minyak (Oil)", unit: "USD per barrel" },
  hsi: { name: "indeks Hang Seng (HSI)", unit: "poin indeks" },
  sni: { name: "indeks Nikkei / Jepang (SNI)", unit: "poin indeks" },
  usdchf: { name: "Pasangan mata uang USD/CHF", unit: "nilai tukar (rate)" },
  usdjpy: { name: "Pasangan mata uang USD/JPY", unit: "nilai tukar (rate)" },
  gbpusd: { name: "Pasangan mata uang GBP/USD", unit: "nilai tukar (rate)" },
  audusd: { name: "Pasangan mata uang AUD/USD", unit: "nilai tukar (rate)" },
  eurusd: { name: "Pasangan mata uang EUR/USD", unit: "nilai tukar (rate)" },
  usdidr: { name: "Pasangan mata uang USD/IDR", unit: "nilai tukar (rate)" },
  other: { name: "instrumen ini", unit: "unit harga" },
};

export const FIXED_USD_IDR_RATE = 10000;

// ============= DETEKSI INSTRUMEN DARI PROMPT =============

export const detectInstrumentFromPrompt = (prompt: string): InstrumentKey => {
  const p = prompt.toLowerCase();

  if (
    p.includes("emas") ||
    p.includes("gold") ||
    p.includes("xau") ||
    p.includes("lgd")
  ) {
    return "gold";
  }

  if (
    p.includes("perak") ||
    p.includes("silver") ||
    p.includes("xag") ||
    p.includes("lsi")
  ) {
    return "silver";
  }

  if (
    p.includes("oil") ||
    p.includes("minyak") ||
    p.includes("bco") ||
    p.includes("brent")
  ) {
    return "oil";
  }

  if (
    p.includes("hsi") ||
    p.includes("hang seng") ||
    p.includes("hangseng") ||
    p.includes("hongkong") ||
    p.includes("hong kong")
  ) {
    return "hsi";
  }

  if (
    p.includes("sni") ||
    p.includes("nikkei") ||
    p.includes("n225") ||
    p.includes("jepang")
  ) {
    return "sni";
  }

  if (p.includes("usd/chf") || p.includes("usdchf") || p.includes("chf")) {
    return "usdchf";
  }

  if (
    p.includes("usd/jpy") ||
    p.includes("usdjpy") ||
    p.includes("dolar yen") ||
    p.includes("dollar yen") ||
    p.includes("yen") ||
    p.includes("jpy")
  ) {
    return "usdjpy";
  }

  if (
    p.includes("gbp/usd") ||
    p.includes("gbpusd") ||
    p.includes("cable") ||
    p.includes("pound")
  ) {
    return "gbpusd";
  }

  if (p.includes("aud/usd") || p.includes("audusd") || p.includes("aussie")) {
    return "audusd";
  }

  if (p.includes("eur/usd") || p.includes("eurusd") || p.includes("euro")) {
    return "eurusd";
  }

  if (
    p.includes("usd/idr") ||
    p.includes("usdidr") ||
    p.includes("indo") ||
    p.includes("idr") ||
    p.includes("rupiah")
  ) {
    return "usdidr";
  }

  return "other";
};

// 🔥 versi multi
export const detectInstrumentsFromPromptMulti = (
  prompt: string
): InstrumentKey[] => {
  const p = prompt.toLowerCase();
  const result: InstrumentKey[] = [];

  const pushUnique = (key: InstrumentKey) => {
    if (!result.includes(key)) result.push(key);
  };

  if (/(emas|gold|xau|lgd)/.test(p)) pushUnique("gold");
  if (/(perak|silver|xag|lsi)/.test(p)) pushUnique("silver");
  if (/(oil|minyak|bco|brent)/.test(p)) pushUnique("oil");
  if (/(hang\s*seng|hangseng|hsi)/.test(p)) pushUnique("hsi");
  if (/(nikkei|sni|n225|jepang)/.test(p)) pushUnique("sni");
  if (/(usd\/chf|usdchf|\bchf\b)/.test(p)) pushUnique("usdchf");
  if (/(usd\/jpy|usdjpy|dolar yen|dollar yen|\byen\b|\bjpy\b)/.test(p))
    pushUnique("usdjpy");
  if (/(gbp\/usd|gbpusd|cable|\bpound\b)/.test(p)) pushUnique("gbpusd");
  if (/(aud\/usd|audusd|aussie)/.test(p)) pushUnique("audusd");
  if (/(eur\/usd|eurusd|euro)/.test(p)) pushUnique("eurusd");
  if (/(usd\/idr|usdidr|indo)/.test(p)) pushUnique("usdidr");

  return result;
};

// ============= HELPER HISTORICAL & QUOTES =============

export const pickHistoricalSeriesForInstrument = (
  bySymbol: Map<string, any[]>,
  instrument: InstrumentKey
): { symbol: string; rows: any[] } | null => {
  const hints = INSTRUMENT_HINTS[instrument];
  if (!hints.length) return null;

  for (const [sym, list] of bySymbol.entries()) {
    const upperSym = sym.toUpperCase();
    if (hints.some((h) => upperSym.includes(h))) {
      return { symbol: sym, rows: list };
    }
  }

  if (instrument === "other") {
    const first = [...bySymbol.entries()][0];
    if (!first) return null;
    return { symbol: first[0], rows: first[1] };
  }

  return null;
};

export const pickQuoteForInstrument = (
  rows: any[],
  instrument: InstrumentKey
): any | null => {
  const hints = INSTRUMENT_HINTS[instrument];
  if (!hints.length) {
    return rows.length ? rows[0] : null;
  }

  for (const row of rows) {
    const sym: string = (
      row.symbol ||
      row.Symbol ||
      row.ticker ||
      row.Ticker ||
      ""
    )
      .toString()
      .toUpperCase();
    if (sym && hints.some((h) => sym.includes(h))) {
      return row;
    }
  }

  if (instrument === "other") {
    return rows.length ? rows[0] : null;
  }

  return null;
};

// Optional helper: parse tanggal historis per row (kalau mau dipakai di luar)
export const extractIsoDateFromRow = (row: any): string | null => {
  const rawDate =
    row.date || row.Date || row.time || row.Time || row.timestamp || "";
  if (!rawDate) return null;
  const t = new Date(rawDate);
  if (isNaN(t.getTime())) return null;
  return formatDateIso(t);
};
