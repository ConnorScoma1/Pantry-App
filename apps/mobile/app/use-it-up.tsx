import { formatCents } from "@kitchen-pantry/grocery-pricing";
import { assessUrgency } from "@kitchen-pantry/inventory-engine";
import type { Result } from "@kitchen-pantry/database";
import { formatMinutes, ideasToUseUp, toUseUpFirst } from "@kitchen-pantry/recipe-engine";
import type { PantryItem, Recipe } from "@kitchen-pantry/shared-types";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Notice } from "@/components/controls";
import { UrgencyBadge } from "@/components/kitchen/urgency-badge";
import { RecipeArt } from "@/components/recipes/recipe-card";
import { Body, Card, CardTitle, Eyebrow, Screen } from "@/components/ui";
import { useApp } from "@/lib/app-state";
import { apiUrl } from "@/lib/config";
import { useKitchen } from "@/lib/use-kitchen";
import { useRecipes } from "@/lib/use-recipes";
import { useUseUpPricing } from "@/lib/use-up-pricing";

const namesOf = (items: ReadonlyArray<{ name: string }>) => {
  const n = items.map((i) => i.name.toLowerCase());
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
};
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null);

/** Use It Before You Lose It (spec 01 §6) on the phone — same ideas and rules as the web. */
export default function UseItUpScreen() {
  const params = useLocalSearchParams<{ items?: string }>();
  const kitchen = useKitchen();
  const data = useRecipes();
  const pricing = useUseUpPricing();
  const { items, today } = kitchen;

  const choices = useMemo(() => {
    const usable = items.filter((p) => !p.isStaple && assessUrgency(p.useBy, today).usable);
    const first = toUseUpFirst(usable, today);
    return [...first, ...usable.filter((p) => !first.includes(p)).sort((a, b) => a.name.localeCompare(b.name))];
  }, [items, today]);

  const [picked, setPicked] = useState<string[] | null>(null);
  useEffect(() => {
    if (picked !== null || kitchen.loading) return;
    const asked = (typeof params.items === "string" ? params.items : "").split(",").filter((id) => choices.some((c) => c.id === id));
    setPicked(asked.length > 0 ? asked : toUseUpFirst(choices, today).slice(0, 3).map((p) => p.id));
  }, [picked, kitchen.loading, params.items, choices, today]);

  const chosen = useMemo(() => choices.filter((c) => picked?.includes(c.id)), [choices, picked]);
  const result = useMemo(
    () => (data.loading || chosen.length === 0 ? null : ideasToUseUp(data.rank({ includeAboveSkill: true }).recipes, chosen, today)),
    [data, chosen, today],
  );
  const ideasKey = result ? result.picks.map((p) => p.ranked.recipe.id).join(",") : "";
  const costs = pricing.state.status === "done" && pricing.state.ideasKey === ideasKey ? pricing.state.costs : null;
  const storeName = pricing.state.status === "done" ? pricing.state.storeName : "";
  const toggle = (id: string) => setPicked((p) => (p?.includes(id) ? p.filter((x) => x !== id) : [...(p ?? []), id]));

  return (
    <Screen title="Use it before you lose it" subtitle="Pick what needs using up — one thing or several — and we'll find recipes that use it.">
      <Card>
        <Eyebrow>What needs using up?</Eyebrow>
        {kitchen.loading ? (
          <Body>Loading your kitchen…</Body>
        ) : choices.length === 0 ? (
          <Body>Your kitchen is empty. Add what you have on the Kitchen tab, with use-by dates for fresh food.</Body>
        ) : (
          <View className="mt-3 flex-row flex-wrap gap-2">
            {choices.map((item) => {
              const on = Boolean(picked?.includes(item.id));
              const u = assessUrgency(item.useBy, today);
              const soon = u.urgency === "today" || u.urgency === "soon" || u.urgency === "this_week";
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={item.name}
                  onPress={() => toggle(item.id)}
                  className={`min-h-11 flex-row items-center gap-2 rounded-full border py-1.5 pl-4 ${soon ? "pr-1.5" : "pr-4"} ${on ? "border-foreground bg-foreground" : "border-border bg-background"}`}
                >
                  <Text className={`text-[15px] font-medium ${on ? "text-background" : "text-foreground"}`}>{item.name}</Text>
                  {soon ? <UrgencyBadge urgency={u} /> : null}
                </Pressable>
              );
            })}
          </View>
        )}
        <Text className="mt-3 text-[14px] leading-5 text-muted">
          We go by the use-by dates you entered, and anything past its date isn&apos;t offered. If something looks or smells off, throw it out — dates are a guide, not a safety check.
        </Text>
      </Card>

      {result && result.picks.length > 0 ? (
        <Button
          variant="secondary"
          icon="basket-outline"
          label={pricing.state.status === "busy" ? "Checking prices…" : "What would the extra shopping cost?"}
          onPress={() => pricing.state.status !== "busy" && void pricing.check(result.picks, ideasKey)}
        />
      ) : null}
      {pricing.state.status === "unavailable" ? (
        <View className="gap-2">
          <Notice>{pricing.state.message}</Notice>
          {pricing.state.needsStore ? <Button variant="ghost" label="Choose your store" onPress={() => router.navigate("/grocery")} /> : null}
        </View>
      ) : null}

      {result === null ? (
        chosen.length === 0 && choices.length > 0 && !kitchen.loading ? <Body>Pick at least one ingredient above.</Body> : null
      ) : result.picks.length === 0 ? (
        <Card>
          <Body>None of our recipes use {chosen.length === 1 ? "that" : "those"} yet. Try picking something else.</Body>
        </Card>
      ) : (
        <View className="gap-3">
          {result.picks.map((idea) => {
            const r = idea.ranked.recipe;
            const cost = costs?.get(r.id) ?? null;
            return (
              <Pressable
                key={r.id}
                accessibilityRole="link"
                onPress={() => router.push(`/recipes/${r.slug}`)}
                className="overflow-hidden rounded-card bg-surface active:opacity-80"
              >
                <View className="flex-row gap-3">
                  <View className="w-24">
                    <RecipeArt recipe={r} />
                  </View>
                  <View className="flex-1 py-3 pr-3">
                    {r.source.kind === "ai_generated" ? <Text className="text-[13px] font-semibold text-accent">AI draft · not reviewed</Text> : null}
                    <Text className="text-[17px] font-semibold leading-6 text-foreground">{r.title}</Text>
                    <Text className="text-[13px] text-muted">
                      {formatMinutes(r.totalMinutes)} · serves {r.servings} · skill {r.skillLevel}
                      {idea.ranked.aboveSkill ? " (a stretch)" : ""}
                    </Text>
                  </View>
                </View>
                <View className="gap-2 px-4 pt-1 pb-4">
                  <Text className="text-[15px] leading-5 text-foreground">{idea.why}</Text>
                  <Text className="text-[14px] leading-5 text-muted">
                    <Text className="font-semibold text-foreground">From your kitchen: </Text>
                    {idea.usage.map((u) => `${u.lines.join(" + ")}${u.short ? ` (${u.short})` : ""}`).join(" · ")}
                  </Text>
                  {cost ? (
                    <Text className="text-[14px] leading-5 text-foreground">
                      {idea.missing.length === 0
                        ? "Nothing extra to buy."
                        : cost.priced === 0
                          ? `No prices found at ${storeName} for what you'd need.`
                          : `${cost.priced < cost.of ? "At least" : "About"} ${formatCents(cost.cents)} more at ${storeName} · ${cost.priced} of ${cost.of} priced${cost.assumed ? " · some counted as one package" : ""}${shortDate(cost.observedAt) ? ` · prices as of ${shortDate(cost.observedAt)}` : ""}`}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      {result && result.unused.length > 0 ? <Body>No recipe here uses {result.unused.map((u) => u.name.toLowerCase()).join(", ")} yet.</Body> : null}
      {chosen.length > 0 ? <AskAiCard chosen={chosen} today={today} remember={data.remember} /> : null}
    </Screen>
  );
}

/** "Ask AI for a new idea" — Claude runs on the Kitchen Pantry server; the result is checked and saved as an untested AI draft. */
function AskAiCard({ chosen, today, remember }: { chosen: PantryItem[]; today: string; remember: (r: Recipe[]) => void }) {
  const { mode, accessToken } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ recipe: Recipe; changes: string[]; key: string } | null>(null);
  const picked = chosen.slice(0, 5);
  const key = picked.map((p) => p.id).join(",");

  async function ask() {
    setError(null);
    const token = await accessToken();
    if (mode === "preview" || !apiUrl || !token) return setError("AI recipe ideas need an account and the Kitchen Pantry server. Sign in to use them.");
    setBusy(true);
    try {
      const res = await fetch(`${apiUrl}/api/recipes/use-up`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: picked.map((p) => p.id), today }),
      });
      const body = (await res.json()) as Result<{ recipe: Recipe; changes: string[] }>;
      if (!body.ok) return setError(body.message);
      remember([body.data.recipe]);
      setMade({ recipe: body.data.recipe, changes: Array.isArray(body.data.changes) ? body.data.changes.filter((c) => typeof c === "string") : [], key });
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Eyebrow>Something new</Eyebrow>
      <Body>
        Ask the AI to write a new dinner around {namesOf(picked)}
        {chosen.length > 5 ? " (the first five you picked)" : ""}. It&apos;s checked for food safety, your allergies, diet and equipment, and saved as an AI draft nobody has tested yet.
      </Body>
      {made && made.key === key ? (
        <Pressable accessibilityRole="link" onPress={() => router.push(`/recipes/${made.recipe.slug}`)} className="mt-3 rounded-2xl bg-background p-4 active:opacity-80">
          <Text className="text-[13px] font-semibold text-accent">AI draft · not reviewed</Text>
          <CardTitle>{made.recipe.title}</CardTitle>
          <Text className="text-[13px] text-muted">
            {formatMinutes(made.recipe.totalMinutes)} · serves {made.recipe.servings} · skill {made.recipe.skillLevel}
          </Text>
          {made.changes.slice(0, 6).map((c, i) => (
            <Text key={i} className="mt-1 text-[14px] leading-5 text-foreground">
              • {c}
            </Text>
          ))}
        </Pressable>
      ) : (
        <View className="mt-3">
          <Button icon="sparkles-outline" label={busy ? "Writing a recipe…" : "Ask AI for a new idea"} onPress={() => !busy && void ask()} />
        </View>
      )}
      {error ? (
        <View className="mt-3">
          <Notice tone="error">{error}</Notice>
        </View>
      ) : null}
    </Card>
  );
}
