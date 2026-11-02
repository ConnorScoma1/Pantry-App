import Ionicons from "@expo/vector-icons/Ionicons";
import { dessertTiming, type PlanDraft } from "@kitchen-pantry/meal-planner";
import { formatMinutes, type RankedRecipe } from "@kitchen-pantry/recipe-engine";
import { dessertCategories, dessertFrequencies, dessertSkillLevels, labelFor, type DessertFrequency } from "@kitchen-pantry/shared-types";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Chip, ChipRow } from "@/components/controls";
import { Sheet } from "@/components/kitchen/sheet";
import { Body, Card, Eyebrow } from "@/components/ui";
import { useThemeColors } from "@/lib/theme";
import { dayLabel } from "./meal-card";

type Dessert = PlanDraft["desserts"][number];
const categoryLabel = (code: string | null) => (code ? labelFor(dessertCategories, code) : "Dessert");
const skillLabel = (level: number) => dessertSkillLevels.find((s) => s.level === level)?.label ?? "";

/** Same as the web Desserts section: optional, alongside dinner, never daily. */
export function DessertsSection({
  desserts,
  days,
  today,
  frequency,
  byId,
  candidates,
  preferred,
  favorites,
  busy,
  onAdd,
  onRemove,
  onServings,
}: {
  desserts: Dessert[];
  days: string[];
  today: string;
  frequency: DessertFrequency;
  byId: ReadonlyMap<string, RankedRecipe>;
  candidates: RankedRecipe[];
  preferred: readonly string[];
  favorites: ReadonlySet<string>;
  busy: boolean;
  onAdd: (date: string, recipeId: string, note: string | null) => void;
  onRemove: (date: string) => void;
  onServings: (date: string, servings: number) => void;
}) {
  const c = useThemeColors();
  const [open, setOpen] = useState(false);
  const freq = dessertFrequencies.find((f) => f.code === frequency)!;
  return (
    <Card>
      <Eyebrow>Desserts</Eyebrow>
      <Body>{freq.perWeek > 0 ? `${freq.label}, planned with your dinners. Change it in Profile.` : "Only when you add one. Change it in Profile."}</Body>
      {desserts.map((d) => {
        const r = d.recipeId ? byId.get(d.recipeId)?.recipe : undefined;
        const timing = r ? dessertTiming(r) : null;
        const { weekday } = dayLabel(d.date, "long");
        return (
          <View key={d.date} className="mt-3 border-t border-border pt-3">
            <Text className="text-[13px] font-semibold uppercase tracking-widest text-muted">{weekday}</Text>
            <Pressable accessibilityRole="link" onPress={() => r && router.push(`/recipes/${r.slug}`)}>
              <Text className="text-[17px] font-semibold text-foreground">{r?.title ?? d.customTitle ?? "Dessert"}</Text>
            </Pressable>
            {r ? (
              <Text className="text-[14px] text-muted">
                {categoryLabel(r.dessertCategory)} · {skillLabel(r.skillLevel)} · {formatMinutes(r.prepMinutes + r.cookMinutes)}
                {r.chillMinutes ? ` + ${formatMinutes(r.chillMinutes)} ${r.dessertCategory === "frozen" ? "freezing" : "chilling"}` : ""}
              </Text>
            ) : null}
            {d.note || timing ? <Text className="text-[14px] text-accent">{d.note ?? timing}</Text> : null}
            <View className="mt-2 flex-row items-center gap-2">
              <Pressable accessibilityRole="button" accessibilityLabel="Fewer servings" disabled={busy || d.servings <= 1} onPress={() => onServings(d.date, d.servings - 1)} className="size-10 items-center justify-center rounded-full border border-border">
                <Ionicons name="remove" size={18} color={c.foreground} />
              </Pressable>
              <Text className="text-[14px] text-foreground">{d.servings} servings</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="More servings" disabled={busy || d.servings >= 24} onPress={() => onServings(d.date, d.servings + 1)} className="size-10 items-center justify-center rounded-full border border-border">
                <Ionicons name="add" size={18} color={c.foreground} />
              </Pressable>
              <View className="flex-1" />
              <Button variant="ghost" icon="close" label="Remove" disabled={busy} onPress={() => onRemove(d.date)} />
            </View>
          </View>
        );
      })}
      <View className="mt-3">
        <Button variant="secondary" icon="add" label="Add dessert" disabled={busy} onPress={() => setOpen(true)} />
      </View>
      <AddDessertSheet
        visible={open}
        onClose={() => setOpen(false)}
        days={days.filter((d) => d >= today)}
        taken={new Set(desserts.map((d) => d.date))}
        planned={new Set(desserts.map((d) => d.recipeId).filter((x): x is string => Boolean(x)))}
        candidates={candidates}
        preferred={preferred}
        favorites={favorites}
        onPick={(date, r) => {
          setOpen(false);
          onAdd(date, r.recipe.id, dessertTiming(r.recipe));
        }}
      />
    </Card>
  );
}

