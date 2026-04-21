const LEGACY_QUOTES_DEFAULT_URL =
  "https://endpoapi-production-3202.up.railway.app/api/live-quotes";

const TRADINGVIEW_SCAN_URL =
  process.env.TRADINGVIEW_SCAN_URL ||
  "https://scanner.tradingview.com/global/scan2";

type TvFieldRow = [string, string, number, number, number, number, number, number];

type QuoteRow = {
  symbol: string;
  sourceSymbol: string;
  last: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  valueChange: number;
  percentChange: number;
};

type QuotePayload = {
  data: QuoteRow[];
  updatedAt: string;
  provider: "tradingview" | "fallback";
};

type SymbolConfig = {
  id: "gold" | "oil" | "hsi" | "nikkei" | "audusd" | "eurusd" | "gbpusd" | "usdchf" | "usdjpy";
  alias: string;
  candidates: string[];
};

const parseCsvEnv = (value: string | undefined, defaults: string[]): string[] => {
  if (!value || !value.trim()) return defaults;
  const parsed = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return parsed.length ? parsed : defaults;
};

const SYMBOL_CONFIGS: SymbolConfig[] = [
  {
    id: "gold",
    alias: process.env.TV_ALIAS_GOLD || "XUL10",
    candidates: parseCsvEnv(process.env.TV_SYMBOLS_GOLD, ["OANDA:XAUUSD"]),
  },
  {
    id: "oil",
    alias: process.env.TV_ALIAS_OIL || "BCO10_BBJ",
    candidates: parseCsvEnv(process.env.TV_SYMBOLS_OIL, ["ACTIVTRADES:BRENTM2026", "TVC:UKOIL", "TVC:USOIL"]),
  },
  {
    id: "hsi",
    alias: process.env.TV_ALIAS_HSI || "HKK50_BBJ",
    candidates: parseCsvEnv(process.env.TV_SYMBOLS_HSI, ["VANTAGE:HK50", "TVC:HSI"]),
  },
  {
    id: "nikkei",
    alias: process.env.TV_ALIAS_NIKKEI || "JPK50_BBJ",
    candidates: parseCsvEnv(process.env.TV_SYMBOLS_NIKKEI, ["SPREADEX:NIKKEI", "TVC:NI225"]),
  },
  {
    id: "audusd",
    alias: process.env.TV_ALIAS_AUDUSD || "AU10F_BBJ",
    candidates: parseCsvEnv(process.env.TV_SYMBOLS_AUDUSD, ["OANDA:AUDUSD"]),
  },
  {
    id: "eurusd",
    alias: process.env.TV_ALIAS_EURUSD || "EU10F_BBJ",
    candidates: parseCsvEnv(process.env.TV_SYMBOLS_EURUSD, ["OANDA:EURUSD"]),
  },
  {
    id: "gbpusd",
    alias: process.env.TV_ALIAS_GBPUSD || "GU10F_BBJ",
    candidates: parseCsvEnv(process.env.TV_SYMBOLS_GBPUSD, ["OANDA:GBPUSD"]),
  },
  {
    id: "usdchf",
    alias: process.env.TV_ALIAS_USDCHF || "UC10F_BBJ",
    candidates: parseCsvEnv(process.env.TV_SYMBOLS_USDCHF, ["OANDA:USDCHF"]),
  },
  {
    id: "usdjpy",
    alias: process.env.TV_ALIAS_USDJPY || "UJ10F_BBJ",
    candidates: parseCsvEnv(process.env.TV_SYMBOLS_USDJPY, ["OANDA:USDJPY"]),
  },
];

const hasQuoteForGroup = (rows: any[], id: SymbolConfig["id"]): boolean => {
  const checks: Record<SymbolConfig["id"], string[]> = {
    gold: ["XAU", "XUL", "GOLD"],
    oil: ["BCO", "BRENT", "OIL", "UKOIL", "USOIL"],
    hsi: ["HSI", "HANG", "HKK50", "HK50"],
    nikkei: ["NIKKEI", "NI225", "JPK50", "JP225"],
    audusd: ["AUDUSD", "AU10", "AUD/USD"],
    eurusd: ["EURUSD", "EU10", "EUR/USD"],
    gbpusd: ["GBPUSD", "GU10", "GBP/USD"],
    usdchf: ["USDCHF", "UC10", "USD/CHF"],
    usdjpy: ["USDJPY", "UJ10", "USD/JPY"],
  };

  const patterns = checks[id];
  return rows.some((row) => {
    const sym = (row.symbol || row.sourceSymbol || "").toString().toUpperCase();
    return patterns.some((p) => sym.includes(p));
  });
};

