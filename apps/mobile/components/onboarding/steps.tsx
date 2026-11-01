import Ionicons from "@expo/vector-icons/Ionicons";
import {
  allergens,
  budgetIncludes,
  budgetPeriods,
  budgetPriorities,
  commonDislikes,
  cookingGoals,
  countries,
  cuisines,
  dietaryRestrictions,
  dietStyles,
  equipment,
  knownRetailers,
  labelFor,
  mealTypes,
  proteins,
  skillLevels,
  type OnboardingProfile,
} from "@kitchen-pantry/shared-types";
import type { OnboardingStepId } from "@kitchen-pantry/validation";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Chip, ChipRow, ChoiceCard, Field, Input, Notice, Section, Segmented, Stepper, Toggle } from "@/components/controls";
import { useThemeColors } from "@/lib/theme";

export interface StepProps {
  profile: OnboardingProfile;
  setProfile: (update: (p: OnboardingProfile) => OnboardingProfile) => void;
  errors: Record<string, string>;
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function ErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" className="mt-2 text-[15px] font-medium text-danger">
      {message}
    </Text>
  );
}

// ---------------------------------------------------------------------------

export function HouseholdStep({ profile, setProfile, errors }: StepProps) {
  const h = profile.household;
  const set = (patch: Partial<typeof h>) => setProfile((p) => ({ ...p, household: { ...p.household, ...patch } }));
  const country = countries.find((c) => c.code === h.country) ?? countries[0];
  const setPeople = (adults: number, children: number) => {
    const follows = h.cookingFor === h.adults + h.children;
    set({ adults, children, ...(follows ? { cookingFor: Math.max(1, adults + children) } : {}) });
  };

  return (
    <View className="gap-4">
      <Section title="Where you shop" description="Used to find stores and local prices once those are connected.">
        <View className="gap-4">
          <Field label="Country">
            <ChipRow>
              {countries.map((c) => (
                <Chip key={c.code} label={c.label} selected={h.country === c.code} onPress={() => set({ country: c.code })} />
              ))}
            </ChipRow>
          </Field>
          <Field label={country.postalLabel} error={errors.postalCode}>
            <Input
              value={h.postalCode}
              onChangeText={(postalCode) => set({ postalCode })}
              keyboardType={h.country === "US" || h.country === "AU" ? "number-pad" : "default"}
              autoComplete="postal-code"
              placeholder={h.country === "US" ? "e.g. 53132" : undefined}
              invalid={Boolean(errors.postalCode)}
              accessibilityLabel={country.postalLabel}
            />
          </Field>
        </View>
      </Section>

      <Section title="Who lives with you">
        <View className="gap-4">
          <Stepper label="Adults" value={h.adults} min={1} onChange={(v) => setPeople(v, h.children)} />
          <Stepper label="Children" value={h.children} onChange={(v) => setPeople(h.adults, v)} />
          <View className="border-t border-border pt-4">
            <Stepper label="Cooking for" value={h.cookingFor} min={1} max={30} onChange={(v) => set({ cookingFor: v })} />
          </View>
        </View>
        <ErrorText message={errors.adults ?? errors.cookingFor} />
      </Section>

      <Section title="Which meals should we plan?">
        <ChipRow>
          {mealTypes.map((m) => (
            <Chip
              key={m.code}
              label={m.label}
              selected={h.mealsIncluded.includes(m.code)}
              onPress={() => set({ mealsIncluded: toggle(h.mealsIncluded, m.code) })}
            />
          ))}
        </ChipRow>
        <ErrorText message={errors.mealsIncluded} />
        {h.mealsIncluded.includes("dinner") ? (
          <View className="mt-5 border-t border-border pt-4">
            <Stepper label="Dinners per week" value={h.dinnersPerWeek} max={7} onChange={(v) => set({ dinnersPerWeek: v })} />
            <ErrorText message={errors.dinnersPerWeek} />
          </View>
        ) : null}
      </Section>
    </View>
  );
}

