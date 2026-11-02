import Ionicons from "@expo/vector-icons/Ionicons";
import {
  clockTime,
  cookingSteps,
  cookingTips,
  formatIngredientLine,
  formatMinutes,
  formatTemperature,
  groupByComponent,
  isChefRecipe,
  miseEnPlace,
  serviceTimeline,
  servingsFactor,
  substitutionsFor,
} from "@kitchen-pantry/recipe-engine";
import type { Recipe } from "@kitchen-pantry/shared-types";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, Vibration, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Segmented } from "@/components/controls";
import { useApp, useProfile } from "@/lib/app-state";
import { apiUrl } from "@/lib/config";
import { useThemeColors } from "@/lib/theme";

type Tab = "steps" | "ingredients" | "plan";
interface RunningTimer {
  id: number;
  label: string;
  endsAt: number;
  done: boolean;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const QUICK = ["My sauce broke — how do I fix it?", "It's browning too quickly.", "How do I make this look restaurant-style?"];

interface Help {
  source: "ai" | "curated";
  answer: string | null;
  safetyNote: string | null;
  tips: string[];
  notice: string | null;
}

/** Cooking mode on the phone — same behaviour as the web (spec 01 §11–12). */
export function CookingMode({ recipe, initialServings, visible, onClose, onDone }: { recipe: Recipe; initialServings: number; visible: boolean; onClose: () => void; onDone: () => void }) {
  const c = useThemeColors();
  const profile = useProfile();
  const chef = isChefRecipe(recipe);
  const [tab, setTab] = useState<Tab>("steps");
  const [servings, setServings] = useState(initialServings);
  const factor = servingsFactor(recipe, servings);
  const steps = useMemo(() => cookingSteps(recipe, factor), [recipe, factor]);
  const [index, setIndex] = useState(0);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [askOpen, setAskOpen] = useState(false);
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  const [now, setNow] = useState(Date.now());
  const next = useRef(1);
  const step = steps[index]!;
  const last = index === steps.length - 1;
  const allergies = useMemo(() => [...new Set([...profile.diet.allergies, ...(profile.householdDiet?.allergies ?? [])])], [profile]);
  const avoid = useMemo(() => [...profile.diet.neverRecommend, ...(profile.householdDiet?.neverRecommend ?? [])], [profile]);

  useEffect(() => {
    if (timers.every((t) => t.done)) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setTimers((list) => {
        let rang = false;
        const out = list.map((x) => (!x.done && x.endsAt <= t ? ((rang = true), { ...x, done: true }) : x));
        if (rang) Vibration.vibrate([0, 400, 200, 400]);
        return rang ? out : list;
      });
    }, 500);
    return () => clearInterval(id);
  }, [timers]);

  const tabs: ReadonlyArray<{ value: Tab; label: string }> = chef
    ? [
        { value: "steps", label: "Steps" },
        { value: "ingredients", label: "Ingredients" },
        { value: "plan", label: "Chef plan" },
      ]
    : [
        { value: "steps", label: "Steps" },
        { value: "ingredients", label: "Ingredients" },
      ];
  const round = "size-11 items-center justify-center rounded-full border border-border bg-background";

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-background">
        <View className="gap-3 border-b border-border px-4 pb-3 pt-2">
          <View className="flex-row items-center gap-3">
            <Pressable accessibilityRole="button" accessibilityLabel="Leave cooking mode" onPress={onClose} className="size-11 items-center justify-center rounded-full">
              <Ionicons name="close" size={26} color={c.foreground} />
            </Pressable>
            <View className="flex-1">
              <Text className="text-[13px] font-semibold uppercase tracking-widest text-muted">{chef ? "Chef mode" : "Cooking mode"}</Text>
              <Text numberOfLines={1} className="text-[18px] font-bold text-foreground">
                {recipe.title}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fewer servings" disabled={servings <= 1} onPress={() => setServings((s) => s - 1)} className={`${round} ${servings <= 1 ? "opacity-35" : ""}`}>
              <Ionicons name="remove" size={18} color={c.foreground} />
            </Pressable>
            <Text accessibilityLiveRegion="polite" className="text-[14px] font-semibold text-foreground">
              {servings}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="More servings" disabled={servings >= 24} onPress={() => setServings((s) => s + 1)} className={`${round} ${servings >= 24 ? "opacity-35" : ""}`}>
              <Ionicons name="add" size={18} color={c.foreground} />
            </Pressable>
          </View>
          <Segmented options={tabs} value={tab} onChange={setTab} />
          {timers.length > 0 ? (
            <View className="flex-row flex-wrap gap-2" accessibilityLiveRegion="polite">
              {timers.map((t) => (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.label} timer, ${t.done ? "done" : clock(t.endsAt - now)}. Tap to stop.`}
                  onPress={() => setTimers((l) => l.filter((x) => x.id !== t.id))}
                  className={`flex-row items-center gap-2 rounded-full px-3 py-1.5 ${t.done ? "bg-warning" : "bg-surface"}`}
                >
                  <Ionicons name="timer-outline" size={16} color={t.done ? "#FFFFFF" : c.foreground} />
                  <Text className={`text-[15px] font-semibold ${t.done ? "text-white" : "text-foreground"}`}>
                    {t.label}: {t.done ? "Done!" : clock(t.endsAt - now)}
                  </Text>
                  <Ionicons name="close" size={14} color={t.done ? "#FFFFFF" : c.muted} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <ScrollView contentContainerClassName="px-4 py-6 gap-5">
          {tab === "steps" ? (
            <>
              <Text className="text-[15px] font-semibold text-muted">
                Step {step.number} of {steps.length}
                {step.component ? ` · ${step.component}` : ""}
              </Text>
              <View className="h-1.5 overflow-hidden rounded-full bg-surface-strong">
                <View className="h-full rounded-full bg-accent" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
              </View>
              <Text className="text-[26px] font-medium leading-9 text-foreground">{step.body}</Text>
              {step.uses.length > 0 ? (
                <View className="flex-row flex-wrap gap-2">
                  {step.uses.map((u) => (
                    <View key={u} className="rounded-full bg-surface px-3.5 py-1.5">
                      <Text className="text-[16px] text-foreground">{u}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {step.temperatureC !== null ? <Text className="rounded-2xl bg-surface px-4 py-3 text-[18px] font-semibold text-foreground">Heat: {formatTemperature(step.temperatureC)}</Text> : null}
              {step.safeInternalTempC !== null ? (
                <Text className="rounded-2xl bg-warning/10 px-4 py-3 text-[18px] font-semibold text-foreground">Safe at {formatTemperature(step.safeInternalTempC)} inside — check with a thermometer</Text>
              ) : null}
              {step.timerSeconds ? (
                <Button
                  variant="secondary"
                  size="lg"
                  icon="timer-outline"
                  label={`Start ${formatMinutes(Math.round(step.timerSeconds / 60))} timer`}
                  onPress={() => {
                    const id = next.current++;
                    setNow(Date.now());
                    setTimers((l) => [...l, { id, label: step.component ?? `Step ${step.number}`, endsAt: Date.now() + step.timerSeconds! * 1000, done: false }]);
                  }}
                />
              ) : null}
              {last && recipe.tips.length > 0 ? (
                <View className="gap-1 rounded-2xl bg-surface p-4">
                  <Text className="text-[15px] font-semibold text-foreground">Chef&apos;s tips</Text>
                  {recipe.tips.map((t) => (
                    <Text key={t} className="text-[16px] leading-6 text-foreground">
                      • {t}
                    </Text>
                  ))}
                </View>
              ) : null}
            </>
          ) : tab === "ingredients" ? (
            <Checklist recipe={recipe} factor={factor} checked={checked} setChecked={setChecked} allergies={allergies} avoid={avoid} />
          ) : (
            <ChefPlan recipe={recipe} factor={factor} />
          )}
        </ScrollView>

        <View className="flex-row items-center gap-2 border-t border-border px-4 py-3">
          <Button variant="secondary" icon="arrow-back" label="Back" disabled={index === 0 || tab !== "steps"} onPress={() => setIndex((i) => i - 1)} />
          <Button variant="ghost" icon="help-circle-outline" label="Ask" onPress={() => setAskOpen(true)} />
          <View className="flex-1" />
          {tab !== "steps" ? (
            <Button label={`Step ${step.number}`} onPress={() => setTab("steps")} />
          ) : last ? (
            <Button icon="checkmark" label="Done" onPress={onDone} />
          ) : (
            <Button icon="arrow-forward" label="Next" onPress={() => setIndex((i) => i + 1)} />
          )}
        </View>
        {askOpen ? <AskSheet recipe={recipe} step={index} servings={servings} chef={chef} onClose={() => setAskOpen(false)} /> : null}
      </SafeAreaView>
    </Modal>
  );
}

function Checklist({
  recipe,
  factor,
  checked,
  setChecked,
  allergies,
  avoid,
}: {
  recipe: Recipe;
  factor: number;
  checked: Set<number>;
  setChecked: (s: Set<number>) => void;
  allergies: Parameters<typeof substitutionsFor>[1]["allergies"];
  avoid: string[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <View className="gap-4">
      <Text className="text-[15px] text-muted">
        Tick things off as you set them out. {checked.size} of {recipe.ingredients.length} ready.
      </Text>
      {groupByComponent([...recipe.ingredients].sort((a, b) => a.position - b.position)).map((g) => (
        <View key={g.component ?? "main"} className="gap-1">
          {g.component ? <Text className="mb-1 text-[17px] font-bold text-foreground">{g.component}</Text> : null}
          {g.items.map((i) => {
            const done = checked.has(i.position);
            const subs = substitutionsFor(i.item, { allergies, avoid });
            return (
              <View key={i.position} className="rounded-2xl bg-surface px-3 py-2">
                <View className="flex-row items-center gap-3">
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done }}
                    onPress={() => {
                      const n = new Set(checked);
                      if (done) n.delete(i.position);
                      else n.add(i.position);
                      setChecked(n);
                    }}
                    className="min-h-11 flex-1 flex-row items-center gap-3"
                  >
                    <View className={`size-7 items-center justify-center rounded-lg border-2 ${done ? "border-accent bg-accent" : "border-border"}`}>
                      {done ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                    </View>
                    <Text className={`flex-1 text-[18px] ${done ? "text-muted line-through" : "text-foreground"}`}>{formatIngredientLine(i, factor)}</Text>
                  </Pressable>
                  {subs.length > 0 ? (
                    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === i.position }} onPress={() => setOpen(open === i.position ? null : i.position)}>
                      <Text className="text-[14px] font-semibold text-accent">Swap?</Text>
                    </Pressable>
                  ) : null}
                </View>
                {open === i.position
                  ? subs.map((s) => (
                      <Text key={s} className="ml-10 mt-1 text-[15px] text-muted">
                        • {s}
                      </Text>
                    ))
                  : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function ChefPlan({ recipe, factor }: { recipe: Recipe; factor: number }) {
  const timeline = useMemo(() => serviceTimeline(recipe), [recipe]);
  const mise = useMemo(() => miseEnPlace(recipe, factor), [recipe, factor]);
  const [serveAt, setServeAt] = useState(() => {
    const d = new Date(Date.now() + (timeline.totalMinutes + 10) * 60_000);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    return d;
  });
  const move = (mins: number) => setServeAt((d) => new Date(d.getTime() + mins * 60_000));
  return (
    <View className="gap-4">
      <Text className="text-[20px] font-bold text-foreground">Running order</Text>
      <Text className="text-[15px] leading-5 text-muted">About {formatMinutes(timeline.totalMinutes)} of work in recipe order, from timers and estimates. Overlap components where you can.</Text>
      <View className="flex-row items-center justify-between">
        <Text className="text-[16px] font-semibold text-foreground">Serve at {clockTime(serveAt, 0)}</Text>
        <View className="flex-row gap-2">
          <Button variant="secondary" label="−15 min" onPress={() => move(-15)} />
          <Button variant="secondary" label="+15 min" onPress={() => move(15)} />
        </View>
      </View>
      {timeline.entries.map((e) => (
        <View key={e.step} className="flex-row gap-3 rounded-2xl bg-surface px-4 py-3">
          <Text className="w-[72px] text-[15px] font-bold text-foreground">{clockTime(serveAt, e.startsBefore)}</Text>
          <Text className="flex-1 text-[15px] leading-5 text-foreground">
            {e.component ? `${e.component}: ` : ""}
            {e.summary} · {e.minutes} min
          </Text>
        </View>
      ))}
      <Text className="mt-2 text-[20px] font-bold text-foreground">Mise en place</Text>
      {mise.map((m) => (
        <View key={m.component ?? "main"} className="gap-1">
          {m.component ? <Text className="text-[16px] font-semibold text-foreground">{m.component}</Text> : null}
          {m.tasks.map((t) => (
            <Text key={t} className="text-[16px] leading-6 text-foreground">
              • {t}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function AskSheet({ recipe, step, servings, chef, onClose }: { recipe: Recipe; step: number; servings: number; chef: boolean; onClose: () => void }) {
  const { accessToken, mode } = useApp();
  const profile = useProfile();
  const c = useThemeColors();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState<Help | null>(null);
  const [error, setError] = useState<string | null>(null);
  const quick = [...QUICK, ...(chef ? ["What wine goes with this?"] : [])];

  async function ask(q: string) {
    const text = q.trim();
    if (text.length < 3) return;
    setQuestion(text);
    setError(null);
    setHelp(null);
    const allergies = [...new Set([...profile.diet.allergies, ...(profile.householdDiet?.allergies ?? [])])];
    const local: Help = { source: "curated", answer: null, safetyNote: null, tips: cookingTips(recipe, step, allergies, profile.diet.neverRecommend), notice: null };
    const token = mode === "supabase" ? await accessToken() : null;
    if (!apiUrl || !token) {
      setHelp({ ...local, notice: mode === "preview" ? "The cooking assistant needs an account and the Kitchen Pantry server. Here's what we can tell you without it." : "The Kitchen Pantry server isn't set up in this app (EXPO_PUBLIC_API_URL). Here's what we can tell you without it." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiUrl}/api/cooking/help`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId: recipe.id, step, question: text, servings }),
      });
      const body = (await res.json()) as { ok: boolean; message?: string; data?: Help };
      if (body.ok && body.data) setHelp({ ...body.data, tips: Array.isArray(body.data.tips) ? body.data.tips.map(String).slice(0, 8) : [] });
      else setError(body.message ?? "The assistant couldn't answer.");
    } catch {
      setHelp({ ...local, notice: "Couldn't reach the Kitchen Pantry server. Here's what we can tell you without it." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <Pressable className="absolute inset-0" onPress={onClose} accessibilityLabel="Close" />
        <View className="max-h-[85%] rounded-t-[28px] bg-background p-5">
          <ScrollView contentContainerClassName="gap-3 pb-6">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-[20px] font-bold text-foreground">Ask about step {step + 1}</Text>
                <Text className="text-[14px] text-muted">The assistant sees this recipe, your step and your household&apos;s allergies — nothing else.</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} className="size-10 items-center justify-center">
                <Ionicons name="close" size={22} color={c.foreground} />
              </Pressable>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {quick.map((q) => (
                <Pressable key={q} accessibilityRole="button" disabled={busy} onPress={() => void ask(q)} className="rounded-full border border-border px-3.5 py-2">
                  <Text className="text-[14px] font-medium text-foreground">{q}</Text>
                </Pressable>
              ))}
            </View>
            <View className="flex-row gap-2">
              <TextInput
                accessibilityLabel="Your question"
                value={question}
                maxLength={300}
                onChangeText={setQuestion}
                placeholder="e.g. I don't have shallots"
                placeholderTextColor={c.subtle}
                onSubmitEditing={() => void ask(question)}
                className="min-h-12 flex-1 rounded-full border border-border bg-background px-4 text-[16px] text-foreground"
              />
              <Button label={busy ? "Asking…" : "Ask"} disabled={busy || question.trim().length < 3} onPress={() => void ask(question)} />
            </View>
            {error ? <Text className="text-[15px] text-danger">{error}</Text> : null}
            {help?.answer ? <Text className="rounded-2xl bg-surface px-4 py-3 text-[17px] leading-6 text-foreground">{help.answer}</Text> : null}
            {help?.safetyNote ? <Text className="rounded-2xl bg-warning/10 px-4 py-3 text-[15px] text-foreground">{help.safetyNote}</Text> : null}
            {help?.notice ? <Text className="text-[14px] text-muted">{help.notice}</Text> : null}
            {help?.tips.map((t) => (
              <Text key={t} className="text-[15px] leading-5 text-foreground">
                • {t}
              </Text>
            ))}
            {help && !help.answer && help.tips.length === 0 ? <Text className="text-[15px] text-muted">No built-in tips for this step.</Text> : null}
            {help?.source === "ai" ? <Text className="text-[12px] text-muted">Answered by the AI assistant. Check food-safety temperatures with a thermometer.</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
