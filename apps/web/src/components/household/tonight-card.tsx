"use client";

import { createLocalMealPlanRepository, type MealPlanRepository } from "@kitchen-pantry/database";
import { draftToInput, setServings, startOfWeek, toDraft } from "@kitchen-pantry/meal-planner";
import type { MealPlan } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useState } from "react";
import { getWeekAction, saveWeekAction } from "@/app/(app)/plan/actions";
import { useProfile } from "@/components/profile/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { browserStorage } from "@/lib/browser-storage";
import { useAttendance } from "@/lib/household/use-household-life";
import { EatingControls } from "./who-is-eating";

const supabasePlans: Pick<MealPlanRepository, "getWeek" | "save"> = {
  getWeek: (w) => getWeekAction(w),
  save: (i, o) => saveWeekAction(i, Boolean(o?.overwriteConfirmed)),
};
let previewPlans: MealPlanRepository | null = null;

/** Home: tonight's dinner and who's eating it. Servings change only when someone taps. */
export function TonightCard({ today, titleFor }: { today: string; titleFor: (recipeId: string) => string | null }) {
  const { mode } = useProfile();
  const repo = mode === "preview" ? (previewPlans ??= createLocalMealPlanRepository(browserStorage)) : supabasePlans;
  const weekStart = startOfWeek(today);
  const eating = useAttendance(weekStart);
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await repo.getWeek(weekStart);
    if (r.ok) setPlan(r.data);
  }, [repo, weekStart]);
  useEffect(() => {
    void load();
  }, [load]);

  const meal = plan?.meals.find((m) => m.date === today && m.mealType !== "dessert");
  const att = eating.forDay(today);
  if (!plan || !meal || !att) return null;
  const title = (meal.recipeId ? titleFor(meal.recipeId) : null) ?? meal.customTitle ?? "Dinner";
  const differs = att.servings > 0 && att.servings !== meal.servings;

  return (
    <Card className="mt-4">
      <Eyebrow>Dinner tonight</Eyebrow>
      <h2 className="mt-1.5 text-2xl font-bold tracking-tight">{title}</h2>
      <p className="mt-1 text-[15px] text-muted">
        {att.servings === 0 ? "Nobody's eating tonight." : `${att.servings} serving${att.servings === 1 ? "" : "s"} needed`}
        {att.summary && att.summary !== "Everyone's in" ? ` · ${att.summary}` : ""}
        {differs ? ` · planned for ${meal.servings}` : ""}
      </p>
      <div className="mt-4 max-w-md">
        <EatingControls att={att} dayName="tonight" onEating={(e) => void eating.setEating(today, e)} onGuests={(n) => void eating.setGuests(today, n)} />
      </div>
      {differs ? (
        <Button
          className="mt-4"
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await repo.save(draftToInput(setServings(toDraft(plan), today, att.servings)), { overwriteConfirmed: true });
            setBusy(false);
            if (r.ok) setPlan(r.data);
          }}
        >
          Make tonight {att.servings} servings
        </Button>
      ) : null}
      {eating.error ? (
        <p role="alert" className="mt-3 text-[15px] text-danger">
          {eating.error}
        </p>
      ) : null}
    </Card>
  );
}
