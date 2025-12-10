// src/app/api/nm-ai/utils/tradingRules.ts

// ---- TIPE GENERIC UNTUK SEMUA PRODUK ----
type MarginTradeCodeConfig = {
  [symbol: string]: {
    fixed: string;
    floating: string;
  };
};

type MarginTradingHoursConfig = {
  [symbol: string]: {
    session1: string | null;
    session2: string | null;
    session3: string | null;
  };
};

type MarginInitialMarginConfig = {
  dayTrade: Record<string, string>;
  overnight: Record<string, string>;
};

type MarginRolloverFacilityConfig = {
  sell: Record<string, string>;
  buy: Record<string, string>;
  vat: number;
};

type MarginPriceConfig = {
  source: Record<string, string>;
  guidance: Record<string, string>;
  minimumPriceSpreadQuote: Record<string, string>;
  maximumPriceSpreadQuote?: Record<string, string>;
  hecticPriceSpreadQuote: Record<string, string>;
  minimumPriceMovement: Record<string, string>;
  rangeForLimitAndStopOrder: Record<string, string>;
  hecticPriceRangeForLimitAndStopOrder: Record<string, string>;
};

export type GenericMarginConfig = {
  tradeCode: MarginTradeCodeConfig;
  contractSize: Record<string, string>;
  tradingHours: MarginTradingHoursConfig;
  initialMargin: MarginInitialMarginConfig;
  maintenanceMargin: Record<string, string>;
  autoLiquidation: Record<string, string>;
  facilityFee: Record<string, string>;
  rolloverFacility: MarginRolloverFacilityConfig;
  price: MarginPriceConfig;
  delivery: Record<string, string>;
};

// ====== HELPER KECIL ======
function safeGet(obj: Record<string, string> | undefined, key: string): string {
  if (!obj) return "";
  return obj[key] ?? "";
}

function blankRow(symbols: string[]): string {
  return `|  | ${symbols.map(() => "").join(" | ")} |`;
}

// ===============================================================
// 1) TABEL 3+ KOLOM  (SPESIFICATION + banyak symbol: HK/JP, dst)
// ===============================================================
export function buildTradingRulesTableThreeCols(
  title: string,
  config: GenericMarginConfig,
  symbolsFilter?: string[],
  options?: { includeFooter?: boolean }
): string {
  // pilih symbol mana yang mau ditampilkan
  let symbols = Object.keys(config.tradeCode || {});
  if (symbolsFilter && symbolsFilter.length > 0) {
    symbols = symbolsFilter.filter((s) => config.tradeCode[s]);
  }

  if (!symbols.length) {
    return `Tidak ada data trading rules untuk ${title}.`;
  }

  const heading = `## Trading Rules and Regulations - ${title}\n\n`;

  const header =
    `| SPESIFICATION | ${symbols.join(" | ")} |\n` +
    `| ------------- | ${symbols.map(() => "-------------").join(" | ")} |\n`;

  const rows: string[] = [];

  const addRow = (
    label: string,
    getter: (symbol: string) => string | null | undefined
  ) => {
    const cols = symbols.map((s) => getter(s) ?? "");
    rows.push(`| ${label} | ${cols.join(" | ")} |`);
  };

  // ==== TRADE CODE ====
  addRow("Trade Code", (s) => config.tradeCode[s]?.fixed ?? "");
  addRow("", (s) => config.tradeCode[s]?.floating ?? "");
  rows.push(blankRow(symbols));

  // ==== CONTRACT & HOURS ====
  addRow("Contract Size", (s) => safeGet(config.contractSize, s));
  rows.push(
    `| Trading Hours | ${symbols.map(() => "Monday - Friday").join(" | ")} |`
  );
  addRow("Session 1", (s) => config.tradingHours[s]?.session1 ?? "");
  addRow("Session 2", (s) => config.tradingHours[s]?.session2 ?? "");
  addRow("Session 3", (s) => config.tradingHours[s]?.session3 ?? "");
  rows.push(blankRow(symbols));

  // ==== INITIAL MARGIN ====
  rows.push(`| Initial Margin | ${symbols.map(() => "").join(" | ")} |`);
  addRow("Day Trade", (s) => config.initialMargin.dayTrade[s] ?? "");
  addRow("Overnight", (s) => config.initialMargin.overnight[s] ?? "");
  rows.push(blankRow(symbols));

  // ==== MAINT & FEE ====
  addRow("Maintenance Margin", (s) => safeGet(config.maintenanceMargin, s));
  addRow("Auto Liquidation", (s) => safeGet(config.autoLiquidation, s));
  addRow("Facility Fee", (s) => safeGet(config.facilityFee, s));
  rows.push(blankRow(symbols));

  // ==== ROLLOVER ====
  rows.push(`| Roolover Facility | ${symbols.map(() => "").join(" | ")} |`);
  addRow("Sell", (s) => config.rolloverFacility.sell[s] ?? "");
  addRow("Buy", (s) => config.rolloverFacility.buy[s] ?? "");
  addRow("VAT", () => `${(config.rolloverFacility.vat * 100).toFixed(0)}%`);
  rows.push(blankRow(symbols));

  // ==== PRICE AREA ====
  addRow("Price Source", (s) => config.price.source[s] ?? "");
  addRow("Price Guidance", (s) => config.price.guidance[s] ?? "");
  addRow(
    "Minimum Price Spread Quote",
    (s) => config.price.minimumPriceSpreadQuote[s] ?? ""
  );
  addRow(
    "Hectic Price Spread Quote",
    (s) => config.price.hecticPriceSpreadQuote[s] ?? ""
  );
  addRow(
    "Minimum Price Movement",
    (s) => config.price.minimumPriceMovement[s] ?? ""
  );
  addRow(
    "Range for Limit & stop Order",
    (s) => config.price.rangeForLimitAndStopOrder[s] ?? ""
  );
  addRow(
    "Hectic Price Range for Limit & Stop Order",
    (s) => config.price.hecticPriceRangeForLimitAndStopOrder[s] ?? ""
  );

  // ==== DELIVERY ====
  addRow("Delivery By", (s) => config.delivery[s] ?? "");

  const table = header + rows.join("\n");

  const footer =
    "\n\n---\n\n" +
    "_Catatan: Trading rules di atas adalah ketentuan produk. " +
    "Manajemen risiko & gaya trading tetap disesuaikan dengan profil risiko masing-masing trader._";

  // ⚠️ INI BAGIAN PENTING: footer cuma muncul kalau includeFooter !== false
  if (options && options.includeFooter === false) {
    return heading + table;
  }

  return heading + table + footer;
}

