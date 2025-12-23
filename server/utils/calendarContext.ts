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

function sanitizeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const str = String(value).replace(/\r?\n/g, " ").trim();
  return str === "" ? "-" : str;
}

function parseNumeric(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^\d.\-]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function formatActual(previousRaw: string, actualRaw: string): string {
  const prevNum = parseNumeric(previousRaw);
  const actNum = parseNumeric(actualRaw);
  const label = sanitizeCell(actualRaw);

  if (prevNum === null || actNum === null || label === "-") {
    return label;
  }

  if (actNum > prevNum) {
    return `${label} (+)`;
  }

  if (actNum < prevNum) {
    return `${label} (-)`;
  }

  return label;
}

function formatImpact(impact: string): string {
  const sanitized = sanitizeCell(impact);
  const starCount = (sanitized.match(/★/g) || []).length;
  
  if (starCount >= 3) return "High";
  if (starCount === 2) return "Med";
  if (starCount === 1) return "Low";
  
  if (sanitized.toLowerCase().includes("high")) return "High";
  if (sanitized.toLowerCase().includes("medium") || sanitized.toLowerCase().includes("med")) return "Med";
  if (sanitized.toLowerCase().includes("low")) return "Low";
  
  return sanitized;
}

export function buildCalendarTable(
  rows: CalendarEventRow[],
  options: BuildCalendarTableOptions = {}
): string {
  const {
    emptyMessage = "Tidak ada event terdaftar pada tanggal ini.",
  } = options;

  if (!rows || rows.length === 0) {
    return emptyMessage;
  }

  const headerLines = [
    "| Waktu | Mata Uang | Impact | Event | Previous | Forecast | Actual |",
    "|:------|:----------|:------:|:------|:---------|:---------|:-------|",
  ];

  const bodyLines = rows.map((ev) => {
    const time = sanitizeCell(ev.time);
    const currency = sanitizeCell(ev.currency);
    const impact = formatImpact(ev.impact);
    const eventName = sanitizeCell(ev.event).substring(0, 40);
    const previous = sanitizeCell(ev.previous);
    const forecast = sanitizeCell(ev.forecast);
    const actual = ev.actual && ev.actual.trim() !== ""
      ? formatActual(ev.previous, ev.actual)
      : "-";

    return `| ${time} | ${currency} | ${impact} | ${eventName} | ${previous} | ${forecast} | ${actual} |`;
  });

  return [...headerLines, ...bodyLines].join("\n");
}