function AddDessertSheet({
  visible,
  onClose,
  days,
  taken,
  planned,
  candidates,
  preferred,
  favorites,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  days: string[];
  taken: ReadonlySet<string>;
  planned: ReadonlySet<string>;
  candidates: RankedRecipe[];
  preferred: readonly string[];
  favorites: ReadonlySet<string>;
  onPick: (date: string, r: RankedRecipe) => void;
}) {
  const firstFree = days.find((d) => !taken.has(d)) ?? days[0];
  const [date, setDate] = useState<string | undefined>(firstFree);
  const [cats, setCats] = useState<string[]>([...preferred]);
  const day = date && days.includes(date) ? date : firstFree;
  const list = useMemo(
    () =>
      candidates
        .filter((r) => cats.length === 0 || (r.recipe.dessertCategory !== null && cats.includes(r.recipe.dessertCategory)))
        .sort((a, b) => Number(favorites.has(b.recipe.id)) - Number(favorites.has(a.recipe.id))),
    [candidates, cats, favorites],
  );
  return (
    <Sheet visible={visible} title="Add a dessert" description="Desserts sit alongside dinner — they never replace it." onClose={onClose}>
      {days.length === 0 ? (
        <Body>This week is over. Add desserts to next week instead.</Body>
      ) : (
        <View className="gap-5">
          <View>
            <Text className="mb-2 text-[15px] font-semibold text-foreground">Which day?</Text>
            <ChipRow>
              {days.map((d) => (
                <Chip key={d} label={`${dayLabel(d).weekday}${taken.has(d) ? " · replace" : ""}`} selected={d === day} onPress={() => setDate(d)} />
              ))}
            </ChipRow>
          </View>
          <View>
            <Text className="mb-2 text-[15px] font-semibold text-foreground">What kind?</Text>
            <ChipRow>
              <Chip label="Any" selected={cats.length === 0} onPress={() => setCats([])} />
              {dessertCategories.map((cat) => (
                <Chip
                  key={cat.code}
                  label={cat.label}
                  selected={cats.includes(cat.code)}
                  onPress={() => setCats((cur) => (cur.includes(cat.code) ? cur.filter((x) => x !== cat.code) : [...cur, cat.code]))}
                />
              ))}
            </ChipRow>
          </View>
          {list.length === 0 ? (
            <Body>No desserts in those categories fit your kitchen, diet and dessert skill.</Body>
          ) : (
            <View className="gap-2">
              {list.map((r) => {
                const inWeek = planned.has(r.recipe.id);
                const timing = dessertTiming(r.recipe);
                return (
                  <Pressable
                    key={r.recipe.id}
                    accessibilityRole="button"
                    disabled={!day || inWeek}
                    onPress={() => day && onPick(day, r)}
                    className={`rounded-2xl border border-border bg-background px-4 py-3 ${inWeek ? "opacity-50" : ""}`}
                  >
                    <Text className="text-[16px] font-semibold text-foreground">
                      {favorites.has(r.recipe.id) ? "♥ " : ""}
                      {r.recipe.title}
                    </Text>
                    <Text className="text-[14px] text-muted">
                      {categoryLabel(r.recipe.dessertCategory)} · {skillLabel(r.recipe.skillLevel)} · {formatMinutes(r.recipe.prepMinutes + r.recipe.cookMinutes)}
                      {inWeek ? " · already this week" : ""}
                    </Text>
                    {timing ? <Text className="text-[14px] text-accent">{timing}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}
    </Sheet>
  );
}
