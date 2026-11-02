import Ionicons from "@expo/vector-icons/Ionicons";
import { draftToInput, setServings, startOfWeek, toDraft, type DayAttendance } from "@kitchen-pantry/meal-planner";
import type { MealPlan } from "@kitchen-pantry/shared-types";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Segmented } from "@/components/controls";
import { Card, Eyebrow } from "@/components/ui";
import { useApp } from "@/lib/app-state";
import { useThemeColors } from "@/lib/theme";
import { useActivity, useAttendance } from "@/lib/use-household-life";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function EatingControls({ att, onEating, onGuests }: { att: DayAttendance; onEating: (eating: boolean | null) => void; onGuests: (n: number) => void }) {
  const c = useThemeColors();
  const round = "size-11 items-center justify-center rounded-full border border-border bg-background";
  return (
    <View className="gap-4">
      <Segmented
        options={[
          { value: "in", label: "I'm in" },
          { value: "out", label: "I'm out" },
        ]}
        value={att.you === false ? "out" : "in"}
        onChange={(v) => onEating(v === "in" ? null : false)}
      />
      <View className="flex-row flex-wrap gap-2">
        {[...att.eating, ...att.out].map((m) => {
          const out = att.out.includes(m);
          return (
            <View key={m.userId} accessibilityLabel={`${m.isYou ? "You" : m.name} ${out ? "out" : "eating"}`} className={`rounded-full px-3 py-1 ${out ? "bg-surface-strong" : "bg-accent-soft"}`}>
              <Text className={`text-[14px] font-medium ${out ? "text-muted line-through" : "text-foreground"}`}>
                {m.isYou ? "You" : m.name}
                {m.portion !== 1 ? ` ×${m.portion}` : ""}
              </Text>
            </View>
          );
        })}
        {att.others > 0 ? (
          <View className="rounded-full bg-accent-soft px-3 py-1">
            <Text className="text-[14px] font-medium text-foreground">+{plural(att.others, "other")} at home</Text>
          </View>
        ) : null}
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="text-[16px] font-medium text-foreground">Guests</Text>
        <View className="flex-row items-center gap-3">
          <Pressable accessibilityRole="button" accessibilityLabel="One fewer guest" disabled={att.guests <= 0} onPress={() => onGuests(att.guests - 1)} className={`${round} ${att.guests <= 0 ? "opacity-35" : ""}`}>
            <Ionicons name="remove" size={20} color={c.foreground} />
          </Pressable>
          <Text accessibilityLiveRegion="polite" className="min-w-6 text-center text-[18px] font-bold text-foreground">
            {att.guests}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="One more guest" disabled={att.guests >= 20} onPress={() => onGuests(att.guests + 1)} className={`${round} ${att.guests >= 20 ? "opacity-35" : ""}`}>
            <Ionicons name="add" size={20} color={c.foreground} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function EatingLine({ att, servings, busy, onOpen, onUseServings }: { att: DayAttendance; servings: number; busy: boolean; onOpen: () => void; onUseServings: (n: number) => void }) {
  const c = useThemeColors();
  const differs = att.servings > 0 && att.servings !== servings;
  return (
    <View className="mt-3 flex-row flex-wrap items-center gap-3">
      <Pressable accessibilityRole="button" accessibilityLabel="Who's eating" onPress={onOpen} className="min-h-9 flex-row items-center gap-1.5 rounded-full bg-background px-3">
        <Ionicons name="people-outline" size={16} color={c.muted} />
        <Text className="text-[14px] font-medium text-foreground">
          {att.servings === 0 ? "Nobody's eating" : `${plural(att.servings, "serving")} needed`}
          {att.summary && att.summary !== "Everyone's in" ? ` · ${att.summary}` : ""}
        </Text>
      </Pressable>
      {differs ? (
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => onUseServings(att.servings)}>
          <Text className="text-[14px] font-semibold text-accent underline">Use {att.servings}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Home: tonight's dinner and who's eating it. */
export function TonightCard({ today, plan, titleFor, onUseServings }: { today: string; plan: MealPlan | null; titleFor: (id: string) => string | null; onUseServings: (n: number) => Promise<void> }) {
  const eating = useAttendance(startOfWeek(today));
  const meal = plan?.meals.find((m) => m.date === today && m.mealType !== "dessert");
  const att = eating.forDay(today);
  if (!meal || !att) return null;
  const title = (meal.recipeId ? titleFor(meal.recipeId) : null) ?? meal.customTitle ?? "Dinner";
  const differs = att.servings > 0 && att.servings !== meal.servings;
  return (
    <Card>
      <Eyebrow>Dinner tonight</Eyebrow>
      <Text className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">{title}</Text>
      <Text className="mt-1 text-[15px] leading-5 text-muted">
        {att.servings === 0 ? "Nobody's eating tonight." : `${plural(att.servings, "serving")} needed`}
        {att.summary && att.summary !== "Everyone's in" ? ` · ${att.summary}` : ""}
        {differs ? ` · planned for ${meal.servings}` : ""}
      </Text>
      <View className="mt-4">
        <EatingControls att={att} onEating={(e) => void eating.setEating(today, e)} onGuests={(n) => void eating.setGuests(today, n)} />
      </View>
      {differs ? <Button className="mt-4" variant="secondary" label={`Make tonight ${att.servings} servings`} onPress={() => void onUseServings(att.servings)} /> : null}
    </Card>
  );
}

const PORTIONS = [
  { value: 0.5, label: "Small" },
  { value: 0.75, label: "Light" },
  { value: 1, label: "Usual" },
  { value: 1.5, label: "Hearty" },
  { value: 2, label: "Big" },
];

export function PortionCard({ today }: { today: string }) {
  const e = useAttendance(startOfWeek(today));
  const current = String(e.you?.portion ?? 1);
  return (
    <Card>
      <Eyebrow>Your usual portion</Eyebrow>
      <Text className="mt-1.5 mb-3 text-[15px] leading-5 text-muted">Only you can change this. It&apos;s used to suggest servings when people are in or out.</Text>
      <Segmented options={PORTIONS.map((p) => ({ value: String(p.value), label: p.label }))} value={current} onChange={(v) => void e.setPortion(Number(v))} />
    </Card>
  );
}

export function ActivityCard() {
  const a = useActivity(25);
  return (
    <Card>
      <Eyebrow>Recent activity</Eyebrow>
      {a.error ? (
        <Text className="mt-3 text-[15px] text-danger">{a.error}</Text>
      ) : a.items === null ? (
        <Text className="mt-3 text-[15px] text-muted">Loading…</Text>
      ) : a.items.length === 0 ? (
        <Text className="mt-3 text-[15px] leading-5 text-muted">Nothing yet. Adding to the kitchen, ticking off groceries and rating dinners will show up here for everyone.</Text>
      ) : (
        <View className="mt-3 gap-3">
          {a.items.map((item, i) => (
            <View key={`${item.at}-${i}`}>
              <Text className="text-[15px] leading-5 text-foreground">{item.text}</Text>
              <Text className="text-[13px] text-muted">{new Date(item.at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}</Text>
            </View>
          ))}
        </View>
      )}
      <Text className="mt-3 text-[13px] text-muted">Only people in this household can see this.</Text>
    </Card>
  );
}

/** Home wrapper: loads this week's plan and saves the servings change when someone taps. */
export function TonightSection({ today, titleFor }: { today: string; titleFor: (id: string) => string | null }) {
  const { mealPlans } = useApp();
  const [plan, setPlan] = useState<MealPlan | null>(null);
  useEffect(() => {
    let cancelled = false;
    void mealPlans.getWeek(startOfWeek(today)).then((r) => {
      if (!cancelled && r.ok) setPlan(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [mealPlans, today]);
  return (
    <TonightCard
      today={today}
      plan={plan}
      titleFor={titleFor}
      onUseServings={async (n) => {
        if (!plan) return;
        const r = await mealPlans.save(draftToInput(setServings(toDraft(plan), today, n)), { overwriteConfirmed: true });
        if (r.ok) setPlan(r.data);
      }}
    />
  );
}
