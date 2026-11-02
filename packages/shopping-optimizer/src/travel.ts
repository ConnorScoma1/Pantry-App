import { WEEKDAYS, type StoreHours } from "@kitchen-pantry/grocery-pricing";
import type { LatLng, ShoppingSettings, ShoppingStore, TravelMatrix, TripLeg, TripTravel } from "./types";

/**
 * Travel cost and route order. Distances and drive times come only from a
 * routing provider's matrix; this file adds them up, orders the stops and
 * applies the shopper's own fuel price, mpg and value of time. With no
 * matrix there is no travel figure — nothing is estimated from a map.
 */

export const METERS_PER_MILE = 1609.344;

export const miles = (meters: number) => meters / METERS_PER_MILE;

/** Fuel for a distance at the shopper's price and mpg; null when either isn't set. */
export function fuelCostCents(meters: number, settings: Pick<ShoppingSettings, "fuelCentsPerGallon" | "milesPerGallon">): number | null {
  const { fuelCentsPerGallon: price, milesPerGallon: mpg } = settings;
  if (price === null || mpg === null || !(price > 0) || !(mpg > 0)) return null;
  return Math.round((miles(meters) / mpg) * price);
}

/** Time cost at the shopper's value of time. */
export function timeCostCents(minutes: number, centsPerHour: number): number {
  return Math.round((minutes / 60) * Math.max(0, centsPerHour));
}

/** Straight-line distance, used only to keep stores inside the chosen radius — never as a drive distance. */
export function straightLineMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  items.forEach((x, i) => {
    for (const rest of permutations([...items.slice(0, i), ...items.slice(i + 1)])) out.push([x, ...rest]);
  });
  return out;
}

const indexOf = (m: TravelMatrix, key: string | "start") => (key === "start" ? 0 : m.storeKeys.indexOf(key) + 1);

function leg(m: TravelMatrix, from: string, to: string): TripLeg | null {
  const i = indexOf(m, from);
  const j = indexOf(m, to);
  if ((from !== "start" && i === 0) || (to !== "start" && j === 0)) return null;
  const s = m.seconds[i]?.[j];
  const d = m.meters[i]?.[j];
  if (s === null || s === undefined || d === null || d === undefined || !Number.isFinite(s) || !Number.isFinite(d) || s < 0 || d < 0) return null;
  return { from, to, seconds: s, meters: d };
}

/**
 * Best visiting order for a set of stores (at most 4, so every order is
 * tried): least drive time, then least distance. Null when any needed leg
 * is unroutable or the store isn't in the matrix.
 */
export function orderStops(storeKeys: readonly string[], matrix: TravelMatrix, returnHome: boolean): { order: string[]; legs: TripLeg[]; meters: number; seconds: number } | null {
  let best: { order: string[]; legs: TripLeg[]; meters: number; seconds: number } | null = null;
  for (const order of permutations(storeKeys)) {
    const path = ["start", ...order, ...(returnHome ? ["start"] : [])];
    const legs: TripLeg[] = [];
    let ok = true;
    for (let i = 0; i < path.length - 1; i++) {
      const l = leg(matrix, path[i]!, path[i + 1]!);
      if (!l) {
        ok = false;
        break;
      }
      legs.push(l);
    }
    if (!ok) continue;
    const seconds = legs.reduce((s, l) => s + l.seconds, 0);
    const meters = legs.reduce((s, l) => s + l.meters, 0);
    if (!best || seconds < best.seconds || (seconds === best.seconds && meters < best.meters)) best = { order, legs, meters, seconds };
  }
  return best;
}

export function tripTravel(storeKeys: readonly string[], matrix: TravelMatrix, settings: ShoppingSettings): { order: string[]; travel: TripTravel } | null {
  const r = orderStops(storeKeys, matrix, settings.returnHome);
  if (!r) return null;
  const totalMinutes = Math.round(r.seconds / 60) + Math.max(0, settings.minutesPerStop) * storeKeys.length;
  return {
    order: r.order,
    travel: {
      provider: matrix.provider,
      isSample: matrix.isSample,
      legs: r.legs,
      meters: r.meters,
      driveSeconds: r.seconds,
      totalMinutes,
      fuelCents: fuelCostCents(r.meters, settings),
    },
  };
}

// ---------------------------------------------------------------------------
// Store hours
// ---------------------------------------------------------------------------
const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Weekday and minutes past midnight at `at`, in the store's time zone. */
function localTime(at: Date, timezone: string | null): { day: (typeof WEEKDAYS)[number]; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone ?? undefined, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const day = get("weekday").toLowerCase() as (typeof WEEKDAYS)[number];
    if (!WEEKDAYS.includes(day)) return null;
    return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
  } catch {
    return null;
  }
}

/** Open at that moment? null when the store's hours for that day aren't known. */
export function isOpenAt(hours: StoreHours | null, at: Date): boolean | null {
  if (!hours) return null;
  if (hours.open24) return true;
  if (!hours.timezone) return null;
  const t = localTime(at, hours.timezone);
  if (!t) return null;
  const today = hours.days[t.day];
  if (today === undefined) return null;
  if (today === null) return false;
  if (today.open24) return true;
  const open = toMinutes(today.open);
  const close = toMinutes(today.close);
  if (close <= open) return t.minutes >= open || t.minutes < close; // closes after midnight
  return t.minutes >= open && t.minutes < close;
}

/** Today's hours as text, e.g. "6:00 am–11:00 pm", or null. */
export function hoursToday(hours: StoreHours | null, at: Date): string | null {
  if (!hours) return null;
  if (hours.open24) return "Open 24 hours";
  const t = localTime(at, hours.timezone);
  const d = t ? hours.days[t.day] : undefined;
  if (!d) return d === null ? "Closed today" : null;
  if (d.open24) return "Open 24 hours";
  const fmt = (hhmm: string) => {
    const m = toMinutes(hhmm) % 1440;
    const h = Math.floor(m / 60);
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  };
  return `${fmt(d.open)}–${fmt(d.close)}`;
}

/** Arrival time at each stop: start time + drive legs + in-store minutes at earlier stops. */
export function arrivals(travel: TripTravel, departAt: Date, minutesPerStop: number): Date[] {
  const out: Date[] = [];
  let t = departAt.getTime();
  for (let i = 0; i < travel.legs.length; i++) {
    const l = travel.legs[i]!;
    t += l.seconds * 1000;
    if (l.to === "start") break;
    out.push(new Date(t));
    t += minutesPerStop * 60_000;
  }
  return out;
}

export function storeOpenNote(store: ShoppingStore, arrival: Date, minutesPerStop: number): { open: boolean | null; note: string | null } {
  const open = isOpenAt(store.hours, arrival);
  if (open === null) return { open, note: null };
  if (!open) return { open, note: `${store.name} looks closed when you'd arrive` };
  const stillOpen = isOpenAt(store.hours, new Date(arrival.getTime() + minutesPerStop * 60_000));
  if (stillOpen === false) return { open, note: `${store.name} closes soon after you'd arrive` };
  return { open, note: null };
}
