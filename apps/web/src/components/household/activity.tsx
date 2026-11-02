"use client";

import { startOfWeek, type ActivityItem } from "@kitchen-pantry/meal-planner";
import { CalendarCheck, Carrot, ListChecks, Receipt, ShoppingCart, Sparkles, Star, Trash2 } from "lucide-react";
import { Card, Eyebrow, Hint } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { useActivity, useAttendance } from "@/lib/household/use-household-life";

const ICONS: Record<ActivityItem["kind"], typeof Carrot> = {
  pantry_added: Carrot,
  pantry_consumed: Carrot,
  pantry_discarded: Trash2,
  pantry_expired: Trash2,
  grocery_added: ListChecks,
  grocery_checked: ShoppingCart,
  rated: Star,
  cart_ordered: ShoppingCart,
  shop_logged: Receipt,
  plan_confirmed: CalendarCheck,
  plan_drafted: Sparkles,
};

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** What the household has been up to, from records that already exist. */
export function ActivityCard() {
  const a = useActivity(25);
  return (
    <Card>
      <Eyebrow>Recent activity</Eyebrow>
      {a.error ? (
        <p role="alert" className="mt-3 text-[15px] text-danger">
          {a.error}
        </p>
      ) : a.items === null ? (
        <div className="mt-3 space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-xl bg-surface-strong" />
          ))}
        </div>
      ) : a.items.length === 0 ? (
        <p className="mt-3 text-[15px] text-muted">Nothing yet. Adding to the kitchen, ticking off groceries and rating dinners will show up here for everyone.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {a.items.map((item, i) => {
            const Icon = ICONS[item.kind];
            return (
              <li key={`${item.at}-${i}`} className="flex items-start gap-3 py-1.5">
                <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", item.isYou ? "bg-surface-strong" : "bg-accent-soft")}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-[15px] leading-snug">
                  {item.text}
                  <span className="block text-[13px] text-muted">{when(item.at)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Hint className="mt-3">Only people in this household can see this.</Hint>
    </Card>
  );
}

const PORTIONS = [
  { value: 0.5, label: "Small", hint: "about half a serving" },
  { value: 0.75, label: "Light", hint: "¾ of a serving" },
  { value: 1, label: "Usual", hint: "one serving" },
  { value: 1.5, label: "Hearty", hint: "1½ servings" },
  { value: 2, label: "Big", hint: "two servings" },
];

/** Just you: how much you usually eat, so "servings needed" is right on nights you're in or out. */
export function PortionCard() {
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const e = useAttendance(startOfWeek(today));
  const current = e.you?.portion ?? 1;
  return (
    <Card>
      <Eyebrow>Your usual portion</Eyebrow>
      <p className="mt-1.5 text-[15px] text-muted">Only you can change this. It&apos;s used to suggest servings when people are in or out.</p>
      <div role="radiogroup" aria-label="Your usual portion" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PORTIONS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={current === p.value}
            onClick={() => void e.setPortion(p.value)}
            disabled={!e.you}
            className={cn(
              "rounded-control border p-3 text-left disabled:opacity-50",
              current === p.value ? "border-foreground shadow-[inset_0_0_0_1px_rgb(var(--kp-foreground))]" : "border-border hover:border-subtle",
            )}
          >
            <span className="block text-[15px] font-semibold">{p.label}</span>
            <span className="block text-[13px] text-muted">{p.hint}</span>
          </button>
        ))}
      </div>
      {e.error ? (
        <p role="alert" className="mt-3 text-[15px] text-danger">
          {e.error}
        </p>
      ) : null}
    </Card>
  );
}
