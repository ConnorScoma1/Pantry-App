"use client";

import { cookingGoals, labelFor, type CookingGoal } from "@kitchen-pantry/shared-types";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Chip, ChipGroup, FieldError } from "@/components/ui/controls";
import { Section } from "./section";
import { toggle, type StepProps } from "./types";

export function GoalsStep({ profile, setProfile, errors }: StepProps) {
  const ranked = profile.goals.ranked;
  const setRanked = (next: CookingGoal[]) => setProfile((p) => ({ ...p, goals: { ranked: next } }));

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= ranked.length) return;
    const next = [...ranked];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setRanked(next);
  };

  return (
    <div className="space-y-4">
      <Section title="What do you want from cooking?" description="Pick as many as you like.">
        <ChipGroup label="Cooking goals">
          {cookingGoals.map((goal) => (
            <Chip
              key={goal.code}
              selected={ranked.includes(goal.code)}
              onToggle={() => setRanked(toggle(ranked, goal.code))}
            >
              {goal.label}
            </Chip>
          ))}
        </ChipGroup>
        <FieldError message={errors.ranked} />
      </Section>

      {ranked.length > 1 ? (
        <Section title="Put them in order" description="Your top goals carry the most weight when we plan.">
          <ol className="space-y-2">
            {ranked.map((goal, i) => (
              <li key={goal} className="flex items-center gap-3 rounded-2xl bg-background py-2 pr-2 pl-4">
                <span className="w-5 text-[15px] font-bold text-muted tabular-nums">{i + 1}</span>
                <span className="flex-1 text-[16px] font-medium">{labelFor(cookingGoals, goal)}</span>
                <IconButton label={`Move ${labelFor(cookingGoals, goal)} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" aria-hidden />
                </IconButton>
                <IconButton
                  label={`Move ${labelFor(cookingGoals, goal)} down`}
                  disabled={i === ranked.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="size-4" aria-hidden />
                </IconButton>
                <IconButton label={`Remove ${labelFor(cookingGoals, goal)}`} onClick={() => setRanked(toggle(ranked, goal))}>
                  <X className="size-4" aria-hidden />
                </IconButton>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  children,
  ...props
}: { label: string; children: React.ReactNode } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={label}
      className="grid size-10 place-items-center rounded-full text-muted transition-colors hover:bg-surface-strong hover:text-foreground disabled:opacity-30"
      {...props}
    >
      {children}
    </button>
  );
}
