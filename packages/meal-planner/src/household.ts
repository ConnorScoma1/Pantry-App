import type { ActivityEvent, ActivityKind, AttendanceData, AttendanceMember, IsoDate } from "@kitchen-pantry/shared-types";

/**
 * Shared household, part 2: who's eating tonight and the household's
 * recent activity. Pure functions shared by web and mobile.
 */

export interface DayAttendance {
  day: IsoDate;
  eating: AttendanceMember[];
  out: AttendanceMember[];
  /** Your own answer: true/false, or null when you haven't said (counts as eating). */
  you: boolean | null;
  guests: number;
  /** People the household cooks for who don't have an account here (children, etc.). */
  others: number;
  /** Suggested servings: everyone eating × their portion, plus others and guests, rounded up. */
  servings: number;
  /** Plain summary, e.g. "Sam's out · 2 guests". */
  summary: string;
}

/** Nobody answered = everyone eats; only an explicit "out" removes someone. */
export function dayAttendance(data: AttendanceData, day: IsoDate, cookingFor: number): DayAttendance {
  const answers = new Map(data.answers.filter((a) => a.day === day).map((a) => [a.userId, a.eating] as const));
  const eating = data.members.filter((m) => answers.get(m.userId) !== false);
  const out = data.members.filter((m) => answers.get(m.userId) === false);
  const guests = data.guests.find((g) => g.day === day)?.guests ?? 0;
  const others = Math.max(0, Math.round(cookingFor) - data.members.length);
  const me = data.members.find((m) => m.isYou);
  const raw = eating.reduce((sum, m) => sum + m.portion, 0) + others + guests;
  const servings = Math.max(0, Math.ceil(raw - 1e-9));
  const name = (m: AttendanceMember) => (m.isYou ? "You" : m.name);
  const parts: string[] = [];
  if (out.length === 0) parts.push(data.members.length > 1 ? "Everyone's in" : "");
  else if (eating.length === 0 && others === 0) parts.push("Nobody's in");
  else parts.push(`${listNames(out.map(name))} ${out.length === 1 && !out[0]!.isYou ? "is" : "are"} out`);
  if (guests > 0) parts.push(`${guests} guest${guests === 1 ? "" : "s"}`);
  return {
    day,
    eating,
    out,
    you: me ? (answers.has(me.userId) ? answers.get(me.userId)! : null) : null,
    guests,
    others,
    servings,
    summary: parts.filter(Boolean).join(" · "),
  };
}

function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------
export interface ActivityItem {
  kind: ActivityKind;
  at: string;
  /** Plain sentence, e.g. "Sam used up baby spinach". */
  text: string;
  isYou: boolean;
  count: number;
}

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
function weekLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "a week";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

function things(subjects: readonly string[], noun = "items"): string {
  if (subjects.length === 1) return subjects[0]!.toLowerCase();
  if (subjects.length === 2) return `${subjects[0]!.toLowerCase()} and ${subjects[1]!.toLowerCase()}`;
  return `${subjects.length} ${noun}`;
}

function sentence(kind: ActivityKind, actor: string, group: readonly ActivityEvent[]): string {
  const subjects = [...group].reverse().map((e) => e.subject); // in the order they happened
  const first = group[0]!;
  switch (kind) {
    case "pantry_added":
      return `${actor} added ${things(subjects)} to the kitchen`;
    case "pantry_consumed":
      return `${actor} used up ${things(subjects)}`;
    case "pantry_discarded":
    case "pantry_expired":
      return `${actor} threw out ${things(subjects)}`;
    case "grocery_added":
      return group.every((e) => e.detail === "plan") && group.length > 2
        ? `${actor} added ${group.length} items from the meal plan to the grocery list`
        : `${actor} added ${things(subjects)} to the grocery list`;
    case "grocery_checked":
      return `${actor} picked up ${things(subjects)}`;
    case "rated": {
      const stars = Number(first.detail);
      return `${actor} rated ${first.subject}${Number.isFinite(stars) ? ` ${stars}★` : ""}`;
    }
    case "cart_ordered":
      return `${actor} placed an order at ${first.subject}`;
    case "shop_logged": {
      const cents = Number(first.detail);
      return `${actor} logged a ${Number.isFinite(cents) ? `${money(cents)} ` : ""}shop at ${first.subject}`;
    }
    case "plan_confirmed":
      return `The week of ${weekLabel(first.subject)} was confirmed`;
    case "plan_drafted":
      return `Kitchen Pantry drafted the week of ${weekLabel(first.subject)}`;
  }
}

/** Newest first; runs of the same thing by the same person within 10 minutes become one line. */
export function summarizeActivity(events: readonly ActivityEvent[], max = 30): ActivityItem[] {
  const sorted = [...events].sort((a, b) => b.at.localeCompare(a.at));
  const out: ActivityItem[] = [];
  let group: ActivityEvent[] = [];
  const flush = () => {
    if (group.length === 0) return;
    const first = group[0]!;
    const groupable = first.kind !== "rated" && first.kind !== "cart_ordered" && first.kind !== "shop_logged" && !first.kind.startsWith("plan_");
    const parts = groupable ? [group] : group.map((e) => [e]);
    for (const g of parts) {
      const e = g[0]!;
      out.push({ kind: e.kind, at: e.at, text: sentence(e.kind, e.actorName ?? "Someone", g), isYou: e.isYou, count: g.length });
    }
    group = [];
  };
  for (const e of sorted) {
    const last = group[group.length - 1];
    if (last && last.kind === e.kind && last.actorName === e.actorName && Date.parse(last.at) - Date.parse(e.at) <= 10 * 60_000) group.push(e);
    else {
      flush();
      group = [e];
    }
  }
  flush();
  return out.slice(0, max);
}
