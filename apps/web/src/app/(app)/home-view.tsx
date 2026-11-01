"use client";

import { ArrowRight, CalendarDays, Clock, Leaf, Sparkles, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { summarizeKitchen } from "@kitchen-pantry/inventory-engine";
import { useEffect, useMemo, useState } from "react";
import { UrgencyBadge } from "@/components/kitchen/urgency-badge";
import { useProfile } from "@/components/profile/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, Hint } from "@/components/ui/card";
import { WeekTabs } from "@/components/ui/week-tabs";
import { budgetSummary, dietLabel, greeting, plural, skillLabel } from "@/lib/format";
import { useKitchen } from "@/lib/kitchen/use-kitchen";
import { useRecipes } from "@/lib/recipes/use-recipes";
import { RecipeCard } from "@/components/recipes/recipe-card";

export function HomeView() {
  const { profile } = useProfile();
  const [hello, setHello] = useState("Hello");
  useEffect(() => setHello(greeting()), []);

  const kitchen = useKitchen();
  const recipesData = useRecipes();
  const forYou = useMemo(() => recipesData.rank().recipes.slice(0, 3), [recipesData.rank]);
  const useSoon = useMemo(() => summarizeKitchen(kitchen.items, kitchen.today).useSoon, [kitchen.items, kitchen.today]);

  const { household } = profile;
  const dinners = household.mealsIncluded.includes("dinner") ? household.dinnersPerWeek : 0;

  return (
    <div className="animate-enter">
      <header className="mb-5 pt-2">
        <p className="text-[17px] text-muted">{hello}</p>
        <h1 className="text-[34px] font-bold leading-tight tracking-tight lg:text-[40px]">Your week</h1>
      </header>

      <WeekTabs />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="flex flex-col">
          <Eyebrow>Dinners</Eyebrow>
          <h2 className="mt-1.5 text-2xl font-bold tracking-tight">Nothing planned yet</h2>
          <p className="mt-2 text-[16px] text-muted">
            We&apos;ll plan {plural(dinners, "dinner")} for {plural(household.cookingFor, "person", "people")}, matched to
            your budget, skill level and what&apos;s already in your kitchen.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button size="lg" disabled icon={<Sparkles className="size-5" aria-hidden />}>
              Build my week
            </Button>
            <span className="text-[14px] text-muted sm:ml-2">Meal planning is the next feature we&apos;re building.</span>
          </div>
        </Card>

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
            Adjust plan settings <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Card>
      </div>

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
              <RecipeCard key={r.recipe.id} ranked={r} onToggleFavorite={() => void recipesData.toggleFavorite(r.recipe.id)} />
            ))}
          </div>
        )}
      </section>

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
