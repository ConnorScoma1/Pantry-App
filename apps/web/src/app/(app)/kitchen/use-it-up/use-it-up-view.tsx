"use client";

import { formatCents } from "@kitchen-pantry/grocery-pricing";
import { assessUrgency } from "@kitchen-pantry/inventory-engine";
import type { DraftHousehold } from "@kitchen-pantry/ai";
import { formatMinutes, householdProfile, ideasToUseUp, toUseUpFirst } from "@kitchen-pantry/recipe-engine";
import type { Recipe } from "@kitchen-pantry/shared-types";
import { ArrowLeft, Clock, ShoppingBasket, Sparkles } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { draftUseUpAction } from "@/app/(app)/recipes/library-actions";
import { UrgencyBadge } from "@/components/kitchen/urgency-badge";
import { StatusBadge } from "@/components/recipes/library-badges";
import { RecipeArt } from "@/components/recipes/recipe-art";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, Hint, PageHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { useKitchen } from "@/lib/kitchen/use-kitchen";
import { useUseUpPricing } from "@/lib/kitchen/use-up-pricing";
import { useRecipes } from "@/lib/recipes/use-recipes";

const namesOf = (items: ReadonlyArray<{ name: string }>) => {
  const n = items.map((i) => i.name.toLowerCase());
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
};
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null);

/**
 * Use It Before You Lose It (spec 01 §6): pick what needs using up — one
 * thing or several — and get recipes that use as much of it as possible,
 * with what you'd still need to buy. Nothing past its date can be picked.
 */
