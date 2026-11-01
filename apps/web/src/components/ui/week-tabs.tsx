"use client";

import { addDays, startOfWeek } from "@kitchen-pantry/meal-planner";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";

function localIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rangeLabel(weekStart: string): string {
  const fmt = (iso: string, withMonth: boolean) => {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y!, m! - 1, d!);
    return withMonth
      ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : String(date.getDate());
  };
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.slice(0, 7) === end.slice(0, 7);
  return `${fmt(weekStart, true)}–${fmt(end, !sameMonth)}`;
}

export interface WeekOption {
  weekStart: string;
  label: string;
}

/** This week, next week and two more — horizontally scrollable on phones. */
export function useWeekOptions(today = new Date()): WeekOption[] {
  const todayIso = localIsoDate(today);
  return useMemo(() => {
    const thisWeek = startOfWeek(todayIso);
    return [0, 1, 2, 3].map((i) => {
      const weekStart = addDays(thisWeek, i * 7);
      const label = i === 0 ? "This week" : i === 1 ? "Next week" : rangeLabel(weekStart);
      return { weekStart, label };
    });
  }, [todayIso]);
}

export function WeekTabs({ onChange }: { onChange?: (week: WeekOption) => void }) {
  const weeks = useWeekOptions();
  const [selected, setSelected] = useState(0);
  return (
    <div
      role="tablist"
      aria-label="Week"
      className="-mx-4 mb-6 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0"
    >
      {weeks.map((week, i) => (
        <button
          key={week.weekStart}
          role="tab"
          type="button"
          aria-selected={i === selected}
          title={rangeLabel(week.weekStart)}
          suppressHydrationWarning
          onClick={() => {
            setSelected(i);
            onChange?.(week);
          }}
          className={cn(
            "min-h-11 shrink-0 rounded-full border px-5 text-[16px] font-medium transition-[border-color,box-shadow]",
            i === selected
              ? "border-foreground shadow-[inset_0_0_0_1px_rgb(var(--kp-foreground))]"
              : "border-border hover:border-subtle",
          )}
        >
          {week.label}
        </button>
      ))}
    </div>
  );
}
