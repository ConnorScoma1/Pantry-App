import { regionFor, seasonalContext } from "@kitchen-pantry/recipe-engine";
import { holidays, seasonalRegions, type CountryCode, type HolidayCode, type OnboardingProfile, type SeasonalSettings } from "@kitchen-pantry/shared-types";
import { Text, View } from "react-native";
import { Chip, ChipRow, Toggle } from "@/components/controls";
import { Body, Card, Eyebrow } from "@/components/ui";

const PARTS: Array<{ key: "produce" | "meals" | "desserts" | "holidays" | "deals"; label: string }> = [
  { key: "produce", label: "Seasonal produce" },
  { key: "meals", label: "Seasonal meals" },
  { key: "desserts", label: "Seasonal desserts" },
  { key: "holidays", label: "Holiday & occasion recipes" },
  { key: "deals", label: "Seasonal grocery deals" },
];

/** Profile → Seasons (same rules as the web: a nudge, never a filter; holidays only when picked). */
export function SeasonalSettingsCard({
  profile,
  today,
  onChange,
}: {
  profile: OnboardingProfile;
  today: string;
  onChange: (next: SeasonalSettings) => void;
}) {
  const s = profile.seasonal;
  const set = (patch: Partial<SeasonalSettings>) => onChange({ ...s, ...patch });
  const detected = regionFor(profile.household.country as CountryCode, profile.household.postalCode, null);
  const detectedLabel = seasonalRegions.find((r) => r.code === detected.code)?.label ?? "";
  const now = seasonalContext({ ...profile, seasonal: { ...s, enabled: true } }, today)!;
  const shared = Boolean(profile.householdDiet && profile.householdDiet.memberCount > 1);

  return (
    <Card>
      <Eyebrow>Seasons</Eyebrow>
      <Body>It&apos;s {now.season} where you are. Seasonal recipes get a gentle boost — nothing out of season is ever hidden.</Body>
      <View className="mt-4">
        <Toggle label="Enjoy seasonal recipes" description="Updates by itself as the seasons change." value={s.enabled} onChange={(enabled) => set({ enabled })} />
      </View>
      {s.enabled ? (
        <>
          <Text className="mb-2 mt-4 text-[15px] font-semibold text-foreground">What to include</Text>
          <ChipRow>
            {PARTS.map((p) => (
              <Chip key={p.key} label={p.label} selected={s[p.key]} onPress={() => set({ [p.key]: !s[p.key] })} />
            ))}
          </ChipRow>
          {s.deals ? <Body>Deals use your store's real sale prices — we never assume in-season food is cheaper.</Body> : null}
          {s.holidays ? (
            <>
              <Text className="mt-4 text-[15px] font-semibold text-foreground">Holidays you celebrate</Text>
              <Text className="mb-2 text-[14px] text-muted">None are assumed. Pick any you&apos;d like recipe ideas for.</Text>
              <ChipRow>
                {holidays.map((h) => (
                  <Chip
                    key={h.code}
                    label={h.label}
                    selected={s.holidayOptIns.includes(h.code)}
                    onPress={() =>
                      set({
                        holidayOptIns: s.holidayOptIns.includes(h.code)
                          ? s.holidayOptIns.filter((x) => x !== h.code)
                          : [...s.holidayOptIns, h.code as HolidayCode],
                      })
                    }
                  />
                ))}
              </ChipRow>
            </>
          ) : null}
          <Text className="mt-4 text-[15px] font-semibold text-foreground">Your climate</Text>
          <Text className="mb-2 text-[14px] text-muted">
            Worked out from {detected.basis}: {detectedLabel.toLowerCase()}. Change it if that&apos;s not right.
          </Text>
          <ChipRow>
            <Chip label="Automatic" selected={s.region === null} onPress={() => set({ region: null })} />
            {seasonalRegions.map((r) => (
              <Chip key={r.code} label={r.label} selected={s.region === r.code} onPress={() => set({ region: r.code })} />
            ))}
          </ChipRow>
        </>
      ) : null}
      {shared ? <Body>Your climate is shared with your household; the rest is just yours.</Body> : null}
    </Card>
  );
}
