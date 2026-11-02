import type { CountryCode, HolidayCode } from "@kitchen-pantry/shared-types";
import { holidays } from "@kitchen-pantry/shared-types";

/**
 * Holiday dates. Fixed and rule-based dates are computed; holidays that
 * follow lunar or lunisolar calendars come from a checked table (see
 * MOVING_DATES) and are shown as "around" when they depend on moon sighting.
 * Households opt in to the ones they celebrate — none are on by default.
 */
export interface HolidayDate {
  code: HolidayCode;
  label: string;
  /** YYYY-MM-DD */
  start: string;
  end: string | null;
  approximate: boolean;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const dow = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday

/** The n-th given weekday of a month (n = 1…5). */
function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  const first = dow(y, m, 1);
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return iso(y, m, day);
}

/** Western Easter Sunday (anonymous Gregorian algorithm). */
export function easter(y: number): string {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, month, day);
}

const addDays = (date: string, n: number) => {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

/**
 * Lunar / lunisolar holidays: first day (and last day when multi-day).
 * Filled from published calendars — see the source notes beside each.
 */
export const MOVING_DATES: Partial<Record<HolidayCode, Record<number, [string, string | null, boolean]>>> = {
  // Hong Kong Observatory almanac (hko.gov.hk/en/gts/time/calendar), matches Wikipedia.
  "lunar-new-year": {
    2026: ["2026-02-17", null, false],
    2027: ["2027-02-06", null, false],
    2028: ["2028-01-26", null, false],
    2029: ["2029-02-13", null, false],
    2030: ["2030-02-03", null, false],
  },
  // Hebcal (computed from the fixed Hebrew calendar). First full day; the
  // evening before is the first Seder / first candle / start of the holiday.
  passover: {
    2026: ["2026-04-02", "2026-04-09", false],
    2027: ["2027-04-22", "2027-04-29", false],
    2028: ["2028-04-11", "2028-04-18", false],
    2029: ["2029-03-31", "2029-04-07", false],
    2030: ["2030-04-18", "2030-04-25", false],
  },
  "rosh-hashanah": {
    2026: ["2026-09-12", "2026-09-13", false],
    2027: ["2027-10-02", "2027-10-03", false],
    2028: ["2028-09-21", "2028-09-22", false],
    2029: ["2029-09-10", "2029-09-11", false],
    2030: ["2030-09-28", "2030-09-29", false],
  },
  hanukkah: {
    2026: ["2026-12-05", "2026-12-12", false],
    2027: ["2027-12-25", "2028-01-01", false],
    2028: ["2028-12-13", "2028-12-20", false],
    2029: ["2029-12-02", "2029-12-09", false],
    2030: ["2030-12-21", "2030-12-28", false],
  },
  // Lakshmi Puja (Drik Panchang, New Delhi; timeanddate India / dekhopanchang agree).
  diwali: {
    2026: ["2026-11-08", null, false],
    2027: ["2027-10-29", null, false],
    2028: ["2028-10-17", null, false],
    2029: ["2029-11-05", null, false],
    2030: ["2030-10-26", null, false],
  },
  // Expected dates; the real day depends on the moon sighting. Where published
  // calendars (Umm al-Qura, moonsighting.com, timeanddate) disagree, the row
  // spans the earliest to the latest published date and is shown as "around".
  "eid-al-fitr": {
    2026: ["2026-03-20", null, true],
    2027: ["2027-03-09", "2027-03-10", true],
    2028: ["2028-02-26", "2028-02-27", true],
    2029: ["2029-02-14", "2029-02-15", true],
    2030: ["2030-02-03", "2030-02-05", true],
  },
  "eid-al-adha": {
    2026: ["2026-05-27", null, true],
    2027: ["2027-05-16", "2027-05-17", true],
    2028: ["2028-05-05", null, true],
    2029: ["2029-04-24", null, true],
    2030: ["2030-04-13", "2030-04-14", true],
  },
};

export function holidayDate(code: HolidayCode, year: number, country: CountryCode = "US"): HolidayDate | null {
  const label = holidays.find((h) => h.code === code)?.label ?? code;
  const fixed = (m: number, d: number): HolidayDate => ({ code, label, start: iso(year, m, d), end: null, approximate: false });
  switch (code) {
    case "new-year":
      return fixed(1, 1);
    case "valentines":
      return fixed(2, 14);
    case "easter":
      return { code, label, start: easter(year), end: null, approximate: false };
    case "mothers-day":
      // UK: Mothering Sunday, three weeks before Easter. US/CA/AU: 2nd Sunday of May.
      return { code, label, start: country === "GB" ? addDays(easter(year), -21) : nthWeekday(year, 5, 0, 2), end: null, approximate: false };
    case "fathers-day":
      return { code, label, start: country === "AU" ? nthWeekday(year, 9, 0, 1) : nthWeekday(year, 6, 0, 3), end: null, approximate: false };
    case "canada-day":
      return fixed(7, 1);
    case "july-4th":
      return fixed(7, 4);
    case "halloween":
      return fixed(10, 31);
    case "thanksgiving-ca":
      return { code, label, start: nthWeekday(year, 10, 1, 2), end: null, approximate: false };
    case "thanksgiving":
      return { code, label, start: nthWeekday(year, 11, 4, 4), end: null, approximate: false };
    case "christmas":
      return fixed(12, 25);
    default: {
      const row = MOVING_DATES[code]?.[year];
      return row ? { code, label, start: row[0], end: row[1], approximate: row[2] } : null;
    }
  }
}

/** Opted-in holidays that start (or are under way) within `days` days of `from`. */
export function upcomingHolidays(optIns: readonly HolidayCode[], from: string, days: number, country: CountryCode = "US"): HolidayDate[] {
  const to = addDays(from, days);
  const year = Number(from.slice(0, 4));
  const out: HolidayDate[] = [];
  for (const code of optIns) {
    for (const y of [year - 1, year, year + 1]) {
      const h = holidayDate(code, y, country);
      if (!h) continue;
      const end = h.end ?? h.start;
      if (h.start <= to && end >= from) out.push(h);
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
