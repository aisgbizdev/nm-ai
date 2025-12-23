// src/app/api/nm-ai/utils/calendarContext.ts
// (kalau lu pisah calendarTable.ts ya tinggal sesuaikan import/export-nya, intinya fungsi ini)

export interface CalendarEventRow {
  date: string;
  time: string;
  currency: string;
  impact: string;
  event: string;
  previous: string;
  forecast: string;
  actual: string;
}

interface BuildCalendarTableOptions {
  emptyMessage?: string;
}

/**
 * Bersihin cell (hapus newline, trim, fallback "-")
 */
function sanitizeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const str = String(value).replace(/\r?\n/g, " ").trim();
  return str === "" ? "-" : str;
}

/**
 * Parse angka dari string yang mungkin ada %, M, dsb.
 * contoh:
 *  "0.7%"   -> 0.7
 *  "-2.1%"  -> -2.1
 *  "0.6M"   -> 0.6
 *  "-"      -> null
 */
function parseNumeric(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^\d.\-]/g, ""); // sisain digit, titik, minus
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Actual vs Previous:
 * - Actual < Previous => merah
 * - Actual = Previous => hitam
 * - Actual > Previous => hijau
 */
function colorizeActual(previousRaw: string, actualRaw: string): string {
  const prevNum = parseNumeric(previousRaw);
  const actNum = parseNumeric(actualRaw);
  const label = sanitizeCell(actualRaw);

  // Kalau ga bisa dibandingkan (data kosong / bukan angka) → tampil standar
  if (prevNum === null || actNum === null) {
    return label;
  }

  if (actNum > prevNum) {
    // hijau
    return `<span style="color:#16a34a;font-weight:600;">${label}</span>`;
  }

  if (actNum < prevNum) {
    // merah
    return `<span style="color:#dc2626;font-weight:600;">${label}</span>`;
  }

  // sama → hitam
  return `<span style="color:#111827;font-weight:600;">${label}</span>`;
}

/**
 * Bangun tabel kalender dalam FORMAT MARKDOWN TABLE
 */
export function buildCalendarTable(
  rows: CalendarEventRow[],
  options: BuildCalendarTableOptions = {}
): string {
  const {
    emptyMessage = "- Tidak ada event terdaftar pada tanggal ini di sistem Newsmaker.",
  } = options;

  if (!rows || rows.length === 0) {
    return emptyMessage;
  }

  // Header markdown table
  const headerLines = [
    "| Time (WIB) | Currency | Impact | Event | Previous | Forecast | Actual |",
    "|------------|----------|--------|-------|----------|----------|--------|",
  ];

  const bodyLines = rows.map((ev) => {
    const time = sanitizeCell(ev.time);
    const currency = sanitizeCell(ev.currency);
    const impact = sanitizeCell(ev.impact);
    const event = sanitizeCell(ev.event);
    const previous = sanitizeCell(ev.previous);
    const forecast = sanitizeCell(ev.forecast);

    const actualColored =
      ev.actual && ev.actual.trim() !== ""
        ? colorizeActual(ev.previous, ev.actual)
        : sanitizeCell(ev.actual);

    return `| ${time} | ${currency} | ${impact} | ${event} | ${previous} | ${forecast} | ${actualColored} |`;
  });

  return [...headerLines, ...bodyLines].join("\n");
}
