"use client";

import type { DayAttendance } from "@kitchen-pantry/meal-planner";
import { Minus, Plus, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";

/** "I'm in / I'm out", who else is eating, and guests — for one night. */
export function EatingControls({
  att,
  onEating,
  onGuests,
  dayName,
}: {
  att: DayAttendance;
  dayName: string;
  onEating: (eating: boolean | null) => void;
  onGuests: (guests: number) => void;
}) {
  const youIn = att.you !== false;
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label={`Are you eating ${dayName}?`} className="flex rounded-full bg-surface-strong p-1">
        {[
          { v: true, label: "I'm in" },
          { v: false, label: "I'm out" },
        ].map((o) => (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={youIn === o.v}
            onClick={() => onEating(o.v ? null : false)}
            className={cn("min-h-11 flex-1 rounded-full text-[15px] font-medium", youIn === o.v ? "bg-background font-semibold shadow-sm" : "text-muted")}
          >
            {o.label}
          </button>
        ))}
      </div>

      <ul className="flex flex-wrap gap-2" aria-label="Household">
        {[...att.eating, ...att.out].map((m) => {
          const out = att.out.includes(m);
          return (
            <li key={m.userId} className={cn("rounded-full px-3 py-1 text-[14px] font-medium", out ? "bg-surface-strong text-muted line-through" : "bg-accent-soft text-foreground")}>
              {m.isYou ? "You" : m.name}
              {m.portion !== 1 ? <span className="ml-1 text-muted no-underline">×{m.portion}</span> : null}
              <span className="sr-only">{out ? " (out)" : " (eating)"}</span>
            </li>
          );
        })}
        {att.others > 0 ? <li className="rounded-full bg-accent-soft px-3 py-1 text-[14px] font-medium">+{plural(att.others, "other")} at home</li> : null}
      </ul>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[16px] font-medium">Guests</span>
        <div className="flex items-center gap-2" role="group" aria-label={`Guests ${dayName}`}>
          <button type="button" aria-label="One fewer guest" disabled={att.guests <= 0} onClick={() => onGuests(att.guests - 1)} className="grid size-10 place-items-center rounded-full border border-border disabled:opacity-35">
            <Minus className="size-4" aria-hidden />
          </button>
          <span className="min-w-6 text-center text-[17px] font-semibold tabular-nums" aria-live="polite">
            {att.guests}
          </span>
          <button type="button" aria-label="One more guest" disabled={att.guests >= 20} onClick={() => onGuests(att.guests + 1)} className="grid size-10 place-items-center rounded-full border border-border disabled:opacity-35">
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

/** One line under a dinner: how many are eating, and a one-tap fix when servings don't match. */
export function EatingLine({
  att,
  servings,
  dayName,
  busy,
  onOpen,
  onUseServings,
}: {
  att: DayAttendance;
  servings: number;
  dayName: string;
  busy: boolean;
  onOpen: () => void;
  onUseServings: (n: number) => void;
}) {
  const differs = att.servings > 0 && att.servings !== servings;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px]">
      <button type="button" onClick={onOpen} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-background px-3 font-medium hover:bg-surface-strong" aria-label={`Who's eating ${dayName}: ${att.servings === 0 ? "nobody" : plural(att.servings, "serving")} needed. Change`}>
        <Users className="size-4 text-muted" aria-hidden />
        {att.servings === 0 ? "Nobody's eating" : `${plural(att.servings, "serving")} needed`}
        {att.summary && att.summary !== "Everyone's in" ? <span className="text-muted">· {att.summary}</span> : null}
      </button>
      {differs ? (
        <button type="button" disabled={busy} onClick={() => onUseServings(att.servings)} className="font-semibold text-accent underline decoration-accent/40 underline-offset-4 disabled:opacity-50">
          Use {att.servings}
        </button>
      ) : null}
    </div>
  );
}
