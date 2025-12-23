// src/app/api/nm-ai/utils/common.ts

// Konversi ke number aman
export const num = (v: any): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return isNaN(n) ? NaN : n;
  }
  return NaN;
};

// Optional: formatter harga (kalau perlu)
export const formatPrice = (v: number): string => {
  if (!isFinite(v)) return "-";
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 0 : abs >= 100 ? 1 : 2;
  return v.toLocaleString("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

// Konversi content history ke plain text
export const toText = (content: any): string => {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === "string") return c;
        if (c?.text) return c.text;
        if (typeof c === "object" && (c as any).type && (c as any).value)
          return (c as any).value;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  if (content && typeof content === "object") {
    if ((content as any).text) return (content as any).text;
    return JSON.stringify(content);
  }

  return "";
};
