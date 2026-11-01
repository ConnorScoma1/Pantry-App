"use client";

import { countries, mealTypes, type MealType } from "@kitchen-pantry/shared-types";
import { useState } from "react";
import { Chip, ChipGroup, FieldError, Stepper, Switch, TextInput } from "@/components/ui/controls";
import { Section } from "./section";
import { toggle, type StepProps } from "./types";

export function HouseholdStep({ profile, setProfile, errors }: StepProps) {
  const h = profile.household;
  const country = countries.find((c) => c.code === h.country) ?? countries[0];
  const [customPortions, setCustomPortions] = useState(Object.keys(h.servingsByMeal).length > 0);

  const set = (patch: Partial<typeof h>) =>
    setProfile((p) => ({ ...p, household: { ...p.household, ...patch } }));

  /** Keep "cooking for" in step with household size until the user changes it themselves. */
  const setPeople = (adults: number, children: number) => {
    const followsHousehold = h.cookingFor === h.adults + h.children;
    set({ adults, children, ...(followsHousehold ? { cookingFor: Math.max(1, adults + children) } : {}) });
  };

  const setMealServings = (meal: MealType, servings: number) => {
    const next = { ...h.servingsByMeal };
    if (servings === h.cookingFor) delete next[meal];
    else next[meal] = servings;
    set({ servingsByMeal: next });
  };

  return (
    <div className="space-y-4">
      <Section title="Where you shop" description="Used to find stores and local prices once those are connected.">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
          <div>
            <label htmlFor="country" className="mb-1.5 block text-[15px] font-semibold">
              Country
            </label>
            <select
              id="country"
              value={h.country}
              onChange={(e) => set({ country: e.target.value as typeof h.country })}
              className="h-13 w-full appearance-none rounded-control border border-border bg-background px-4 text-[17px] outline-none focus:border-foreground"
            >
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="postal" className="mb-1.5 block text-[15px] font-semibold">
              {country.postalLabel}
            </label>
            <TextInput
              id="postal"
              value={h.postalCode}
              onChange={(e) => set({ postalCode: e.target.value })}
              inputMode={h.country === "US" || h.country === "AU" ? "numeric" : "text"}
              autoComplete="postal-code"
              placeholder={h.country === "US" ? "e.g. 53132" : ""}
              invalid={Boolean(errors.postalCode)}
              aria-describedby={errors.postalCode ? "postal-error" : undefined}
            />
            <FieldError id="postal-error" message={errors.postalCode} />
          </div>
        </div>
      </Section>

      <Section title="Who lives with you">
        <div className="space-y-4">
          <Stepper label="Adults" value={h.adults} min={1} max={20} onChange={(v) => setPeople(v, h.children)} />
          <Stepper label="Children" value={h.children} min={0} max={20} onChange={(v) => setPeople(h.adults, v)} />
          <div className="border-t border-border pt-4">
            <Stepper
              label="Cooking for"
              value={h.cookingFor}
              min={1}
              max={30}
              onChange={(v) => set({ cookingFor: v })}
            />
            <p className="mt-2 text-[15px] text-muted">Usually everyone at home — change it if you cook for more or fewer.</p>
          </div>
        </div>
        <FieldError message={errors.adults ?? errors.cookingFor} />
      </Section>

      <Section title="Which meals should we plan?">
        <ChipGroup label="Meals to plan">
          {mealTypes.map((m) => (
            <Chip
              key={m.code}
              selected={h.mealsIncluded.includes(m.code)}
              onToggle={() => set({ mealsIncluded: toggle(h.mealsIncluded, m.code) })}
            >
              {m.label}
            </Chip>
          ))}
        </ChipGroup>
        <FieldError message={errors.mealsIncluded} />

        {h.mealsIncluded.includes("dinner") ? (
          <div className="mt-5 border-t border-border pt-4">
            <Stepper
              label="Dinners per week"
              value={h.dinnersPerWeek}
              min={0}
              max={7}
              onChange={(v) => set({ dinnersPerWeek: v })}
            />
            <FieldError message={errors.dinnersPerWeek} />
          </div>
        ) : null}

        <div className="mt-5 border-t border-border pt-4">
          <Switch
            label="Different portions for some meals"
            description="e.g. lunch for one, dinner for the whole family"
            checked={customPortions}
            onChange={(on) => {
              setCustomPortions(on);
              if (!on) set({ servingsByMeal: {} });
            }}
          />
          {customPortions ? (
            <div className="mt-4 space-y-3">
              {h.mealsIncluded.map((meal) => (
                <Stepper
                  key={meal}
                  label={`${mealTypes.find((m) => m.code === meal)?.label ?? meal} servings`}
                  value={h.servingsByMeal[meal] ?? h.cookingFor}
                  min={1}
                  max={30}
                  onChange={(v) => setMealServings(meal, v)}
                />
              ))}
            </div>
          ) : null}
        </div>
      </Section>
    </div>
  );
}
