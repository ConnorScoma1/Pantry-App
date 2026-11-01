"use client";

import {
  addCustomMeal,
  addDessert,
  removeDessert,
  setDessertServings,
  moveMeal,
  nightsLeft,
  removeMeal,
  repeatWeek,
  replaceMeal,
  setServings,
  toggleLock,
  weekDates,
  type PlanDraft,
} from "@kitchen-pantry/meal-planner";
import { planningModes, type MealPlan, type PlanningMode } from "@kitchen-pantry/shared-types";
import { CalendarCheck, ChevronDown, History, ShoppingBasket, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { DessertsSection } from "@/components/plan/desserts";
import { dayLabel, EmptyNight, MealCard } from "@/components/plan/meal-card";
import { useProfile } from "@/components/profile/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { ChoiceCard, TextInput } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { useWeekOptions, WeekTabs } from "@/components/ui/week-tabs";
import { cn } from "@/lib/cn";
import { useMealPlan } from "@/lib/meal-plan/use-meal-plan";
import { PlanSettings } from "./plan-settings";

const MODES = planningModes;

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function PlanView() {
  const weeks = useWeekOptions();
  // Late in the week (e.g. Sunday), start on next week — that's the one to plan.
  const startIndex = nightsLeft(weeks[0]!.weekStart, localToday()) < 2 ? 1 : 0;
  const [weekStart, setWeekStart] = useState(weeks[startIndex]!.weekStart);
  return (
    <div className="animate-enter">
      <PageHeader
        title="Meal Plan"
        subtitle="Dinners for the week, built around your household, your kitchen and what needs using up."
        action={
          <Link
            href="/recipes"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border px-5 text-[15px] font-semibold hover:bg-surface"
          >
            Browse recipes
          </Link>
        }
      />
      <WeekTabs initialIndex={startIndex} onChange={(w) => setWeekStart(w.weekStart)} />
      <WeekPlanner key={weekStart} weekStart={weekStart} />
      <details className="group mt-10">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-1 text-[17px] font-semibold">
          Planning settings
          <ChevronDown className="size-5 text-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <p className="mb-4 px-1 text-[15px] text-muted">Every week is planned around these. Change them any time.</p>
        <PlanSettings />
      </details>
    </div>
  );
}

type SheetState =
  | { kind: "none" }
  | { kind: "more"; date: string }
  | { kind: "custom"; date: string }
  | { kind: "rebuild"; regenerate: boolean }
  | { kind: "repeat"; weeks: MealPlan[] };

function WeekPlanner({ weekStart }: { weekStart: string }) {
  const { profile } = useProfile();
  const p = useMealPlan(weekStart);
  const [mode, setMode] = useState<PlanningMode>("balanced");
  const [sheet, setSheet] = useState<SheetState>({ kind: "none" });
  const [skipped, setSkipped] = useState<Record<string, string[]>>({});
  const [customTitle, setCustomTitle] = useState("");
  const titleId = useId();

  // Show the plan's own mode once it's loaded.
  useEffect(() => {
    if (p.plan) setMode(p.plan.mode);
  }, [p.plan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = p.busy !== null;
  const days = weekDates(weekStart);
  const mealsByDate = new Map(p.draft.meals.map((m) => [m.date, m]));
  const hasMeals = p.draft.meals.length > 0;
  const confirmed = Boolean(p.draft.confirmedAt);
  const servings = profile.household.cookingFor;

  async function edit(next: PlanDraft) {
    // Explicit edits by the household are allowed on a confirmed week.
    await p.save(next, true);
  }

  function startBuild(regenerate: boolean) {
    if (confirmed) setSheet({ kind: "rebuild", regenerate });
    else void p.build(mode, { regenerate });
  }

  async function swap(date: string) {
    const skip = new Set(skipped[date] ?? []);
    const current = mealsByDate.get(date)?.recipeId;
    if (current) skip.add(current);
    const pick = p.proposeSwap(date, skip);
    if (!pick) {
      p.setMessage({ tone: "info", text: "No other suitable recipes for that night right now." });
      return;
    }
    setSkipped((s) => ({ ...s, [date]: [...skip] }));
    await edit(replaceMeal(p.draft, date, pick, servings));
  }

  if (p.loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading your plan">
        <div className="h-40 animate-pulse rounded-card bg-surface" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
    );
  }

  const sourceLabel =
    p.draft.generatedBy === "ai" ? "Planned with Claude" : p.draft.generatedBy === "rules" ? "Planned by Kitchen Pantry" : "Planned by you";

  return (
    <div className="space-y-5">
      {/* Planner controls */}
      <Card>
        <Eyebrow>How should we plan this week?</Eyebrow>
        <div role="radiogroup" aria-label="Planning mode" className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {MODES.map((m) =>
            m.available ? (
              <ChoiceCard key={m.code} selected={mode === m.code} onSelect={() => setMode(m.code)} title={m.label} description={m.description} />
            ) : (
              <div key={m.code} className="rounded-control border border-dashed border-border p-4 text-left opacity-70" aria-disabled="true">
                <span className="block text-[17px] font-semibold">
                  {m.label} <span className="ml-1 rounded-full bg-surface-strong px-2 py-0.5 text-[12px] font-semibold text-muted">Coming soon</span>
                </span>
                <span className="mt-0.5 block text-[15px] leading-snug text-muted">{m.description}</span>
              </div>
            ),
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={() => startBuild(hasMeals)} disabled={busy} icon={<Sparkles className="size-5" aria-hidden />}>
            {p.busy === "building" ? "Planning your week…" : hasMeals ? "Regenerate week" : "Build my week"}
          </Button>
          {!hasMeals ? (
            <Button
              variant="ghost"
              disabled={busy}
              icon={<History className="size-5" aria-hidden />}
              onClick={async () => {
                const prev = await p.previous();
                if (prev.ok && prev.data.length > 0) setSheet({ kind: "repeat", weeks: prev.data });
                else p.setMessage({ tone: "info", text: "There's no earlier week to repeat yet." });
              }}
            >
              Repeat a previous week
            </Button>
          ) : null}
        </div>
        <p className="mt-3 text-[14px] text-muted">
          {p.ai.enabled
            ? `Plans with Claude${p.ai.remaining !== null ? ` · ${p.ai.remaining} AI plan${p.ai.remaining === 1 ? "" : "s"} left today` : ""}. Locked meals and your own meals always stay.`
            : "Uses Kitchen Pantry's built-in planner. Add an Anthropic API key on the server to plan with Claude."}
        </p>
      </Card>

      {p.message ? (
        <div
          role={p.message.tone === "error" ? "alert" : "status"}
          className={cn(
            "flex gap-3 rounded-2xl px-4 py-3 text-[15px]",
            p.message.tone === "error" ? "bg-danger/10 text-danger" : p.message.tone === "warning" ? "bg-warning/10" : "bg-accent-soft",
          )}
        >
          {p.message.tone !== "info" ? <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
          <span>{p.message.text}</span>
        </div>
      ) : null}

      {/* Week summary */}
      {hasMeals ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Eyebrow>{sourceLabel}</Eyebrow>
              <p className="mt-1.5 text-[17px] leading-snug">{p.draft.summary ?? `${p.draft.meals.length} dinners planned.`}</p>
            </div>
            {confirmed ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-[14px] font-semibold text-accent">
                  <CalendarCheck className="size-4" aria-hidden /> Confirmed
                </span>
                <Button variant="ghost" onClick={() => void p.unconfirm()} disabled={busy}>
                  Edit
                </Button>
              </div>
            ) : (
              <Button onClick={() => void p.confirm()} disabled={busy} icon={<CalendarCheck className="size-5" aria-hidden />}>
                Confirm this week
              </Button>
            )}
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat label="Dinners" value={String(p.draft.meals.length)} />
            <Stat label="Items to buy" value={String(p.basket.toBuy.length)} />
            <Stat label="From your kitchen" value={String(p.basket.fromKitchen)} />
          </dl>
          <p className="mt-3 text-[14px] text-muted">
            Cost: see the{" "}
            <Link href="/grocery" className="font-medium text-foreground underline underline-offset-4">
              Grocery List
            </Link>{" "}
            for prices from your store — we never estimate them.
          </p>
        </Card>
      ) : null}

      {/* The week */}
      <section aria-label="This week's dinners" className="space-y-3">
        {days.map((date) => {
          const meal = mealsByDate.get(date);
          if (!meal && date < p.today) {
            const { weekday, day } = dayLabel(date, "long");
            return (
              <p key={date} className="px-1 text-[14px] text-subtle">
                {weekday} · {day} · past
              </p>
            );
          }
          if (!meal) {
            return (
              <EmptyNight
                key={date}
                date={date}
                busy={busy}
                onSuggest={() => void swap(date)}
                onAddOwn={() => {
                  setCustomTitle("");
                  setSheet({ kind: "custom", date });
                }}
              />
            );
          }
          return (
            <MealCard
              key={date}
              date={date}
              meal={meal}
              ranked={meal.recipeId ? p.byId.get(meal.recipeId) : undefined}
              busy={busy}
              onSwap={() => void swap(date)}
              onToggleLock={() => void edit(toggleLock(p.draft, date))}
              onServings={(n) => void edit(setServings(p.draft, date, n))}
              onMore={() => setSheet({ kind: "more", date })}
            />
          );
        })}
      </section>

      {/* Desserts: optional, alongside dinner */}
      <DessertsSection
        desserts={p.draft.desserts}
        days={days}
        today={p.today}
        frequency={profile.desserts.frequency}
        byId={p.byId}
        candidates={p.allDesserts}
        preferred={profile.desserts.categories}
        favorites={p.recipesData.favorites}
        busy={busy}
        defaultServings={servings}
        onAdd={(date, recipeId, note) => void edit(addDessert(p.draft, date, { recipeId, note }, servings))}
        onRemove={(date) => void edit(removeDessert(p.draft, date))}
        onServings={(date, n) => void edit(setDessertServings(p.draft, date, n))}
      />

      {/* Shopping preview */}
      {p.basket.toBuy.length > 0 ? (
        <Card>
          <div className="flex items-center gap-2.5">
            <ShoppingBasket className="size-5 text-muted" aria-hidden />
            <h2 className="text-[17px] font-semibold">What you&apos;ll need to buy</h2>
          </div>
          {p.basket.usesUp.length > 0 ? (
            <p className="mt-2 text-[15px] text-muted">Uses up your {p.basket.usesUp.join(", ").toLowerCase()} before {p.basket.usesUp.length === 1 ? "it goes" : "they go"} off.</p>
          ) : null}
          <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-2">
            {p.basket.toBuy.map((b) => (
              <li key={b.item} className="flex items-baseline justify-between gap-3 border-b border-border py-1.5">
                <span className="first-letter:uppercase">{b.item}</span>
                {b.neededFor.length > 1 ? <span className="shrink-0 text-[13px] text-accent">used in {b.neededFor.length} meals</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-muted">Dinners only. The Grocery List adds amounts, desserts and store prices, with what you already have taken off.</p>
        </Card>
      ) : null}

      {/* Sheets */}
      <Sheet
        open={sheet.kind === "more"}
        onClose={() => setSheet({ kind: "none" })}
        title={sheet.kind === "more" ? dayLabel(sheet.date, "long").weekday : ""}
        description="Move this dinner, hide the recipe, or clear the night."
      >
        {sheet.kind === "more" ? (
          <MoreOptions
            date={sheet.date}
            days={days}
            hasRecipe={Boolean(mealsByDate.get(sheet.date)?.recipeId)}
            occupied={new Set(p.draft.meals.map((m) => m.date))}
            onMove={async (to) => {
              setSheet({ kind: "none" });
              await edit(moveMeal(p.draft, sheet.date, to));
            }}
            onNotForUs={async () => {
              const id = mealsByDate.get(sheet.date)?.recipeId;
              setSheet({ kind: "none" });
              if (!id) return;
              await p.recipesData.dismiss(id, "plan");
              const pick = p.proposeSwap(sheet.date, new Set([id]));
              await edit(pick ? replaceMeal(p.draft, sheet.date, pick, servings) : removeMeal(p.draft, sheet.date));
              p.setMessage({ tone: "info", text: "Got it — we won't suggest that recipe again. You can undo this on the Recipes page." });
            }}
            onRemove={async () => {
              setSheet({ kind: "none" });
              await edit(removeMeal(p.draft, sheet.date));
            }}
          />
        ) : null}
      </Sheet>

      <Sheet
        open={sheet.kind === "custom"}
        onClose={() => setSheet({ kind: "none" })}
        title="Add your own meal"
        description="Leftovers, eating out, a family recipe — anything you like."
        footer={
          <Button
            size="lg"
            className="w-full"
            disabled={!customTitle.trim() || busy}
            onClick={async () => {
              if (sheet.kind !== "custom") return;
              const date = sheet.date;
              setSheet({ kind: "none" });
              await edit(addCustomMeal(p.draft, date, customTitle, servings));
            }}
          >
            Add meal
          </Button>
        }
      >
        <label htmlFor={titleId} className="mb-1.5 block text-[15px] font-semibold">
          What&apos;s for dinner?
        </label>
        <TextInput id={titleId} value={customTitle} maxLength={80} onChange={(e) => setCustomTitle(e.target.value)} placeholder="e.g. Leftovers or Pizza night" />
      </Sheet>

      <Sheet
        open={sheet.kind === "rebuild"}
        onClose={() => setSheet({ kind: "none" })}
        title="Rebuild a confirmed week?"
        description="Locked meals and your own meals stay. Everything else is replaced, and you'll need to confirm the week again."
        footer={
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              size="lg"
              className="flex-1"
              onClick={() => {
                const regenerate = sheet.kind === "rebuild" && sheet.regenerate;
                setSheet({ kind: "none" });
                void p.build(mode, { regenerate });
              }}
            >
              Rebuild week
            </Button>
            <Button size="lg" variant="secondary" className="flex-1" onClick={() => setSheet({ kind: "none" })}>
              Keep my week
            </Button>
          </div>
        }
      >
        <p className="text-[15px] text-muted">Tip: lock the dinners you want to keep before rebuilding.</p>
      </Sheet>

      <Sheet open={sheet.kind === "repeat"} onClose={() => setSheet({ kind: "none" })} title="Repeat a previous week" description="Copies those dinners onto the same days of this week.">
        {sheet.kind === "repeat" ? (
          <ul className="space-y-2">
            {sheet.weeks.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  className="w-full rounded-2xl border border-border px-4 py-3 text-left hover:bg-surface"
                  onClick={async () => {
                    setSheet({ kind: "none" });
                    await edit(repeatWeek(p.draft, w, new Set([...p.candidates, ...p.allDesserts].map((c) => c.recipe.id))));
                  }}
                >
                  <span className="block font-semibold">Week of {dayLabel(w.weekStart).day}</span>
                  <span className="block text-[14px] text-muted">
                    {w.meals
                      .map((m) => (m.recipeId ? p.byId.get(m.recipeId)?.recipe.title : m.customTitle))
                      .filter(Boolean)
                      .slice(0, 3)
                      .join(" · ") || "No dinners"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Sheet>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse rounded-2xl bg-background px-2 py-3">
      <dt className="mt-1 text-[13px] text-muted">{label}</dt>
      <dd className="text-[24px] font-bold leading-none tabular-nums">{value}</dd>
    </div>
  );
}

function MoreOptions({
  date,
  days,
  hasRecipe,
  occupied,
  onMove,
  onNotForUs,
  onRemove,
}: {
  date: string;
  days: string[];
  hasRecipe: boolean;
  occupied: ReadonlySet<string>;
  onMove: (to: string) => void;
  onNotForUs: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-[15px] font-semibold">Move to</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {days.map((d) => {
            const { weekday } = dayLabel(d);
            return (
              <button
                key={d}
                type="button"
                disabled={d === date}
                onClick={() => onMove(d)}
                className={cn(
                  "min-h-12 rounded-2xl border border-border text-[15px] font-semibold hover:bg-surface disabled:border-foreground disabled:bg-foreground disabled:text-background",
                )}
                aria-label={`Move to ${dayLabel(d, "long").weekday}${occupied.has(d) && d !== date ? " (swaps with that dinner)" : ""}`}
              >
                {weekday}
                {occupied.has(d) && d !== date ? <span className="block text-[11px] font-normal text-muted">swap</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-2">
        {hasRecipe ? (
          <Button variant="secondary" className="w-full" onClick={onNotForUs}>
            Not for us — never suggest it
          </Button>
        ) : null}
        <Button variant="danger" className="w-full" onClick={onRemove}>
          Clear this night
        </Button>
      </div>
    </div>
  );
}