// ===============================================================
// 2) TABEL 2 KOLOM (SPESIFICATION + REMARKS) – opsional
//    (kalau nanti elu mau pakai style lama yang digabung)
// ===============================================================
type BuilderTwoColsOptions = {
  includeFooter?: boolean;
};

function buildRemarks(
  symbols: string[],
  getter: (symbol: string) => string | null | undefined
): string {
  const parts: string[] = [];

  for (const s of symbols) {
    const v = getter(s);
    if (!v) continue;
    parts.push(`**${s}**: ${v}`);
  }

  if (parts.length === 0) return "-";
  return parts.join("<br>");
}

export function buildTradingRulesTableTwoCols(
  title: string,
  config: GenericMarginConfig,
  symbolsFilter?: string[],
  options?: BuilderTwoColsOptions
): string {
  let symbols = Object.keys(config.tradeCode || {});
  if (symbolsFilter && symbolsFilter.length > 0) {
    symbols = symbolsFilter.filter((s) => config.tradeCode[s]);
  }

  if (symbols.length === 0) {
    return `Tidak ada data trading rules untuk ${title}.`;
  }

  const header =
    `### Trading Rules – ${title}\n\n` +
    `| SPESIFICATION | REMARKS |\n` +
    `|---------------|---------|\n`;

  const rows: string[] = [];

  const addRow = (
    label: string,
    getter: (symbol: string) => string | null | undefined
  ) => {
    const remarks = buildRemarks(symbols, getter);
    rows.push(`| ${label} | ${remarks} |`);
  };

  // TRADE CODE
  addRow("Trade Code", (s) => {
    const tc = config.tradeCode[s];
    if (!tc) return null;
    return `${tc.fixed}<br>${tc.floating}`;
  });

  addRow("Contract Size", (s) => config.contractSize[s]);

  rows.push(`| Trading Hours | Monday - Friday |`);

  addRow("Session 1", (s) => config.tradingHours[s]?.session1 ?? null);
  addRow("Session 2", (s) => config.tradingHours[s]?.session2 ?? null);
  addRow("Session 3", (s) => config.tradingHours[s]?.session3 ?? null);

  addRow("Initial Margin – Day Trade", (s) => config.initialMargin.dayTrade[s]);
  addRow(
    "Initial Margin – Overnight",
    (s) => config.initialMargin.overnight[s]
  );
  addRow("Maintenance Margin", (s) => config.maintenanceMargin[s]);
  addRow("Auto Liquidation", (s) => config.autoLiquidation[s]);
  addRow("Facility Fee", (s) => config.facilityFee[s]);

  addRow("Rollover Facility – Sell", (s) => config.rolloverFacility.sell[s]);
  addRow("Rollover Facility – Buy", (s) => config.rolloverFacility.buy[s]);
  addRow("VAT", () => `${(config.rolloverFacility.vat * 100).toFixed(0)}%`);

  addRow("Price Source", (s) => config.price.source[s]);
  addRow("Price Guidance", (s) => config.price.guidance[s]);
  addRow(
    "Minimum Price Spread Quote",
    (s) => config.price.minimumPriceSpreadQuote[s]
  );
  if (config.price.maximumPriceSpreadQuote) {
    addRow(
      "Maximum Price Spread Quote",
      (s) => config.price.maximumPriceSpreadQuote?.[s]
    );
  }
  addRow(
    "Hectic Price Spread Quote",
    (s) => config.price.hecticPriceSpreadQuote[s]
  );
  addRow("Minimum Price Movement", (s) => config.price.minimumPriceMovement[s]);
  addRow(
    "Range for Limit & Stop Order",
    (s) => config.price.rangeForLimitAndStopOrder[s]
  );
  addRow(
    "Hectic Price Range for Limit & Stop Order",
    (s) => config.price.hecticPriceRangeForLimitAndStopOrder[s]
  );
  addRow("Delivery By", (s) => config.delivery[s]);

  const footer =
    "\n\n---\n\n" +
    "_Catatan: Trading rules di atas adalah ketentuan produk. " +
    "Manajemen risiko & gaya trading tetap disesuaikan dengan profil risiko masing-masing trader._";

  if (options && options.includeFooter === false) {
    return header + rows.join("\n");
  }

  return header + rows.join("\n") + footer;
}
