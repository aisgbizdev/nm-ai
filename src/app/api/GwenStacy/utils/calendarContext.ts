// src/app/api/nm-ai/utils/calendarContext.ts

export interface CalendarEventRow {
  date: string; // ISO: YYYY-MM-DD
  time: string; // "HH.mm" atau "HH:mm" atau "-"
  currency: string;
  impact: string;
  event: string;
  previous: string;
  forecast: string;
  actual: string;
}

interface BuildCalendarTableOptions {
  emptyMessage?: string;

  /**
   * Kalau true => kolom pertama "Time (WIB)" pakai ev.time
   * Kalau false => kolom pertama "Date" pakai ev.date
   */
  useTimeColumn?: boolean;
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
 */
function parseNumeric(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^\d.\-]/g, "");
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

  if (prevNum === null || actNum === null) return label;

  if (actNum > prevNum) {
    return `<span style="color:#16a34a;font-weight:600;">${label}</span>`;
  }
  if (actNum < prevNum) {
    return `<span style="color:#dc2626;font-weight:600;">${label}</span>`;
  }
  return `<span style="color:#111827;font-weight:600;">${label}</span>`;
}

/**
 * Bangun tabel kalender dalam FORMAT MARKDOWN TABLE
 * - Hari ini => useTimeColumn: true (kolom pertama: "Time (WIB)")
 * - Selain hari ini => useTimeColumn: false (kolom pertama: "Date")
 */
export function buildCalendarTable(
  rows: CalendarEventRow[],
  options: BuildCalendarTableOptions = {}
): string {
  const {
    emptyMessage = "- Tidak ada event terdaftar pada tanggal ini di sistem Newsmaker.",
    useTimeColumn = true,
  } = options;

  if (!rows || rows.length === 0) return emptyMessage;

  const firstColName = useTimeColumn ? "Time (WIB)" : "Date";

  const headerLines = [
    `| ${firstColName} | Currency | Impact | Event | Previous | Forecast | Actual |`,
    "|------------|----------|--------|-------|----------|----------|--------|",
  ];

  const bodyLines = rows.map((ev) => {
    const firstColVal = useTimeColumn
      ? sanitizeCell(ev.time)
      : sanitizeCell(ev.date);
    const currency = sanitizeCell(ev.currency);
    const impact = sanitizeCell(ev.impact);
    const event = sanitizeCell(ev.event);
    const previous = sanitizeCell(ev.previous);
    const forecast = sanitizeCell(ev.forecast);

    const actualColored =
      ev.actual && ev.actual.trim() !== ""
        ? colorizeActual(ev.previous, ev.actual)
        : sanitizeCell(ev.actual);

    return `| ${firstColVal} | ${currency} | ${impact} | ${event} | ${previous} | ${forecast} | ${actualColored} |`;
  });

  return [...headerLines, ...bodyLines].join("\n");
}