// ---------------------------------------------------------------------------

const QUICK_AMOUNTS = [7_500, 12_500, 20_000];

export function BudgetStep({ profile, setProfile, errors }: StepProps) {
  const b = profile.budget;
  const set = (patch: Partial<typeof b>) => setProfile((p) => ({ ...p, budget: { ...p.budget, ...patch } }));
  const [last, setLast] = useState(b.amountCents ?? 12_500);
  const [text, setText] = useState(b.amountCents === null ? "" : String(b.amountCents / 100));
  const none = b.amountCents === null;

  return (
    <View className="gap-4">
      <Section title="What is your grocery budget?">
        <View className={none ? "opacity-40" : ""} pointerEvents={none ? "none" : "auto"}>
          <View className="flex-row items-baseline">
            <Text className="text-[44px] font-bold text-foreground">$</Text>
            <Input
              value={text}
              onChangeText={(value) => {
                const clean = value.replace(/[^0-9.]/g, "");
                setText(clean);
                const dollars = Number.parseFloat(clean);
                if (Number.isFinite(dollars)) {
                  const cents = Math.round(dollars * 100);
                  setLast(cents);
                  set({ amountCents: cents });
                }
              }}
              keyboardType="decimal-pad"
              accessibilityLabel="Budget amount in dollars"
              className="flex-1 border-0 bg-transparent px-1 text-[44px] font-bold"
            />
          </View>
          <View className="mt-3">
            <ChipRow>
              {QUICK_AMOUNTS.map((cents) => (
                <Chip
                  key={cents}
                  label={`$${cents / 100}`}
                  selected={b.amountCents === cents}
                  onPress={() => {
                    setLast(cents);
                    setText(String(cents / 100));
                    set({ amountCents: cents });
                  }}
                />
              ))}
            </ChipRow>
          </View>
          <View className="mt-4">
            <Segmented
              value={b.period}
              onChange={(period) => set({ period })}
              options={budgetPeriods.map((p) => ({ value: p.code, label: p.shortLabel }))}
            />
          </View>
        </View>
        <ErrorText message={errors.amountCents} />
        <View className="mt-5 border-t border-border pt-4">
          <Toggle
            label="No strict budget"
            description="We'll still show what each week costs."
            value={none}
            onChange={(on) => {
              if (on) set({ amountCents: null });
              else {
                setText(String(last / 100));
                set({ amountCents: last });
              }
            }}
          />
        </View>
      </Section>

      <Section title="What does it need to cover?">
        <ChipRow>
          {budgetIncludes.map((i) => (
            <Chip key={i.code} label={i.label} selected={b.includes.includes(i.code)} onPress={() => set({ includes: toggle(b.includes, i.code) })} />
          ))}
        </ChipRow>
      </Section>

      <Section title="What matters most?">
        <View className="gap-2.5" accessibilityRole="radiogroup">
          {budgetPriorities.map((p) => (
            <ChoiceCard key={p.code} title={p.label} description={p.description} selected={b.priority === p.code} onPress={() => set({ priority: p.code })} />
          ))}
        </View>
      </Section>
    </View>
  );
}

// ---------------------------------------------------------------------------

