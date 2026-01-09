// src/utils/fa.ts
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

// 🔹 SOLID (fas)
import {
  faClone as fasClone,
  faPlay,
  faStop,
  faRotateRight,
  faMoon,
  faArrowUpFromBracket,
  faTriangleExclamation,
  faAngleDown,
  faAngleLeft,
} from "@fortawesome/free-solid-svg-icons";

// 🔹 REGULAR (far)
import { faClone as farClone } from "@fortawesome/free-regular-svg-icons";

/**
 * Map helper: byPrefixAndName[prefix][name]
 *
 * prefix:
 *  - "fas" = Font Awesome Solid
 *  - "far" = Font Awesome Regular
 *
 * name:
 *  - pakai nama icon-nya (kebab-case) atau nama bebas yang elu mau,
 *    yang penting konsisten sama yang dipanggil di komponen.
 */
export const byPrefixAndName: Record<
  "fas" | "far",
  Record<string, IconDefinition>
> = {
  fas: {
    // 💾 yang dipakai di ChatMessages & kemungkinan reuse
    clone: fasClone,
    play: faPlay,
    stop: faStop,
    "triangle-exclamation": faTriangleExclamation,
    "rotate-right": faRotateRight,
    "arrow-up-from-bracket": faArrowUpFromBracket,
    "angle-down": faAngleDown,
    "fa-solid fa-moon": faMoon,
    faAngleLeft: faAngleLeft,
  },
  far: {
    // versi regular buat code-block header:
    clone: farClone,
    "triangle-exclamation": faTriangleExclamation,
  },
};

/**
 * Optional helper kalau mau lebih fleksibel:
 *
 *  getFaIcon("far", "clone")
 *  getFaIcon("fas", "play")
 */
export function getFaIcon(
  prefix: "fas" | "far",
  name: string
): IconDefinition | undefined {
  return byPrefixAndName[prefix]?.[name];
}
