// src/app/api/nm-ai/utils/dateUtils.ts

const MONTHS_ID: Record<string, number> = {
  januari: 0,
  jan: 0,
  febuari: 1,
  februari: 1,
  feb: 1,
  maret: 2,
  mar: 2,
  april: 3,
  apr: 3,
  mei: 4,
  juni: 5,
  jun: 5,
  juli: 6,
  jul: 6,
  agustus: 7,
  agu: 7,
  agt: 7,
  september: 8,
  sept: 8,
  sep: 8,
  oktober: 9,
  okt: 9,
  november: 10,
  nov: 10,
  desember: 11,
  des: 11,
};

export const formatDateIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;

export const detectRequestedDate = (prompt: string): string | null => {
  const lower = prompt.toLowerCase();

  const nowJakarta = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
  );

  if (/(hari ini|today)\b/.test(lower)) {
    return formatDateIso(nowJakarta);
  }

  if (/(besok|besoknya|tomorrow)\b/.test(lower)) {
    const d = new Date(nowJakarta);
    d.setDate(d.getDate() + 1);
    return formatDateIso(d);
  }

  if (/(lusa|besok lusa|the day after tomorrow)\b/.test(lower)) {
    const d = new Date(nowJakarta);
    d.setDate(d.getDate() + 2);
    return formatDateIso(d);
  }

  if (/(kemarin|yesterday)\b/.test(lower)) {
    const d = new Date(nowJakarta);
    d.setDate(d.getDate() - 1);
    return formatDateIso(d);
  }

  if (/(selumbari|the day before yesterday)\b/.test(lower)) {
    const d = new Date(nowJakarta);
    d.setDate(d.getDate() - 2);
    return formatDateIso(d);
  }

  const isoMatch = lower.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(parsed.getTime())) return formatDateIso(parsed);
  }

  const dmyMatch = lower.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(parsed.getTime())) return formatDateIso(parsed);
  }

  const monthNameRegex =
    /\b(\d{1,2})\s+(januari|jan|febuari|februari|feb|maret|mar|april|apr|mei|juni|jun|juli|jul|agustus|agu|agt|september|sept|sep|oktober|okt|november|nov|desember|des)(?:\s+(\d{4}))?\b/;

  const dmyNameMatch = lower.match(monthNameRegex);
  if (dmyNameMatch) {
    const [, dStr, monthName, yearStr] = dmyNameMatch;
    const day = Number(dStr);
    const monthIndex = MONTHS_ID[monthName] ?? null;

    if (monthIndex !== null && !isNaN(day) && day >= 1 && day <= 31) {
      const year = yearStr ? Number(yearStr) : nowJakarta.getFullYear();
      const parsed = new Date(year, monthIndex, day);
      if (!isNaN(parsed.getTime())) {
        return formatDateIso(parsed);
      }
    }
  }

  return null;
};

export const buildCalendarUrl = (
  baseUrl: string,
  targetDate: string
): string => {
  if (/\/today\/?$/.test(baseUrl)) {
    return baseUrl.replace(/\/today\/?$/, `/${targetDate}`);
  }

  try {
    const url = new URL(baseUrl);
    url.searchParams.set("date", targetDate);
    return url.toString();
  } catch {
    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}date=${encodeURIComponent(targetDate)}`;
  }
};
