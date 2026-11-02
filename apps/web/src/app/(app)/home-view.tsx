"use client";

import { ArrowRight, CalendarDays, Clock, Leaf, Sparkles, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { summarizeKitchen } from "@kitchen-pantry/inventory-engine";
import { useEffect, useMemo, useState } from "react";
import { UrgencyBadge } from "@/components/kitchen/urgency-badge";
import { useProfile } from "@/components/profile/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, Hint } from "@/components/ui/card";
import { useWeekOptions } from "@/components/ui/week-tabs";
import { useMealPlan } from "@/lib/meal-plan/use-meal-plan";
import { nightsLeft } from "@kitchen-pantry/meal-planner";
import { dayLabel } from "@/components/plan/meal-card";
import { budgetSummary, dietLabel, greeting, plural, skillLabel } from "@/lib/format";
import { useKitchen } from "@/lib/kitchen/use-kitchen";
import { useRecipes } from "@/lib/recipes/use-recipes";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { InSeasonCard } from "@/components/seasonal/in-season";
import { SurpriseMe } from "@/components/recipes/surprise-me";
import { PlanReadyCard } from "@/components/plan/plan-ready-card";
import { SavingsSnapshot } from "@/components/savings-snapshot";
import { TonightCard } from "@/components/household/tonight-card";
import { seasonalContext } from "@kitchen-pantry/recipe-engine";

export function HomeView() {
  const { profile } = useProfile();
  const [hello, setHello] = useState("Hello");
  useEffect(() => setHello(greeting()), []);

  const kitchen = useKitchen();
  const recipesData = useRecipes();
  const forYou = useMemo(() => recipesData.rank().recipes.slice(0, 3), [recipesData.rank]);
  const seasonal = useMemo(() => seasonalContext(profile, kitchen.today), [profile, kitchen.today]);
  const everything = useMemo(() => recipesData.rank({ course: "any" }).recipes, [recipesData.rank]);
  const useSoon = useMemo(() => summarizeKitchen(kitchen.items, kitchen.today).useSoon, [kitchen.items, kitchen.today]);

  const { household } = profile;
  const dinners = household.mealsIncluded.includes("dinner") ? household.dinnersPerWeek : 0;

  return (
    <div className="animate-enter">
      <header className="mb-5 pt-2">
        <p className="text-[17px] text-muted">{hello}</p>
        <h1 className="text-[34px] font-bold leading-tight tracking-tight lg:text-[40px]">Your week</h1>
      </header>

      <PlanReadyCard />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <ThisWeekCard dinners={dinners} cookingFor={household.cookingFor} />

        <Card>
          <Eyebrow>Planning around</Eyebrow>
          <ul className="mt-3 space-y-3 text-[16px]">
            <SummaryRow icon={<Users className="size-5" aria-hidden />}>
              {plural(household.cookingFor, "person", "people")} · {plural(dinners, "dinner")} a week
            </SummaryRow>
            <SummaryRow icon={<Wallet className="size-5" aria-hidden />}>{budgetSummary(profile)}</SummaryRow>
            <SummaryRow icon={<Leaf className="size-5" aria-hidden />}>
              {dietLabel(profile)}
              {profile.diet.allergies.length > 0 ? ` · ${plural(profile.diet.allergies.length, "allergy", "allergies")} excluded` : ""}
            </SummaryRow>
            <SummaryRow icon={<Clock className="size-5" aria-hidden />}>{skillLabel(profile.skillLevel)}</SummaryRow>
          </ul>
          <Link
            href="/plan"
            className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-semibold text-accent hover:underline"
          >
            Planning settings <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Card>
      </div>

      <TonightCard today={kitchen.today} titleFor={(id) => everything.find((r) => r.recipe.id === id)?.recipe.title ?? null} />
      <SavingsSnapshot />

      <section className="mt-8" aria-labelledby="for-you">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 id="for-you" className="text-2xl font-bold tracking-tight">
              Recipes for you
            </h2>
            <p className="text-[15px] text-muted">Matched to your skills, kitchen and what needs using up.</p>
          </div>
          <Link href="/recipes" className="inline-flex shrink-0 items-center gap-1 text-[15px] font-semibold text-accent hover:underline">
            See all <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        {recipesData.loading ? (
          <div className="grid gap-4 sm:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-60 animate-pulse rounded-card bg-surface" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {forYou.map((r) => (
              <RecipeCard
                key={r.recipe.id}
                ranked={r}
                onToggleFavorite={() => void recipesData.toggleFavorite(r.recipe.id)}
                onDismiss={() => void recipesData.dismiss(r.recipe.id, "home")}
              />
            ))}
          </div>
        )}
      </section>

      <div className="mt-4">
        <SurpriseMe data={recipesData} compact />
      </div>

      {seasonal && !recipesData.loading ? <InSeasonCard seasonal={seasonal} ranked={everything} /> : null}

      <Card className="mt-4">
        <div className="flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <CalendarDays className="size-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <Eyebrow>Use it before you lose it</Eyebrow>
            {kitchen.loading ? (
              <div className="mt-2 h-6 w-48 animate-pulse rounded-full bg-surface-strong" />
            ) : useSoon.length === 0 ? (
              <>
                <h2 className="mt-1 text-xl font-bold tracking-tight">Nothing needs using up</h2>
                <Hint className="mt-1">
                  Add what&apos;s in your fridge with use-by dates and we&apos;ll put the most urgent ingredients first.
                  We only go by the dates you enter — nothing past its date is ever suggested.
                </Hint>
              </>
            ) : (
              <>
                <h2 className="mt-1 text-xl font-bold tracking-tight">
                  {plural(useSoon.length, "ingredient")} to use soon
                </h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {useSoon.slice(0, 6).map(({ item, urgency }) => (
                    <li key={item.id} className="inline-flex items-center gap-2 rounded-full bg-background py-1.5 pr-1.5 pl-4">
                      <span className="text-[15px] font-medium">{item.name}</span>
                      <UrgencyBadge urgency={urgency} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            <Link
              href="/kitchen"
              className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-accent hover:underline"
            >
              Go to My Kitchen <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SummaryRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="text-muted">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

/** This week's dinners, or a one-tap "Build my week". */
function ThisWeekCard({ dinners, cookingFor }: { dinners: number; cookingFor: number }) {
  const weeks = useWeekOptions();
  const today = useKitchen().today;
  // Late in the week (e.g. Sunday) the useful week to show is next week.
  const upcoming = nightsLeft(weeks[0]!.weekStart, today) < 2;
  const weekStart = weeks[upcoming ? 1 : 0]!.weekStart;
  const label = upcoming ? "Next week" : "This week";
  const p = useMealPlan(weekStart);
  const meals = p.draft.meals;

  if (p.loading) return <Card className="min-h-56 min-w-0 animate-pulse" aria-busy="true" aria-label="Loading this week" />;

  if (meals.length === 0) {
    return (
      <Card className="flex min-w-0 flex-col">
        <Eyebrow>{label}&apos;s dinners</Eyebrow>
        <h2 className="mt-1.5 text-2xl font-bold tracking-tight">Nothing planned yet</h2>
        <p className="mt-2 text-[16px] text-muted">
          We&apos;ll plan {plural(dinners, "dinner")} for {plural(cookingFor, "person", "people")}, matched to your skill level and
          what&apos;s already in your kitchen.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button size="lg" disabled={p.busy !== null || dinners === 0} onClick={() => void p.build("balanced")} icon={<Sparkles className="size-5" aria-hidden />}>
            {p.busy === "building" ? "Planning your week…" : "Build my week"}
          </Button>
          <Link href="/plan" className="min-h-11 content-center text-[15px] font-semibold text-accent hover:underline sm:ml-2">
            Choose how to plan
          </Link>
        </div>
        {p.message ? <p className="mt-3 text-[14px] text-muted">{p.message.text}</p> : null}
      </Card>
    );
  }

  return (
    <Card className="flex min-w-0 flex-col">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>{label}&apos;s dinners</Eyebrow>
        {p.draft.confirmedAt ? (
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent">
            <CalendarDays className="size-4" aria-hidden /> Confirmed
          </span>
        ) : (
          <span className="text-[13px] font-medium text-muted">Draft</span>
        )}
      </div>
      <ul className="mt-3 divide-y divide-border">
        {meals.map((m) => {
          const ranked = m.recipeId ? p.byId.get(m.recipeId) : undefined;
          return (
            <li key={m.date} className="flex items-baseline gap-3 py-2.5 text-[16px]">
              <span className="w-10 shrink-0 text-[14px] font-semibold text-muted">{dayLabel(m.date).weekday}</span>
              {ranked ? (
                <Link href={`/recipes/${ranked.recipe.slug}`} className="min-w-0 flex-1 truncate hover:underline">
                  {ranked.recipe.title}
                </Link>
              ) : (
                <span className="min-w-0 flex-1 truncate">{m.customTitle ?? "Recipe unavailable"}</span>
              )}
            </li>
          );
        })}
      </ul>
      <Link href="/plan" className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-accent hover:underline">
        Open meal plan <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Card>
  );
}
