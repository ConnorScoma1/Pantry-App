"use client";

import {
  allergens,
  budgetIncludes,
  budgetPeriods,
  budgetPriorities,
  cookingGoals,
  cuisines,
  dietaryRestrictions,
  equipment,
  labelFor,
  mealTypes,
} from "@kitchen-pantry/shared-types";
import { weeklyBudgetCents } from "@kitchen-pantry/meal-planner";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useProfile } from "@/components/profile/profile-provider";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { WeekTabs } from "@/components/ui/week-tabs";
import { dietLabel, formatMoney, plural, skillLabel } from "@/lib/format";

export function PlanView() {
  const { profile } = useProfile();
  const { household, budget, diet } = profile;
  const weekly = weeklyBudgetCents(budget.amountCents, budget.period);
  const list = (items: string[], empty = "None") => (items.length ? items.join(", ") : empty);

  return (
    <div className="animate-enter">
      <PageHeader
        title="Meal Plan"
        subtitle="These settings apply to every week you plan."
        action={
          <Link
            href="/recipes"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background hover:opacity-90"
          >
            Browse recipes
          </Link>
        }
      />
      <WeekTabs />

      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsCard eyebrow="Household" step="household">
          <Row label="Cooking for">{plural(household.cookingFor, "person", "people")}</Row>
          <Row label="Meals">{list(household.mealsIncluded.map((m) => labelFor(mealTypes, m)))}</Row>
          {household.mealsIncluded.includes("dinner") ? (
            <Row label="Dinners">{household.dinnersPerWeek} a week</Row>
          ) : null}
          <Row label="Location">
            {household.postalCode} · {household.country}
          </Row>
        </SettingsCard>

        <SettingsCard eyebrow="Grocery budget" step="budget">
          <p className="text-[34px] font-bold leading-none tracking-tight">
            {budget.amountCents === null ? "No limit" : formatMoney(budget.amountCents)}
          </p>
          <p className="mt-1 text-[15px] text-muted">
            {budget.amountCents === null
              ? "We'll still show what each week costs."
              : labelFor(budgetPeriods, budget.period)}
            {weekly !== null && budget.period !== "week" ? ` · about ${formatMoney(weekly)} a week` : ""}
          </p>
          <div className="mt-3 space-y-0">
            <Row label="Covers">{list(budget.includes.map((b) => labelFor(budgetIncludes, b)))}</Row>
            <Row label="Priority">{labelFor(budgetPriorities, budget.priority)}</Row>
          </div>
        </SettingsCard>

        <SettingsCard eyebrow="Diet & allergies" step="diet">
          <Row label="Diet">{dietLabel(profile)}</Row>
          <Row label="Allergies" strong={diet.allergies.length > 0}>
            {list(diet.allergies.map((a) => labelFor(allergens, a)))}
          </Row>
          <Row label="Restrictions">{list(diet.restrictions.map((r) => labelFor(dietaryRestrictions, r)))}</Row>
          <Row label="Won't eat">{list([...diet.dislikes, ...diet.neverRecommend])}</Row>
          <Row label="Cuisines">{list(diet.cuisines.map((c) => labelFor(cuisines, c)), "Any")}</Row>
        </SettingsCard>

        <SettingsCard eyebrow="Cooking" step="skill">
          <Row label="Skill">
            Level {profile.skillLevel} · {skillLabel(profile.skillLevel)}
          </Row>
          <Row label="Equipment">{list(profile.equipment.map((e) => labelFor(equipment, e)))}</Row>
          <Row label="Top goals">
            {list(profile.goals.ranked.slice(0, 3).map((g) => labelFor(cookingGoals, g)))}
          </Row>
        </SettingsCard>
      </div>
    </div>
  );
}

function SettingsCard({ eyebrow, step, children }: { eyebrow: string; step: string; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <Eyebrow>{eyebrow}</Eyebrow>
        <Link
          href={`/onboarding?step=${step}`}
          className="inline-flex min-h-9 items-center gap-0.5 rounded-full border border-border bg-background px-4 text-[15px] font-semibold hover:bg-surface-strong"
        >
          Change <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
      {children}
    </Card>
  );
}

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex gap-4 border-b border-border py-2.5 text-[16px] last:border-0">
      <span className="w-28 shrink-0 text-muted">{label}</span>
      <span className={strong ? "font-semibold" : undefined}>{children}</span>
    </div>
  );
}