const normalizeLegacyQuote = (row: any): QuoteRow | null => {
  const symbol = (row.symbol || row.Symbol || "").toString().trim();
  const last = Number.parseFloat(row.last);
  const open = Number.parseFloat(row.open);
  const high = Number.parseFloat(row.high);
  const low = Number.parseFloat(row.low);
  const valueChange = Number.parseFloat(row.valueChange || 0);
  const percentChange = Number.parseFloat(row.percentChange || 0);
  const prevCloseRaw = Number.parseFloat(row.prevClose);
  const prevClose =
    Number.isFinite(prevCloseRaw) && prevCloseRaw !== 0
      ? prevCloseRaw
      : Number.isFinite(last) && Number.isFinite(valueChange)
        ? last - valueChange
        : 0;

  if (!symbol || !Number.isFinite(last)) return null;

  return {
    symbol,
    sourceSymbol: symbol,
    last,
    open: Number.isFinite(open) ? open : last,
    high: Number.isFinite(high) ? high : last,
    low: Number.isFinite(low) ? low : last,
    prevClose: Number.isFinite(prevClose) ? prevClose : 0,
    valueChange: Number.isFinite(valueChange) ? valueChange : 0,
    percentChange: Number.isFinite(percentChange) ? percentChange : 0,
  };
};

const normalizeTradingViewSymbol = (
  config: SymbolConfig,
  sourceSymbol: string,
  fields: TvFieldRow,
): QuoteRow | null => {
  const [, , close, open, high, low, changePct, changeAbs] = fields;
  if (!Number.isFinite(close)) return null;

  const valueChange = Number.isFinite(changeAbs) ? changeAbs : 0;
  const prevClose = close - valueChange;

  return {
    symbol: config.alias,
    sourceSymbol,
    last: close,
    open: Number.isFinite(open) ? open : close,
    high: Number.isFinite(high) ? high : close,
    low: Number.isFinite(low) ? low : close,
    prevClose: Number.isFinite(prevClose) ? prevClose : 0,
    valueChange,
    percentChange: Number.isFinite(changePct) ? changePct : 0,
  };
};

const fetchLegacyQuotes = async (): Promise<{ rows: QuoteRow[]; updatedAt: string }> => {
  const fallbackUrl = process.env.QUOTES_API_FALLBACK_URL || LEGACY_QUOTES_DEFAULT_URL;
  const response = await fetch(fallbackUrl, { method: "GET", cache: "no-store" });
  if (!response.ok) return { rows: [], updatedAt: new Date().toISOString() };

  const data = await response.json();
  const rows = (Array.isArray(data.data) ? data.data : [])
    .map(normalizeLegacyQuote)
    .filter(Boolean) as QuoteRow[];

  return {
    rows,
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
};

export async function fetchQuotes(): Promise<QuotePayload> {
  const tickers = Array.from(new Set(SYMBOL_CONFIGS.flatMap((cfg) => cfg.candidates)));
  const body = {
    symbols: { tickers, query: { types: [] as string[] } },
    columns: ["name", "description", "close", "open", "high", "low", "change", "change_abs"],
  };

  try {
    const response = await fetch(TRADINGVIEW_SCAN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`TradingView HTTP ${response.status}`);

    const payload = await response.json();
    const entries = Array.isArray(payload.symbols) ? payload.symbols : [];
    const bySymbol = new Map<string, TvFieldRow>();

    for (const entry of entries) {
      const sourceSymbol = (entry?.s || "").toString().toUpperCase();
      const fields = entry?.f;
      if (!sourceSymbol || !Array.isArray(fields) || fields.length < 8) continue;
      bySymbol.set(sourceSymbol, fields as TvFieldRow);
    }

    const rows: QuoteRow[] = [];
    for (const cfg of SYMBOL_CONFIGS) {
      const matchedTicker = cfg.candidates.find((ticker) => bySymbol.has(ticker.toUpperCase()));
      if (!matchedTicker) continue;
      const fields = bySymbol.get(matchedTicker.toUpperCase());
      if (!fields) continue;
      const normalized = normalizeTradingViewSymbol(cfg, matchedTicker, fields);
      if (normalized) rows.push(normalized);
    }

    const { rows: fallbackRows } = await fetchLegacyQuotes();
    for (const cfg of SYMBOL_CONFIGS) {
      if (hasQuoteForGroup(rows, cfg.id)) continue;
      const fallbackMatch = fallbackRows.find((row) => hasQuoteForGroup([row], cfg.id));
      if (fallbackMatch) rows.push(fallbackMatch);
    }

    return {
      data: rows,
      updatedAt: payload.time || new Date().toISOString(),
      provider: "tradingview",
    };
  } catch (err) {
    console.error("TradingView quote fetch failed, fallback to legacy:", err);
    const { rows, updatedAt } = await fetchLegacyQuotes();
    return { data: rows, updatedAt, provider: "fallback" };
  }
}
