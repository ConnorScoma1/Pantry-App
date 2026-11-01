"use client";

import {
  allergens,
  budgetIncludes,
  budgetPriorities,
  cookingGoals,
  countries,
  cuisines,
  dessertFrequencies,
  dietaryRestrictions,
  equipment,
  knownRetailers,
  labelFor,
  mealTypes,
  proteins,
  type OnboardingProfile,
} from "@kitchen-pantry/shared-types";
import type { OnboardingStepId } from "@kitchen-pantry/validation";
import type { ReactNode } from "react";
import { budgetSummary, dietLabel, plural, skillLabel } from "@/lib/format";

export function ReviewStep({
  profile,
  onEdit,
}: {
  profile: OnboardingProfile;
  onEdit: (step: OnboardingStepId) => void;
}) {
  const { household: h, budget: b, diet: d } = profile;
  const list = (items: string[], empty = "None") => (items.length ? items.join(", ") : empty);
  const store = knownRetailers.find((r) => r.slug === profile.store.usualRetailer)?.name ?? profile.store.usualRetailer;

  return (
    <div className="space-y-3">
      <ReviewCard title="Household" onEdit={() => onEdit("household")}>
        <Line>
          {plural(h.adults, "adult")}, {plural(h.children, "child", "children")} · cooking for{" "}
          {plural(h.cookingFor, "person", "people")}
        </Line>
        <Line>
          {list(h.mealsIncluded.map((m) => labelFor(mealTypes, m)))}
          {h.mealsIncluded.includes("dinner") ? ` · ${plural(h.dinnersPerWeek, "dinner")} a week` : ""}
        </Line>
        <Line muted>
          {h.postalCode}, {labelFor(countries, h.country)}
        </Line>
      </ReviewCard>
      <ReviewCard title="Budget" onEdit={() => onEdit("budget")}>
        <Line>{budgetSummary(profile)}</Line>
        <Line muted>
          Covers {list(b.includes.map((x) => labelFor(budgetIncludes, x)), "nothing yet")} ·{" "}
          {labelFor(budgetPriorities, b.priority)}
        </Line>
      </ReviewCard>
      <ReviewCard title="Goals" onEdit={() => onEdit("goals")}>
        <Line>{list(profile.goals.ranked.map((g, i) => `${i + 1}. ${labelFor(cookingGoals, g)}`))}</Line>
        <Line muted>Seasonal recipes: {profile.seasonal.enabled ? "on" : "off"}</Line>
      </ReviewCard>
      <ReviewCard title="What you eat" onEdit={() => onEdit("diet")}>
        <Line>
          {dietLabel(profile)}
          {d.restrictions.length ? ` · ${list(d.restrictions.map((r) => labelFor(dietaryRestrictions, r)))}` : ""}
        </Line>
        <Line strong={d.allergies.length > 0}>Allergies: {list(d.allergies.map((a) => labelFor(allergens, a)))}</Line>
        <Line muted>Won&apos;t eat: {list([...d.dislikes, ...d.neverRecommend])}</Line>
        <Line muted>
          Loves: {list([...d.cuisines.map((c) => labelFor(cuisines, c)), ...d.proteins.map((p) => labelFor(proteins, p))], "Anything")}
        </Line>
      </ReviewCard>
      <ReviewCard title="Skill" onEdit={() => onEdit("skill")}>
        <Line>
          Level {profile.skillLevel} · {skillLabel(profile.skillLevel)}
        </Line>
        <Line muted>Desserts: {labelFor(dessertFrequencies, profile.desserts.frequency)}</Line>
      </ReviewCard>
      <ReviewCard title="Kitchen" onEdit={() => onEdit("equipment")}>
        <Line>{list(profile.equipment.map((e) => labelFor(equipment, e)))}</Line>
      </ReviewCard>
      <ReviewCard title="Store" onEdit={() => onEdit("store")}>
        <Line>{store ?? "Not chosen"}</Line>
      </ReviewCard>
    </div>
  );
}

function ReviewCard({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="flex items-start justify-between gap-4 rounded-card bg-surface p-5">
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</h3>
        <div className="mt-1.5 space-y-0.5">{children}</div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="min-h-10 shrink-0 rounded-full border border-border bg-background px-4 text-[15px] font-semibold hover:bg-surface-strong"
        aria-label={`Edit ${title}`}
      >
        Edit
      </button>
    </section>
  );
}

function Line({ children, muted, strong }: { children: ReactNode; muted?: boolean; strong?: boolean }) {
  return (
    <p className={muted ? "text-[15px] text-muted" : strong ? "text-[16px] font-semibold" : "text-[16px]"}>{children}</p>
  );
}
