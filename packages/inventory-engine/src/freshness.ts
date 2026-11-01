import type { IsoDate } from "@kitchen-pantry/shared-types";

/**
 * "Use It Before You Lose It" urgency. This is based ONLY on dates the user
 * entered. It never declares food safe — appearance or smell are not proof
 * of safety, and nothing past its use-by date is suggested to reduce waste.
 */
export type Urgency = "past_date" | "today" | "soon" | "this_week" | "later" | "unknown";

export interface UrgencyResult {
  urgency: Urgency;
  daysLeft: number | null;
  /** Whether recipes may use this item. False once the date has passed. */
  usable: boolean;
  message: string;
}

const MS_PER_DAY = 86_400_000;

function parseIsoDate(value: IsoDate): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError(`Expected YYYY-MM-DD, received "${value}"`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIsoDate(to) - parseIsoDate(from)) / MS_PER_DAY);
}

export function assessUrgency(useBy: IsoDate | null, today: IsoDate): UrgencyResult {
  if (!useBy) {
    return {
      urgency: "unknown",
      daysLeft: null,
      usable: true,
      message: "No date entered — add one so we can remind you in time.",
    };
  }
  const daysLeft = daysBetween(today, useBy);
  if (daysLeft < 0) {
    return {
      urgency: "past_date",
      daysLeft,
      usable: false,
      message: "Past its use-by date. We won't plan meals around it.",
    };
  }
  if (daysLeft === 0) {
    return { urgency: "today", daysLeft, usable: true, message: "Use today." };
  }
  if (daysLeft <= 2) {
    return { urgency: "soon", daysLeft, usable: true, message: `Use within ${daysLeft} day${daysLeft === 1 ? "" : "s"}.` };
  }
  if (daysLeft <= 6) {
    return { urgency: "this_week", daysLeft, usable: true, message: "Use this week." };
  }
  return { urgency: "later", daysLeft, usable: true, message: "Plenty of time." };
}

const ORDER: Record<Urgency, number> = {
  today: 0,
  soon: 1,
  this_week: 2,
  unknown: 3,
  later: 4,
  past_date: 5,
};

/** Most urgent usable items first; past-date items sink to the bottom. */
export function sortByUrgency<T extends { useBy: IsoDate | null }>(items: T[], today: IsoDate): T[] {
  return [...items].sort((a, b) => {
    const ua = assessUrgency(a.useBy, today);
    const ub = assessUrgency(b.useBy, today);
    return ORDER[ua.urgency] - ORDER[ub.urgency] || (ua.daysLeft ?? 99) - (ub.daysLeft ?? 99);
  });
}
