import type { CountryCode, Season, SeasonalRegionCode } from "@kitchen-pantry/shared-types";
import { seasonalRegions } from "@kitchen-pantry/shared-types";

/**
 * Where seasons are worked out from: hemisphere + a broad climate band.
 * US: from the first three digits of the ZIP (USPS state ranges) → state →
 * band. Australia: from the postcode's state digit. Everything else uses the
 * country, and the household can override it in settings.
 * This is deliberately coarse: it shifts season boundaries by a few weeks,
 * it does not claim to know a microclimate.
 */
export type Climate = "cold" | "temperate" | "warm";
export interface SeasonalRegion {
  hemisphere: "north" | "south";
  climate: Climate;
  /** What we based it on, for the settings screen. */
  basis: string;
  code: SeasonalRegionCode;
}

// USPS ZIP prefix ranges → state (first three digits, inclusive).
const ZIP3: Array<[number, number, string]> = [
  [5, 5, "NY"], [6, 9, "PR"], [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"], [50, 59, "VT"], [60, 69, "CT"],
  [70, 89, "NJ"], [100, 149, "NY"], [150, 196, "PA"], [197, 199, "DE"], [200, 205, "DC"], [206, 219, "MD"], [220, 246, "VA"],
  [247, 268, "WV"], [270, 289, "NC"], [290, 299, "SC"], [300, 319, "GA"], [320, 349, "FL"], [350, 369, "AL"], [370, 385, "TN"],
  [386, 397, "MS"], [398, 399, "GA"], [400, 427, "KY"], [430, 459, "OH"], [460, 479, "IN"], [480, 499, "MI"], [500, 528, "IA"],
  [530, 549, "WI"], [550, 567, "MN"], [570, 577, "SD"], [580, 588, "ND"], [590, 599, "MT"], [600, 629, "IL"], [630, 658, "MO"],
  [660, 679, "KS"], [680, 693, "NE"], [700, 714, "LA"], [716, 729, "AR"], [730, 749, "OK"], [750, 799, "TX"], [800, 816, "CO"],
  [820, 831, "WY"], [832, 838, "ID"], [840, 847, "UT"], [850, 865, "AZ"], [870, 884, "NM"], [885, 885, "TX"], [889, 898, "NV"],
  [900, 935, "CA-S"], [936, 961, "CA"], [967, 968, "HI"], [970, 979, "OR"], [980, 994, "WA"], [995, 999, "AK"],
];
const WARM = new Set(["FL", "HI", "PR", "TX", "LA", "AZ", "CA-S", "MS", "AL", "GA", "SC"]);
const COLD = new Set(["AK", "MN", "ND", "SD", "MT", "WY", "ME", "VT", "NH", "WI", "MI"]);

export function usState(zip: string): string | null {
  const m = /^(\d{3})/.exec(zip.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return ZIP3.find(([a, b]) => n >= a && n <= b)?.[2] ?? null;
}

const codeOf = (hemisphere: "north" | "south", climate: Climate): SeasonalRegionCode =>
  (hemisphere === "south" ? (climate === "warm" ? "south-warm" : "south-temperate") : `north-${climate}`) as SeasonalRegionCode;

export function regionFor(country: CountryCode, postalCode: string, override: SeasonalRegionCode | null = null): SeasonalRegion {
  if (override) {
    const r = seasonalRegions.find((x) => x.code === override)!;
    return { hemisphere: r.hemisphere, climate: r.climate as Climate, basis: "your setting", code: r.code };
  }
  if (country === "US") {
    const st = usState(postalCode);
    const climate: Climate = st && WARM.has(st) ? "warm" : st && COLD.has(st) ? "cold" : "temperate";
    const label = st ? st.replace("-S", "") : null;
    return { hemisphere: "north", climate, basis: label ? `ZIP ${postalCode.slice(0, 5)} (${label})` : "the United States", code: codeOf("north", climate) };
  }
  if (country === "AU") {
    const warm = /^[04]/.test(postalCode.trim()); // NT and Queensland
    const climate: Climate = warm ? "warm" : "temperate";
    return { hemisphere: "south", climate, basis: `postcode ${postalCode.trim()}`, code: codeOf("south", climate) };
  }
  if (country === "CA") return { hemisphere: "north", climate: "cold", basis: "Canada", code: "north-cold" };
  if (country === "GB") return { hemisphere: "north", climate: "temperate", basis: "the United Kingdom", code: "north-temperate" };
  return { hemisphere: "north", climate: "temperate", basis: "a general Northern Hemisphere calendar", code: "north-temperate" };
}

/** Season start dates (month 1–12, day) in the Northern Hemisphere by climate. */
const STARTS: Record<Climate, Record<Season, [number, number]>> = {
  warm: { spring: [2, 15], summer: [5, 15], fall: [10, 1], winter: [12, 15] },
  temperate: { spring: [3, 1], summer: [6, 1], fall: [9, 1], winter: [12, 1] },
  cold: { spring: [4, 1], summer: [6, 15], fall: [9, 1], winter: [11, 15] },
};
const ORDER: Season[] = ["spring", "summer", "fall", "winter"];
const SOUTH: Record<Season, Season> = { spring: "fall", summer: "winter", fall: "spring", winter: "summer" };

/** The season on a date (YYYY-MM-DD) for a region. Changes automatically with the calendar. */
export function seasonOn(date: string, region: Pick<SeasonalRegion, "hemisphere" | "climate">): Season {
  const [, m, d] = date.split("-").map(Number) as [number, number, number];
  const key = m * 100 + d;
  const starts = STARTS[region.climate];
  // Latest start on or before the date (wrapping around the new year).
  let current: Season = "winter";
  for (const s of ORDER) {
    const [sm, sd] = starts[s];
    if (key >= sm * 100 + sd) current = s;
  }
  return region.hemisphere === "south" ? SOUTH[current] : current;
}
