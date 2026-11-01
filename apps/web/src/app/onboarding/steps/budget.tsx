"use client";

import { budgetIncludes, budgetPeriods, budgetPriorities } from "@kitchen-pantry/shared-types";
import { useState } from "react";
import { Chip, ChipGroup, ChoiceCard, FieldError, Segmented, Switch } from "@/components/ui/controls";
import { Section } from "./section";
import { toggle, type StepProps } from "./types";

const QUICK_AMOUNTS = [7_500, 12_500, 20_000];

function centsToInput(cents: number | null): string {
  if (cents === null) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function BudgetStep({ profile, setProfile, errors }: StepProps) {
  const b = profile.budget;
  const [lastAmount, setLastAmount] = useState(b.amountCents ?? 12_500);
  const [text, setText] = useState(centsToInput(b.amountCents));
  const noBudget = b.amountCents === null;

  const set = (patch: Partial<typeof b>) => setProfile((p) => ({ ...p, budget: { ...p.budget, ...patch } }));

  const setAmount = (cents: number) => {
    setLastAmount(cents);
    setText(centsToInput(cents));
    set({ amountCents: cents });
  };

  return (
    <div className="space-y-4">
      <Section title="What is your grocery budget?">
        <div className={noBudget ? "pointer-events-none opacity-40" : undefined} aria-disabled={noBudget}>
          <label htmlFor="budget" className="sr-only">
            Budget amount in dollars
          </label>
          <div className="flex items-baseline gap-1">
            <span className="text-[44px] font-bold leading-none" aria-hidden>
              $
            </span>
            <input
              id="budget"
              inputMode="decimal"
              value={text}
              disabled={noBudget}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9.]/g, "");
                setText(value);
                const dollars = Number.parseFloat(value);
                if (Number.isFinite(dollars)) {
                  const cents = Math.round(dollars * 100);
                  setLastAmount(cents);
                  set({ amountCents: cents });
                }
              }}
              aria-invalid={Boolean(errors.amountCents) || undefined}
              className="w-full bg-transparent text-[44px] font-bold leading-none tracking-tight outline-none"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {QUICK_AMOUNTS.map((cents) => (
              <Chip key={cents} selected={b.amountCents === cents} onToggle={() => setAmount(cents)}>
                ${cents / 100}
              </Chip>
            ))}
          </div>
          <div className="mt-4">
            <Segmented
              label="Budget period"
              value={b.period}
              onChange={(period) => set({ period })}
              options={budgetPeriods.map((p) => ({ value: p.code, label: p.shortLabel }))}
            />
          </div>
        </div>
        <FieldError message={errors.amountCents} />
        <div className="mt-5 border-t border-border pt-4">
          <Switch
            label="No strict budget"
            description="We'll still show what each week costs."
            checked={noBudget}
            onChange={(on) => {
              if (on) set({ amountCents: null });
              else {
                setText(centsToInput(lastAmount));
                set({ amountCents: lastAmount });
              }
            }}
          />
        </div>
      </Section>

      <Section title="What does it need to cover?" description="Tick everything this budget pays for.">
        <ChipGroup label="Budget covers">
          {budgetIncludes.map((item) => (
            <Chip
              key={item.code}
              selected={b.includes.includes(item.code)}
              onToggle={() => set({ includes: toggle(b.includes, item.code) })}
            >
              {item.label}
            </Chip>
          ))}
        </ChipGroup>
      </Section>

      <Section title="What matters most?">
        <div role="radiogroup" aria-label="Budget priority" className="grid gap-2.5 sm:grid-cols-2">
          {budgetPriorities.map((p) => (
            <ChoiceCard
              key={p.code}
              selected={b.priority === p.code}
              onSelect={() => set({ priority: p.code })}
              title={p.label}
              description={p.description}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}
