"use client";

import { libraryOf } from "@kitchen-pantry/recipe-engine";
import { authenticityLevels, labelFor, recipeVariants, type Recipe } from "@kitchen-pantry/shared-types";
import { BadgeCheck, FlaskConical, Lightbulb, ShieldAlert, Snowflake, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * How far a recipe has been checked (spec 08 §7): never call something
 * tested unless a person tested it, and say plainly when it's an AI draft
 * or only a dish idea.
 */
export function statusLabel(recipe: Recipe): { label: string; tone: "good" | "neutral" | "ai" | "idea"; detail: string } {
  const s = libraryOf(recipe).status;
  if (s === "idea") return { label: "Dish idea", tone: "idea", detail: "No full recipe yet — just the dish." };
  if (recipe.source.kind === "ai_generated") return { label: "AI draft · not reviewed", tone: "ai", detail: "Written by AI for your household and checked automatically (amounts, food safety, allergens). Nobody has tested it." };
  if (s === "tested") return { label: "Kitchen-tested", tone: "good", detail: "Cooked and checked by a person." };
  if (s === "reviewed") return { label: "Reviewed", tone: "good", detail: "A person checked the amounts, steps and food safety." };
  return { label: "Not yet reviewed", tone: "neutral", detail: "Complete and checked automatically; a person hasn't reviewed it yet." };
}

export function StatusBadge({ recipe, className }: { recipe: Recipe; className?: string }) {
  const s = statusLabel(recipe);
  const Icon = s.tone === "good" ? BadgeCheck : s.tone === "ai" ? Sparkles : s.tone === "idea" ? Lightbulb : FlaskConical;
  return (
    <span
      title={s.detail}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-semibold",
        s.tone === "good" && "bg-accent-soft text-foreground",
        s.tone === "neutral" && "bg-surface-strong text-muted",
        s.tone === "ai" && "bg-warning/15 text-foreground",
        s.tone === "idea" && "bg-surface-strong text-foreground",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {s.label}
    </span>
  );
}

/** "Traditional · Oaxaca" or "Fusion" — authentic vs adapted must be clear (spec 08 §1). */
export function AuthenticityBadge({ recipe, className }: { recipe: Recipe; className?: string }) {
  const lib = libraryOf(recipe);
  const parts = [lib.authenticity ? labelFor(authenticityLevels, lib.authenticity) : null, lib.region, lib.variant !== "classic" ? labelFor(recipeVariants, lib.variant) : null].filter(Boolean);
  if (parts.length === 0) return null;
  const desc = lib.authenticity ? authenticityLevels.find((a) => a.code === lib.authenticity)?.description : undefined;
  return (
    <span title={desc} className={cn("inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-[13px] font-medium", className)}>
      {parts.join(" · ")}
    </span>
  );
}

/** Food-safety note (raw fish, soft eggs…) — shown before the method, never hidden. */
export function SafetyNote({ recipe }: { recipe: Recipe }) {
  const note = libraryOf(recipe).safetyNote;
  if (!note) return null;
  return (
    <div role="note" className="mt-4 flex gap-3 rounded-card border border-warning/40 bg-warning/10 p-5">
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
      <p className="text-[15px]">
        <span className="font-semibold">Food safety: </span>
        {note}
      </p>
    </div>
  );
}

export function StorageNote({ recipe }: { recipe: Recipe }) {
  const storage = libraryOf(recipe).storage;
  if (!storage) return null;
  return (
    <p className="mt-6 flex gap-2 text-[15px]">
      <Snowflake className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <span>
        <span className="font-semibold">Leftovers: </span>
        {storage}
      </span>
    </p>
  );
}

/** Source, licence and any attribution the licence requires. */
export function SourceLine({ recipe }: { recipe: Recipe }) {
  const lib = libraryOf(recipe);
  const licence =
    lib.license === "owned" || lib.license === "unknown"
      ? null
      : lib.license === "public-domain"
        ? "Public domain"
        : lib.license.startsWith("licensed:")
          ? "Used under licence"
          : lib.license.toUpperCase().replace("CC-BY-SA-4.0", "CC BY-SA 4.0").replace("CC-BY-4.0", "CC BY 4.0").replace("CC0", "CC0");
  const by = recipe.source.kind === "original" ? "Original recipe by " : recipe.source.kind === "ai_generated" ? "AI draft by " : "Source: ";
  return (
    <p className="mt-10 border-t border-border pt-4 text-[14px] text-muted">
      {by}
      {recipe.source.url ? (
        <a href={recipe.source.url} className="underline" rel="noopener noreferrer" target="_blank">
          {recipe.source.name}
        </a>
      ) : (
        recipe.source.name
      )}
      {licence ? ` · ${licence}` : ""}
      {recipe.source.attribution ? ` · ${recipe.source.attribution}` : ""}. {statusLabel(recipe).detail} Food-safety temperatures follow USDA guidance. Always check product labels for allergens.
    </p>
  );
}
