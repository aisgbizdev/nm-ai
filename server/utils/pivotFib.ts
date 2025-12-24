// src/app/api/nm-ai/utils/pivotFib.ts

import { num } from "./common";

export type FibMap = Record<string, number>;

// ================== PIVOT ==================

export function calcClassic({ H, L, C }: { H: number; L: number; C: number }) {
  const P = (H + L + C) / 3;
  return {
    P,
    R1: 2 * P - L,
    S1: 2 * P - H,
    R2: P + (H - L),
    S2: P - (H - L),
    R3: P + 2 * (H - L),
    S3: P - 2 * (H - L),
    R4: P + 3 * (H - L),
    S4: P - 3 * (H - L),
  } as const;
}

export function calcWoodie({ O, H, L }: { O: number; H: number; L: number }) {
  const P = (H + L + 2 * O) / 4;
  return {
    P,
    R1: 2 * P - L,
    S1: 2 * P - H,
    R2: P + (H - L),
    S2: P - (H - L),
    R3: H + 2 * (P - L),
    S3: L - 2 * (H - P),
    R4: P + 3 * (H - L),
    S4: P - 3 * (H - L),
  } as const;
}

export function calcCamarilla({
  H,
  L,
  C,
}: {
  H: number;
  L: number;
  C: number;
}) {
  const range = H - L;
  const k = 1.1;
  const R1 = C + (range * k) / 12;
  const R2 = C + (range * k) / 6;
  const R3 = C + (range * k) / 4;
  const R4 = C + (range * k) / 2;
  const S1 = C - (range * k) / 12;
  const S2 = C - (range * k) / 6;
  const S3 = C - (range * k) / 4;
  const S4 = C - (range * k) / 2;
  const P = (H + L + C) / 3;
  return { P, R1, R2, R3, R4, S1, S2, S3, S4 } as const;
}

// ================== FIBONACCI ==================

export function calcFibDown({ H, L }: { H: number; L: number }) {
  const D = H - L;

  const retr: FibMap = {
    "78.60%": L + D * 0.786,
    "61.80%": L + D * 0.618,
    "50.00%": L + D * 0.5,
    "38.20%": L + D * 0.382,
    "23.60%": L + D * 0.236,
  };

  const proj: FibMap = {
    "138.20%": L - D * 0.382,
    "150.00%": L - D * 0.5,
    "161.80%": L - D * 0.618,
    "200.00%": L - D * 1.0,
    "238.20%": L - D * 1.382,
    "261.80%": L - D * 1.618,
  };

  return { D, retr, proj } as const;
}

export function calcFibUp({ H, L }: { H: number; L: number }) {
  const D = H - L;

  const retr: FibMap = {
    "23.60%": H - D * 0.236,
    "38.20%": H - D * 0.382,
    "50.00%": H - D * 0.5,
    "61.80%": H - D * 0.618,
    "78.60%": H - D * 0.786,
  };

  const proj: FibMap = {
    "138.20%": H + D * 0.382,
    "150.00%": H + D * 0.5,
    "161.80%": H + D * 0.618,
    "200.00%": H + D * 1.0,
    "238.20%": H + D * 1.382,
    "261.80%": H + D * 1.618,
  };

  return { D, retr, proj } as const;
}

// ================== PARSER OHLC / HIGH-LOW DARI PROMPT ==================

export function parseHighLowForFib(
  text: string
): { H: number; L: number } | null {
  const lower = text.toLowerCase();

  const highMatch = lower.match(/(high|h)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i);
  const lowMatch = lower.match(/(low|l)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i);

  let H: number | null = null;
  let L: number | null = null;

  if (highMatch) {
    H = num(highMatch[2]);
  }
  if (lowMatch) {
    L = num(lowMatch[2]);
  }

  if (H != null && L != null && isFinite(H) && isFinite(L)) {
    const hi = Math.max(H, L);
    const lo = Math.min(H, L);
    return { H: hi, L: lo };
  }

  const allNums = text.match(/-?\d+(?:[.,]\d+)?/g);
  if (allNums && allNums.length >= 2) {
    const a = num(allNums[0]);
    const b = num(allNums[1]);
    if (isFinite(a) && isFinite(b)) {
      const hi = Math.max(a, b);
      const lo = Math.min(a, b);
      return { H: hi, L: lo };
    }
  }

  return null;
}

export function parseOHLCFromPrompt(text: string): {
  O: number;
  H: number;
  L: number;
  C: number;
} | null {
  const lower = text.toLowerCase();

  const oMatch = lower.match(/(open|o)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i);
  const hMatch = lower.match(/(high|h)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i);
  const lMatch = lower.match(/(low|l)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i);
  const cMatch = lower.match(/(close|c)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i);

  let O = oMatch ? num(oMatch[2]) : NaN;
  let H = hMatch ? num(hMatch[2]) : NaN;
  let L = lMatch ? num(lMatch[2]) : NaN;
  let C = cMatch ? num(cMatch[2]) : NaN;

  if ([O, H, L, C].every((v) => isFinite(v))) {
    return { O, H, L, C };
  }

  const numsFound = text.match(/-?\d+(?:[.,]\d+)?/g);
  if (numsFound && numsFound.length >= 4) {
    const nn = numsFound.slice(0, 4).map(num);
    if (nn.every((v) => isFinite(v))) {
      return { O: nn[0], H: nn[1], L: nn[2], C: nn[3] };
    }
  }

  return null;
}