export function GoalsStep({ profile, setProfile, errors }: StepProps) {
  const c = useThemeColors();
  const ranked = profile.goals.ranked;
  const setRanked = (next: typeof ranked) => setProfile((p) => ({ ...p, goals: { ranked: next } }));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= ranked.length) return;
    const next = [...ranked];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setRanked(next);
  };

  return (
    <View className="gap-4">
      <Section title="What do you want from cooking?" description="Pick as many as you like.">
        <ChipRow>
          {cookingGoals.map((g) => (
            <Chip key={g.code} label={g.label} selected={ranked.includes(g.code)} onPress={() => setRanked(toggle(ranked, g.code))} />
          ))}
        </ChipRow>
        <ErrorText message={errors.ranked} />
      </Section>
      {ranked.length > 1 ? (
        <Section title="Put them in order" description="Your top goals carry the most weight when we plan.">
          <View className="gap-2">
            {ranked.map((goal, i) => {
              const label = labelFor(cookingGoals, goal);
              return (
                <View key={goal} className="flex-row items-center gap-2 rounded-2xl bg-background py-1.5 pr-1.5 pl-4">
                  <Text className="w-5 font-bold text-muted">{i + 1}</Text>
                  <Text className="flex-1 text-[16px] font-medium text-foreground">{label}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Move ${label} up`} disabled={i === 0} onPress={() => move(i, -1)} className={`size-10 items-center justify-center ${i === 0 ? "opacity-30" : ""}`}>
                    <Ionicons name="arrow-up" size={18} color={c.muted} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Move ${label} down`} disabled={i === ranked.length - 1} onPress={() => move(i, 1)} className={`size-10 items-center justify-center ${i === ranked.length - 1 ? "opacity-30" : ""}`}>
                    <Ionicons name="arrow-down" size={18} color={c.muted} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Section>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------

function TagAdder({ placeholder, values, onChange }: { placeholder: string; values: string[]; onChange: (v: string[]) => void }) {
  const c = useThemeColors();
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim().slice(0, 60);
    if (value && !values.some((v) => v.toLowerCase() === value.toLowerCase())) onChange([...values, value]);
    setDraft("");
  };
  return (
    <View>
      <View className="flex-row gap-2">
        <Input value={draft} onChangeText={setDraft} placeholder={placeholder} onSubmitEditing={add} returnKeyType="done" className="flex-1" accessibilityLabel={placeholder} />
        <Pressable accessibilityRole="button" accessibilityLabel="Add" onPress={add} className="size-[52px] items-center justify-center rounded-full bg-foreground">
          <Ionicons name="add" size={22} color={c.background} />
        </Pressable>
      </View>
      {values.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {values.map((v) => (
            <Pressable key={v} accessibilityRole="button" accessibilityLabel={`Remove ${v}`} onPress={() => onChange(values.filter((x) => x !== v))} className="min-h-10 flex-row items-center gap-1.5 rounded-full bg-foreground px-4">
              <Text className="text-[15px] font-medium text-background">{v}</Text>
              <Ionicons name="close" size={16} color={c.background} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function DietStep({ profile, setProfile, errors }: StepProps) {
  const d = profile.diet;
  const set = (patch: Partial<typeof d>) => setProfile((p) => ({ ...p, diet: { ...p.diet, ...patch } }));
  const has = (list: string[], v: string) => list.some((x) => x.toLowerCase() === v.toLowerCase());
  const custom = d.dislikes.filter((x) => !commonDislikes.some((c) => c.toLowerCase() === x.toLowerCase()));
  const num = (v: string) => (v.replace(/\D/g, "") ? Number.parseInt(v.replace(/\D/g, ""), 10) : null);

  return (
    <View className="gap-4">
      <Section title="Allergies" description="Treated as strict exclusions — including hidden sources like whey, tahini or soy sauce.">
        <ChipRow>
          {allergens.map((a) => (
            <Chip key={a.code} label={a.label} selected={d.allergies.includes(a.code)} onPress={() => set({ allergies: toggle(d.allergies, a.code) })} />
          ))}
        </ChipRow>
        {d.allergies.length > 0 ? (
          <View className="mt-4">
            <Notice tone="warning">
              We&apos;ll leave out recipes with these ingredients and flag cross-contact risks, but we can&apos;t guarantee any
              dish is allergen-free. Always check product labels.
            </Notice>
          </View>
        ) : null}
      </Section>

      <Section title="Diet">
        <Segmented value={d.style} onChange={(style) => set({ style })} options={dietStyles.map((s) => ({ value: s.code, label: s.label }))} />
        <View className="mt-4">
          <ChipRow>
            {dietaryRestrictions.map((r) => (
              <Chip key={r.code} label={r.label} selected={d.restrictions.includes(r.code)} onPress={() => set({ restrictions: toggle(d.restrictions, r.code) })} />
            ))}
          </ChipRow>
        </View>
      </Section>

      <Section title="Won't eat">
        <ChipRow>
          {commonDislikes.map((item) => (
            <Chip
              key={item}
              label={item}
              selected={has(d.dislikes, item)}
              onPress={() => set({ dislikes: has(d.dislikes, item) ? d.dislikes.filter((x) => x.toLowerCase() !== item.toLowerCase()) : [...d.dislikes, item] })}
            />
          ))}
        </ChipRow>
        <View className="mt-4">
          <TagAdder
            placeholder="Leave out something else"
            values={custom}
            onChange={(values) => set({ dislikes: [...d.dislikes.filter((x) => !custom.includes(x)), ...values] })}
          />
        </View>
      </Section>

      <Section title="Never recommend" description="Hard no's — never in a plan, even as a minor ingredient.">
        <TagAdder placeholder="e.g. liver, blue cheese" values={d.neverRecommend} onChange={(neverRecommend) => set({ neverRecommend })} />
      </Section>

      <Section title="Cuisines you love" description="Optional.">
        <ChipRow>
          {cuisines.map((c) => (
            <Chip key={c.code} label={c.label} selected={d.cuisines.includes(c.code)} onPress={() => set({ cuisines: toggle(d.cuisines, c.code) })} />
          ))}
        </ChipRow>
      </Section>

      <Section title="Favourite proteins" description="Optional.">
        <ChipRow>
          {proteins.map((p) => (
            <Chip key={p.code} label={p.label} selected={d.proteins.includes(p.code)} onPress={() => set({ proteins: toggle(d.proteins, p.code) })} />
          ))}
        </ChipRow>
      </Section>

      <Section title="Nutrition targets" description="Optional, per person per day.">
        <View className="gap-4">
          <Field label="Calories" error={errors["nutrition.caloriesPerDay"]}>
            <Input
              keyboardType="number-pad"
              placeholder="e.g. 2000"
              value={d.nutrition.caloriesPerDay?.toString() ?? ""}
              onChangeText={(v) => set({ nutrition: { ...d.nutrition, caloriesPerDay: num(v) } })}
              accessibilityLabel="Calories per day"
            />
          </Field>
          <Field label="Protein (grams)" error={errors["nutrition.proteinGramsPerDay"]}>
            <Input
              keyboardType="number-pad"
              placeholder="e.g. 120"
              value={d.nutrition.proteinGramsPerDay?.toString() ?? ""}
              onChangeText={(v) => set({ nutrition: { ...d.nutrition, proteinGramsPerDay: num(v) } })}
              accessibilityLabel="Protein grams per day"
            />
          </Field>
        </View>
      </Section>
    </View>
  );
}

// ---------------------------------------------------------------------------

export function SkillStep({ profile, setProfile }: StepProps) {
  return (
    <Section title="How comfortable are you in the kitchen?" description="You can change this any time from your profile.">
      <View className="gap-2.5" accessibilityRole="radiogroup">
        {skillLevels.map((s) => (
          <ChoiceCard
            key={s.level}
            title={s.label}
            description={s.summary}
            selected={profile.skillLevel === s.level}
            onPress={() => setProfile((p) => ({ ...p, skillLevel: s.level }))}
            leading={
              <View className="size-10 items-center justify-center rounded-full bg-surface-strong">
                <Text className="text-[17px] font-bold text-foreground">{s.level}</Text>
              </View>
            }
          />
        ))}
      </View>
    </Section>
  );
}

export function EquipmentStep({ profile, setProfile, errors }: StepProps) {
  return (
    <Section title="What can you cook with?" description="Anything you don't have is filtered out — you'll never be handed a dinner you can't make.">
      <ChipRow>
        {equipment.map((e) => (
          <Chip
            key={e.code}
            label={e.label}
            selected={profile.equipment.includes(e.code)}
            onPress={() => setProfile((p) => ({ ...p, equipment: toggle(p.equipment, e.code) }))}
          />
        ))}
      </ChipRow>
      <ErrorText message={errors.equipment} />
    </Section>
  );
}

export function StoreStep({ profile, setProfile }: StepProps) {
  const usual = profile.store.usualRetailer;
  const known = knownRetailers.some((r) => r.slug === usual);
  const setUsual = (v: string | null) => setProfile((p) => ({ ...p, store: { ...p.store, usualRetailer: v } }));
  return (
    <View className="gap-4">
      <Notice>
        Live store lookup isn&apos;t available yet. We only show a store&apos;s prices once we can get them from that store
        directly — until then, every price is clearly marked as an estimate.
      </Notice>
      <Section title="Where do you usually shop?" description="Optional. This helps us decide which stores to connect first.">
        <ChipRow>
          {knownRetailers.map((r) => (
            <Chip key={r.slug} label={r.name} selected={usual === r.slug} onPress={() => setUsual(usual === r.slug ? null : r.slug)} />
          ))}
        </ChipRow>
        <View className="mt-4">
          <Field label="Somewhere else">
            <Input
              placeholder="Store name"
              maxLength={80}
              value={usual && !known ? usual : ""}
              onChangeText={(v) => setUsual(v ? v : null)}
              accessibilityLabel="Other store name"
            />
          </Field>
        </View>
      </Section>
    </View>
  );
}

// ---------------------------------------------------------------------------

export function ReviewStep({ profile, onEdit }: { profile: OnboardingProfile; onEdit: (id: OnboardingStepId) => void }) {
  const { household: h, budget: b, diet: d } = profile;
  const list = (items: string[], empty = "None") => (items.length ? items.join(", ") : empty);
  const store = knownRetailers.find((r) => r.slug === profile.store.usualRetailer)?.name ?? profile.store.usualRetailer;
  const rows: Array<[OnboardingStepId, string, string]> = [
    ["household", "Household", `Cooking for ${h.cookingFor} · ${list(h.mealsIncluded.map((m) => labelFor(mealTypes, m)))} · ${h.postalCode}`],
    ["budget", "Budget", b.amountCents === null ? "No strict budget" : `$${(b.amountCents / 100).toFixed(b.amountCents % 100 ? 2 : 0)} ${labelFor(budgetPeriods, b.period)} · ${labelFor(budgetPriorities, b.priority)}`],
    ["goals", "Goals", list(profile.goals.ranked.map((g, i) => `${i + 1}. ${labelFor(cookingGoals, g)}`))],
    ["diet", "What you eat", `${labelFor(dietStyles, d.style)} · Allergies: ${list(d.allergies.map((a) => labelFor(allergens, a)))}`],
    ["skill", "Skill", `Level ${profile.skillLevel} · ${skillLevels.find((s) => s.level === profile.skillLevel)?.label}`],
    ["equipment", "Kitchen", list(profile.equipment.map((e) => labelFor(equipment, e)))],
    ["store", "Store", store ?? "Not chosen"],
  ];
  return (
    <View className="gap-3">
      {rows.map(([id, title, text]) => (
        <View key={id} className="flex-row items-start gap-3 rounded-card bg-surface p-5">
          <View className="flex-1">
            <Text className="text-[13px] font-semibold uppercase tracking-widest text-muted">{title}</Text>
            <Text className="mt-1.5 text-[16px] leading-6 text-foreground">{text}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${title}`} onPress={() => onEdit(id)} className="min-h-10 justify-center rounded-full border border-border bg-background px-4">
            <Text className="text-[15px] font-semibold text-foreground">Edit</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
