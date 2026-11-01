"use client";

import {
  allergens,
  commonDislikes,
  cuisines,
  dietaryRestrictions,
  dietStyles,
  proteins,
} from "@kitchen-pantry/shared-types";
import { ShieldAlert } from "lucide-react";
import { Chip, ChipGroup, FieldError, Segmented, TextInput } from "@/components/ui/controls";
import { Section } from "./section";
import { TagInput } from "./tag-input";
import { toggle, type StepProps } from "./types";

export function DietStep({ profile, setProfile, errors }: StepProps) {
  const d = profile.diet;
  const set = (patch: Partial<typeof d>) => setProfile((p) => ({ ...p, diet: { ...p.diet, ...patch } }));
  const toggleDislike = (item: string) =>
    set({
      dislikes: d.dislikes.some((x) => x.toLowerCase() === item.toLowerCase())
        ? d.dislikes.filter((x) => x.toLowerCase() !== item.toLowerCase())
        : [...d.dislikes, item],
    });
  const shared = profile.householdDiet && profile.householdDiet.memberCount > 1 ? profile.householdDiet : null;
  const othersAvoid = shared ? shared.allergies.filter((a) => !d.allergies.includes(a)) : [];
  const customDislikes = d.dislikes.filter((x) => !commonDislikes.some((c) => c.toLowerCase() === x.toLowerCase()));

  const numberField = (value: number | null, onChange: (v: number | null) => void) => ({
    value: value ?? "",
    inputMode: "numeric" as const,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/\D/g, "");
      onChange(digits ? Number.parseInt(digits, 10) : null);
    },
  });

  return (
    <div className="space-y-4">
      <Section
        title={shared ? "Your allergies" : "Allergies"}
        description="Treated as strict exclusions — including hidden sources like whey, tahini or soy sauce."
      >
        {shared ? (
          <p className="mb-4 rounded-2xl bg-background px-4 py-3 text-[15px] leading-snug">
            {othersAvoid.length > 0
              ? `Meal plans already avoid ${othersAvoid.map((c) => allergens.find((a) => a.code === c)?.label ?? c).join(", ")} for others in your household. Just pick your own.`
              : "Just pick your own — meal plans avoid everyone's allergies in your household."}
          </p>
        ) : null}
        <ChipGroup label="Allergies">
          {allergens.map((a) => (
            <Chip key={a.code} selected={d.allergies.includes(a.code)} onToggle={() => set({ allergies: toggle(d.allergies, a.code) })}>
              {a.label}
            </Chip>
          ))}
        </ChipGroup>
        {d.allergies.length > 0 ? (
          <div className="mt-4 flex gap-3 rounded-2xl bg-warning/10 p-4 text-[15px] leading-snug">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            <p>
              We&apos;ll leave out recipes with these ingredients and flag cross-contact risks, but we can&apos;t
              guarantee any dish is allergen-free. Always check product labels.
            </p>
          </div>
        ) : null}
      </Section>

      <Section title="Diet">
        <Segmented
          label="Diet style"
          value={d.style}
          onChange={(style) => set({ style })}
          options={dietStyles.map((s) => ({ value: s.code, label: s.label }))}
        />
        <div className="mt-4">
          <ChipGroup label="Dietary restrictions">
            {dietaryRestrictions.map((r) => (
              <Chip
                key={r.code}
                selected={d.restrictions.includes(r.code)}
                onToggle={() => set({ restrictions: toggle(d.restrictions, r.code) })}
              >
                {r.label}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      </Section>

      <Section title="Won't eat" description="Foods you'd rather not see. We'll avoid them when we can.">
        <ChipGroup label="Foods you dislike">
          {commonDislikes.map((item) => (
            <Chip
              key={item}
              selected={d.dislikes.some((x) => x.toLowerCase() === item.toLowerCase())}
              onToggle={() => toggleDislike(item)}
            >
              {item}
            </Chip>
          ))}
        </ChipGroup>
        <div className="mt-4">
          <TagInput
            label="Other dislikes"
            placeholder="Leave out something else"
            values={customDislikes}
            onChange={(values) =>
              set({ dislikes: [...d.dislikes.filter((x) => !customDislikes.includes(x)), ...values] })
            }
          />
        </div>
      </Section>

      <Section title="Never recommend" description="Hard no's — these never appear in a plan, even as a minor ingredient.">
        <TagInput
          label="Never recommend"
          placeholder="e.g. liver, blue cheese"
          values={d.neverRecommend}
          onChange={(neverRecommend) => set({ neverRecommend })}
        />
      </Section>

      <Section title="Cuisines you love" description="Optional — we'll lean toward these.">
        <ChipGroup label="Preferred cuisines">
          {cuisines.map((c) => (
            <Chip key={c.code} selected={d.cuisines.includes(c.code)} onToggle={() => set({ cuisines: toggle(d.cuisines, c.code) })}>
              {c.label}
            </Chip>
          ))}
        </ChipGroup>
      </Section>

      <Section title="Favourite proteins" description="Optional.">
        <ChipGroup label="Preferred proteins">
          {proteins.map((p) => (
            <Chip key={p.code} selected={d.proteins.includes(p.code)} onToggle={() => set({ proteins: toggle(d.proteins, p.code) })}>
              {p.label}
            </Chip>
          ))}
        </ChipGroup>
      </Section>

      <Section title="Nutrition targets" description="Optional, per person per day.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="calories" className="mb-1.5 block text-[15px] font-semibold">
              Calories
            </label>
            <TextInput
              id="calories"
              placeholder="e.g. 2000"
              invalid={Boolean(errors["nutrition.caloriesPerDay"])}
              {...numberField(d.nutrition.caloriesPerDay, (v) => set({ nutrition: { ...d.nutrition, caloriesPerDay: v } }))}
            />
            <FieldError message={errors["nutrition.caloriesPerDay"]} />
          </div>
          <div>
            <label htmlFor="protein" className="mb-1.5 block text-[15px] font-semibold">
              Protein (grams)
            </label>
            <TextInput
              id="protein"
              placeholder="e.g. 120"
              invalid={Boolean(errors["nutrition.proteinGramsPerDay"])}
              {...numberField(d.nutrition.proteinGramsPerDay, (v) =>
                set({ nutrition: { ...d.nutrition, proteinGramsPerDay: v } }),
              )}
            />
            <FieldError message={errors["nutrition.proteinGramsPerDay"]} />
          </div>
        </div>
      </Section>
    </div>
  );
}
