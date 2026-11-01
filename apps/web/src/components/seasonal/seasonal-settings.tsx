"use client";

import { regionFor, seasonalContext } from "@kitchen-pantry/recipe-engine";
import { holidays, seasonalRegions, type CountryCode, type HolidayCode, type OnboardingProfile, type SeasonalSettings } from "@kitchen-pantry/shared-types";
import { Card, Eyebrow, Hint } from "@/components/ui/card";
import { Chip, ChipGroup, Switch } from "@/components/ui/controls";

const PARTS: Array<{ key: "produce" | "meals" | "desserts" | "holidays" | "deals"; label: string }> = [
  { key: "produce", label: "Seasonal produce" },
  { key: "meals", label: "Seasonal meals" },
  { key: "desserts", label: "Seasonal desserts" },
  { key: "holidays", label: "Holiday & occasion recipes" },
  { key: "deals", label: "Seasonal grocery deals" },
];

const seasonLabel = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** Profile → Seasons. Every part can be changed at any time; nothing is ever hidden because it's out of season. */
export function SeasonalSettingsCard({
  profile,
  today,
  shared,
  onChange,
}: {
  profile: OnboardingProfile;
  today: string;
  shared: boolean;
  onChange: (next: SeasonalSettings) => void;
}) {
  const s = profile.seasonal;
  const set = (patch: Partial<SeasonalSettings>) => onChange({ ...s, ...patch });
  const detected = regionFor(profile.household.country as CountryCode, profile.household.postalCode, null);
  const detectedLabel = seasonalRegions.find((r) => r.code === detected.code)?.label ?? "";
  const now = seasonalContext({ ...profile, seasonal: { ...s, enabled: true } }, today)!;

  return (
    <Card className="lg:col-span-2" id="seasons">
      <Eyebrow>Seasons</Eyebrow>
      <p className="mt-1.5 text-[16px] text-muted">
        It&apos;s {seasonLabel(now.season).toLowerCase()} where you are. Seasonal recipes get a gentle boost — nothing out of season is ever hidden.
      </p>
      <div className="mt-4 space-y-5">
        <Switch
          label="Enjoy seasonal recipes"
          description="Updates by itself as the seasons change."
          checked={s.enabled}
          onChange={(enabled) => set({ enabled })}
        />
        {s.enabled ? (
          <>
            <div>
              <p className="mb-2 text-[15px] font-semibold">What to include</p>
              <ChipGroup label="What to include">
                {PARTS.map((p) => (
                  <Chip key={p.key} selected={s[p.key]} onToggle={() => set({ [p.key]: !s[p.key] })}>
                    {p.label}
                  </Chip>
                ))}
              </ChipGroup>
              {s.deals ? (
                <Hint>Deals use your store's real sale prices — we never assume in-season food is cheaper.</Hint>
              ) : null}
            </div>
            {s.holidays ? (
              <div>
                <p className="mb-1 text-[15px] font-semibold">Holidays you celebrate</p>
                <p className="mb-2 text-[14px] text-muted">None are assumed. Pick any you&apos;d like recipe ideas for.</p>
                <ChipGroup label="Holidays you celebrate">
                  {holidays.map((h) => (
                    <Chip
                      key={h.code}
                      selected={s.holidayOptIns.includes(h.code)}
                      onToggle={() =>
                        set({
                          holidayOptIns: s.holidayOptIns.includes(h.code)
                            ? s.holidayOptIns.filter((x) => x !== h.code)
                            : [...s.holidayOptIns, h.code as HolidayCode],
                        })
                      }
                    >
                      {h.label}
                    </Chip>
                  ))}
                </ChipGroup>
              </div>
            ) : null}
            <div>
              <p className="mb-1 text-[15px] font-semibold">Your climate</p>
              <p className="mb-2 text-[14px] text-muted">
                Worked out from {detected.basis}: {detectedLabel.toLowerCase()}. Change it if that&apos;s not right.
              </p>
              <ChipGroup label="Your climate">
                <Chip selected={s.region === null} onToggle={() => set({ region: null })}>
                  Automatic
                </Chip>
                {seasonalRegions.map((r) => (
                  <Chip key={r.code} selected={s.region === r.code} onToggle={() => set({ region: r.code })}>
                    {r.label}
                  </Chip>
                ))}
              </ChipGroup>
            </div>
          </>
        ) : null}
      </div>
      {shared ? <Hint>Your climate is shared with your household; the rest is just yours.</Hint> : null}
    </Card>
  );
}
