"use client";

import { hasStoreLookup } from "@kitchen-pantry/integrations";
import { equipment, knownRetailers, skillLevels } from "@kitchen-pantry/shared-types";
import { Store } from "lucide-react";
import { Chip, ChipGroup, ChoiceCard, FieldError, TextInput } from "@/components/ui/controls";
import { Section } from "./section";
import { toggle, type StepProps } from "./types";

export function SkillStep({ profile, setProfile }: StepProps) {
  return (
    <Section title="How comfortable are you in the kitchen?" description="You can change this any time from your profile.">
      <div role="radiogroup" aria-label="Cooking skill" className="space-y-2.5">
        {skillLevels.map((s) => (
          <ChoiceCard
            key={s.level}
            selected={profile.skillLevel === s.level}
            onSelect={() => setProfile((p) => ({ ...p, skillLevel: s.level }))}
            title={s.label}
            description={s.summary}
            leading={
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-strong text-[17px] font-bold tabular-nums">
                {s.level}
              </span>
            }
          />
        ))}
      </div>
    </Section>
  );
}

export function EquipmentStep({ profile, setProfile, errors }: StepProps) {
  return (
    <Section
      title="What can you cook with?"
      description="Anything you don't have is filtered out — you'll never be handed a dinner you can't make."
    >
      <ChipGroup label="Kitchen equipment">
        {equipment.map((e) => (
          <Chip
            key={e.code}
            selected={profile.equipment.includes(e.code)}
            onToggle={() => setProfile((p) => ({ ...p, equipment: toggle(p.equipment, e.code) }))}
          >
            {e.label}
          </Chip>
        ))}
      </ChipGroup>
      <FieldError message={errors.equipment} />
    </Section>
  );
}

export function StoreStep({ profile, setProfile }: StepProps) {
  const usual = profile.store.usualRetailer;
  const isKnown = knownRetailers.some((r) => r.slug === usual);
  const lookup = hasStoreLookup(profile.household.country);
  const setUsual = (value: string | null) =>
    setProfile((p) => ({ ...p, store: { ...p.store, usualRetailer: value } }));

  return (
    <div className="space-y-4">
      <div className="flex gap-4 rounded-card border border-border p-5">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface text-muted">
          <Store className="size-5" aria-hidden />
        </div>
        <div>
          <p className="font-semibold">
            {lookup ? "Stores near you" : "Live store lookup isn't available yet"}
          </p>
          <p className="mt-1 text-[15px] leading-snug text-muted">
            {lookup
              ? "Choose the store you shop at for local prices."
              : `We only show a store's prices once we can get them from that store directly. Until then, every price is clearly marked as an estimate.`}
          </p>
        </div>
      </div>

      <Section
        title="Where do you usually shop?"
        description="Optional. This helps us decide which stores to connect first — it doesn't mean prices are available."
      >
        <ChipGroup label="Usual store">
          {knownRetailers.map((r) => (
            <Chip key={r.slug} selected={usual === r.slug} onToggle={() => setUsual(usual === r.slug ? null : r.slug)}>
              {r.name}
            </Chip>
          ))}
        </ChipGroup>
        <div className="mt-4">
          <label htmlFor="other-store" className="mb-1.5 block text-[15px] font-semibold">
            Somewhere else
          </label>
          <TextInput
            id="other-store"
            placeholder="Store name"
            maxLength={80}
            value={usual && !isKnown ? usual : ""}
            onChange={(e) => setUsual(e.target.value ? e.target.value : null)}
          />
        </div>
      </Section>
    </div>
  );
}