export function UseItUpView() {
  const params = useSearchParams();
  const kitchen = useKitchen();
  const data = useRecipes();
  const pricing = useUseUpPricing();
  const { items, today } = kitchen;

  // Everything that can be used (not staples, not past date), most urgent first.
  const choices = useMemo(() => {
    const usable = items.filter((p) => !p.isStaple && assessUrgency(p.useBy, today).usable);
    const first = toUseUpFirst(usable, today);
    return [...first, ...usable.filter((p) => !first.includes(p)).sort((a, b) => a.name.localeCompare(b.name))];
  }, [items, today]);

  const [picked, setPicked] = useState<string[] | null>(null);
  useEffect(() => {
    if (picked !== null || kitchen.loading) return;
    const asked = (params.get("items") ?? "").split(",").filter((id) => choices.some((c) => c.id === id));
    setPicked(asked.length > 0 ? asked : toUseUpFirst(choices, today).slice(0, 3).map((p) => p.id));
  }, [picked, kitchen.loading, params, choices, today]);

  const chosen = useMemo(() => choices.filter((c) => picked?.includes(c.id)), [choices, picked]);
  const result = useMemo(
    () => (data.loading || chosen.length === 0 ? null : ideasToUseUp(data.rank({ includeAboveSkill: true }).recipes, chosen, today)),
    [data, chosen, today],
  );
  const ideasKey = result ? result.picks.map((p) => p.ranked.recipe.id).join(",") : "";
  const costs = pricing.state.status === "done" && pricing.state.ideasKey === ideasKey ? pricing.state.costs : null;

  const toggle = (id: string) => setPicked((p) => (p?.includes(id) ? p.filter((x) => x !== id) : [...(p ?? []), id]));

  return (
    <div className="animate-enter">
      <Link href="/kitchen" className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> My Kitchen
      </Link>
      <PageHeader title="Use it before you lose it" subtitle="Pick what needs using up — one thing or several — and we'll find recipes that use it." />

      <Card className="mb-4">
        <Eyebrow>What needs using up?</Eyebrow>
        {kitchen.loading ? (
          <div className="mt-3 h-11 w-2/3 animate-pulse rounded-full bg-surface-strong" />
        ) : choices.length === 0 ? (
          <p className="mt-2 text-[16px] text-muted">
            Your kitchen is empty. <Link href="/kitchen" className="font-semibold text-accent hover:underline">Add what you have</Link>, with use-by dates for fresh food.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Ingredients to use up">
            {choices.map((item) => {
              const on = Boolean(picked?.includes(item.id));
              const u = assessUrgency(item.useBy, today);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(item.id)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 rounded-full border py-1.5 pr-2 pl-4 text-[15px] font-medium transition-colors",
                      on ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:bg-surface-strong",
                    )}
                  >
                    {item.name}
                    {u.urgency === "today" || u.urgency === "soon" || u.urgency === "this_week" ? <UrgencyBadge urgency={u} className={on ? "bg-background/20! text-background!" : ""} /> : <span className="pr-2" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Hint className="mt-3">We go by the use-by dates you entered, and anything past its date isn&apos;t offered. If something looks or smells off, throw it out — dates are a guide, not a safety check.</Hint>
      </Card>

      {result && result.picks.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight">
            {result.picks.length} idea{result.picks.length === 1 ? "" : "s"}
          </h2>
          <Button
            variant="secondary"
            disabled={pricing.state.status === "busy"}
            onClick={() => void pricing.check(result.picks, ideasKey)}
            icon={<ShoppingBasket className="size-4" aria-hidden />}
          >
            {pricing.state.status === "busy" ? "Checking prices…" : "What would the extra shopping cost?"}
          </Button>
        </div>
      ) : null}
      {pricing.state.status === "unavailable" ? (
        <p role="status" className="mb-3 rounded-2xl bg-surface px-4 py-3 text-[15px]">
          {pricing.state.message}{" "}
          {pricing.state.needsStore ? (
            <Link href="/grocery" className="font-semibold text-accent hover:underline">
              Choose your store →
            </Link>
          ) : null}
        </p>
      ) : null}

      {result === null ? (
        chosen.length === 0 && choices.length > 0 && !kitchen.loading ? <p className="text-[16px] text-muted">Pick at least one ingredient above.</p> : null
      ) : result.picks.length === 0 ? (
        <Card>
          <p className="text-[16px]">None of our recipes use {chosen.length === 1 ? "that" : "those"} yet.</p>
          <Hint className="mt-1">Try picking something else, or search all recipes.</Hint>
        </Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {result.picks.map((idea) => {
            const r = idea.ranked.recipe;
            const cost = costs?.get(r.id) ?? null;
            return (
              <li key={r.id} className="flex gap-4 rounded-card bg-surface p-4">
                <RecipeArt recipe={r} className="size-24 shrink-0 rounded-2xl" />
                <div className="min-w-0 flex-1">
                  {r.source.kind === "ai_generated" ? <StatusBadge recipe={r} className="mb-1" /> : null}
                  <Link href={`/recipes/${r.slug}`} className="block text-[18px] font-semibold leading-snug hover:underline">
                    {r.title}
                  </Link>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[14px] text-muted">
                    <Clock className="size-3.5" aria-hidden /> {formatMinutes(r.totalMinutes)} · serves {r.servings} · skill {r.skillLevel}
                    {idea.ranked.aboveSkill ? " (a stretch)" : ""}
                  </p>
                  <p className="mt-2 text-[15px] leading-snug">{idea.why}</p>
                  <p className="mt-2 text-[14px] text-muted">
                    <span className="font-semibold text-foreground">From your kitchen:</span> {idea.usage.map((u) => `${u.lines.join(" + ")}${u.short ? ` (${u.short})` : ""}`).join(" · ")}
                  </p>
                  {cost && pricing.state.status === "done" ? (
                    <p className="mt-2 text-[14px]">
                      {idea.missing.length === 0 ? (
                        "Nothing extra to buy."
                      ) : cost.priced === 0 ? (
                        <span className="text-muted">No prices found at {pricing.state.storeName} for what you&apos;d need.</span>
                      ) : (
                        <>
                          <span className="font-semibold">
                            {cost.priced < cost.of ? "At least " : "About "}
                            {formatCents(cost.cents)} more
                          </span>{" "}
                          <span className="text-muted">
                            at {pricing.state.storeName} · {cost.priced} of {cost.of} item{cost.of === 1 ? "" : "s"} priced
                            {cost.assumed ? " · some counted as one package" : ""}
                            {shortDate(cost.observedAt) ? ` · prices as of ${shortDate(cost.observedAt)}` : ""}
                          </span>
                        </>
                      )}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {result && result.unused.length > 0 ? (
        <Hint className="mt-3">No recipe here uses {result.unused.map((u) => u.name.toLowerCase()).join(", ")} yet.</Hint>
      ) : null}

      {chosen.length > 0 ? <AskAiCard chosen={chosen} today={today} data={data} /> : null}
    </div>
  );
}

/**
 * "Ask AI for a new idea": Claude writes a new dinner around the picked
 * ingredients (up to five). It's checked like every AI draft — amounts, food
 * safety temperatures, the household's allergens, diet and equipment — and
 * saved for this household as "AI draft · not reviewed". Counts against the
 * daily AI draft limit; only runs when tapped.
 */
function AskAiCard({ chosen, today, data }: { chosen: ReturnType<typeof useKitchen>["items"]; today: string; data: ReturnType<typeof useRecipes> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ recipe: Recipe; changes: string[]; key: string } | null>(null);
  const picked = chosen.slice(0, 5);
  const key = picked.map((p) => p.id).join(",");

  async function ask() {
    setBusy(true);
    setError(null);
    const hh = householdProfile(data.context.profile);
    const preview: DraftHousehold = { allergies: hh.diet.allergies, dietStyle: hh.diet.style, restrictions: hh.diet.restrictions, avoid: hh.diet.neverRecommend.slice(0, 30), equipment: hh.equipment, skillLevel: hh.skillLevel, servings: Math.min(24, hh.household.cookingFor) };
    const r =
      data.mode === "preview"
        ? await draftUseUpAction({ items: picked.map((p) => ({ name: p.name.slice(0, 60), quantity: p.quantity, unit: p.unit, useBy: p.useBy })), today }, preview)
        : await draftUseUpAction({ itemIds: picked.map((p) => p.id), today });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    if (data.mode === "preview") await data.repo.keepDraft?.(r.data.recipe);
    data.remember([r.data.recipe]);
    setMade({ recipe: r.data.recipe, changes: r.data.changes, key });
  }

  return (
    <Card className="mt-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-accent" aria-hidden />
        <Eyebrow>Something new</Eyebrow>
      </div>
      <p className="mt-1 text-[16px]">
        Ask the AI to write a new dinner around {namesOf(picked)}
        {chosen.length > 5 ? " (the first five you picked)" : ""}.
      </p>
      <Hint className="mt-1">It&apos;s checked for food safety, your allergies, diet and equipment, and saved as an AI draft nobody has tested yet. Uses one of today&apos;s AI drafts.</Hint>
      {made && made.key === key ? (
        <div className="mt-3 rounded-2xl bg-background p-4">
          <StatusBadge recipe={made.recipe} />
          <Link href={`/recipes/${made.recipe.slug}`} className="mt-2 block text-[18px] font-semibold leading-snug hover:underline">
            {made.recipe.title}
          </Link>
          <p className="text-[14px] text-muted">
            {formatMinutes(made.recipe.totalMinutes)} · serves {made.recipe.servings} · skill {made.recipe.skillLevel}
          </p>
          {made.changes.length > 0 ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[14px]">
              {made.changes.slice(0, 6).map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <Button className="mt-3" disabled={busy} onClick={() => void ask()} icon={<Sparkles className="size-4" aria-hidden />}>
          {busy ? "Writing a recipe…" : "Ask AI for a new idea"}
        </Button>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-[15px] text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
