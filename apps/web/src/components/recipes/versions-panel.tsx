"use client";

import { isCookable, libraryOf } from "@kitchen-pantry/recipe-engine";
import { labelFor, recipeVariants, type Recipe } from "@kitchen-pantry/shared-types";
import { Lightbulb, LoaderCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card, Eyebrow } from "@/components/ui/card";
import { useRecipeDraft } from "@/lib/library/use-library";
import type { useRecipes } from "@/lib/recipes/use-recipes";

const VERSIONS = [
  { code: "simplified", label: "Simpler", hint: "Fewer steps, basic techniques" },
  { code: "budget", label: "Budget-friendly", hint: "Cheaper swaps, same idea" },
  { code: "elevated", label: "Elevated", hint: "Restaurant-style technique and plating" },
  { code: "traditional", label: "Traditional", hint: "The way it's made where it comes from" },
] as const;

/**
 * Other versions of the dish (spec 08 §5): the ones already in the library,
 * and an AI draft of a simpler, budget, elevated or traditional version —
 * saved for this household only and labelled as not yet reviewed.
 */
export function VersionsPanel({ recipe, data }: { recipe: Recipe; data: ReturnType<typeof useRecipes> }) {
  const draft = useRecipeDraft(data);
  const [made, setMade] = useState<{ recipe: Recipe; changes: string[]; cached: boolean } | null>(null);
  const lib = libraryOf(recipe);
  const others = data.recipes.filter((r) => r.id !== recipe.id && r.cuisine === recipe.cuisine && libraryOf(r).dishKey === lib.dishKey && isCookable(r));
  const offered = VERSIONS.filter((v) => !(v.code === lib.variant) && !(v.code === "traditional" && lib.authenticity === "traditional"));

  return (
    <Card className="mt-8">
      <Eyebrow>Other versions</Eyebrow>
      {others.length > 0 ? (
        <ul className="mt-2 space-y-1.5 text-[16px]">
          {others.map((o) => (
            <li key={o.id}>
              <Link href={`/recipes/${o.slug}`} className="font-semibold underline-offset-4 hover:underline">
                {o.title}
              </Link>{" "}
              <span className="text-muted">· {labelFor(recipeVariants, libraryOf(o).variant)}{o.source.kind === "ai_generated" ? " · AI draft" : ""}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[15px] text-muted">No other versions in the library yet.</p>
      )}
      <p className="mt-4 text-[15px]">Ask our AI for a version that suits you. It's checked for food safety, your allergies and your equipment, and saved just for your household.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {offered.map((v) => (
          <button
            key={v.code}
            type="button"
            title={v.hint}
            disabled={draft.busy !== null}
            onClick={async () => {
              const r = await draft.request(recipe, v.code);
              if (r.ok) setMade(r.data);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-[15px] font-semibold hover:bg-surface disabled:opacity-50"
          >
            {draft.busy === v.code ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4 text-accent" aria-hidden />}
            {v.label}
          </button>
        ))}
      </div>
      {draft.busy ? <p className="mt-2 text-[14px] text-muted" role="status">Writing and checking your version — this takes about half a minute.</p> : null}
      {draft.error ? (
        <p role="alert" className="mt-3 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">
          {draft.error}
        </p>
      ) : null}
      {made ? <DraftReady made={made} /> : null}
    </Card>
  );
}

function DraftReady({ made }: { made: { recipe: Recipe; changes: string[]; cached: boolean } }) {
  return (
    <div role="status" className="mt-4 rounded-2xl bg-accent-soft px-4 py-3 text-[15px]">
      <p className="font-semibold">{made.cached ? "You already have this version:" : "Your version is ready:"} {made.recipe.title}</p>
      {made.changes.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {made.changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}
      <Link href={`/recipes/${made.recipe.slug}`} className="mt-2 inline-block font-semibold text-accent underline underline-offset-4">
        Open it
      </Link>
      <span className="text-muted"> · AI draft, not yet reviewed</span>
    </div>
  );
}

/** A dish idea (no instructions yet): what we know, and an AI draft of the full recipe. */
export function IdeaPanel({ recipe, data }: { recipe: Recipe; data: ReturnType<typeof useRecipes> }) {
  const draft = useRecipeDraft(data);
  const [made, setMade] = useState<{ recipe: Recipe; changes: string[]; cached: boolean } | null>(null);
  return (
    <Card className="mt-8">
      <p className="flex items-center gap-2 text-[17px] font-semibold">
        <Lightbulb className="size-5 text-accent" aria-hidden /> This is a dish idea
      </p>
      <p className="mt-1 text-[15px] text-muted">
        We know the dish, but the library doesn&apos;t have a full recipe for it yet, so there&apos;s nothing to cook from here. It still shows up in menus as an idea.
      </p>
      <button
        type="button"
        disabled={draft.busy !== null}
        onClick={async () => {
          const r = await draft.request(recipe, "full");
          if (r.ok) setMade(r.data);
        }}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground px-5 text-[16px] font-semibold text-background disabled:opacity-50"
      >
        {draft.busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
        Draft the full recipe with AI
      </button>
      <p className="mt-2 text-[14px] text-muted">Checked automatically for food safety, your allergies and your equipment, and labelled as an AI draft until a person reviews it.</p>
      {draft.error ? (
        <p role="alert" className="mt-3 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">
          {draft.error}
        </p>
      ) : null}
      {made ? <DraftReady made={made} /> : null}
    </Card>
  );
}
