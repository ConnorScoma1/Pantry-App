"use client";

import { dessertTiming, type PlanDraft } from "@kitchen-pantry/meal-planner";
import { formatMinutes, type RankedRecipe } from "@kitchen-pantry/recipe-engine";
import { dessertCategories, dessertFrequencies, dessertSkillLevels, labelFor, type DessertFrequency } from "@kitchen-pantry/shared-types";
import { CakeSlice, Heart, Minus, Plus, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, Hint } from "@/components/ui/card";
import { Chip } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { dayLabel } from "./meal-card";

type Dessert = PlanDraft["desserts"][number];

const categoryLabel = (code: string | null) => (code ? labelFor(dessertCategories, code) : "Dessert");
const skillLabel = (level: number) => dessertSkillLevels.find((s) => s.level === level)?.label ?? "";

/** The week's desserts: optional, never in a dinner slot, never every day. */
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
  defaultServings,
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
  defaultServings: number;
  onAdd: (date: string, recipeId: string, note: string | null) => void;
  onRemove: (date: string) => void;
  onServings: (date: string, servings: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const freq = dessertFrequencies.find((f) => f.code === frequency)!;
  const automatic = freq.perWeek > 0;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CakeSlice className="size-5 text-muted" aria-hidden />
            <Eyebrow>Desserts</Eyebrow>
          </div>
          <p className="mt-1.5 text-[15px] text-muted">
            {automatic ? `${freq.label}, planned with your dinners.` : frequency === "never" ? "Not planned automatically." : "Only when you add one."}{" "}
            <Link href="/profile#desserts" className="font-medium text-foreground underline underline-offset-4">
              Change
            </Link>
          </p>
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)} disabled={busy} icon={<Plus className="size-4" aria-hidden />}>
          Add dessert
        </Button>
      </div>

      {desserts.length > 0 ? (
        <ul className="mt-4 divide-y divide-border">
          {desserts.map((d) => {
            const r = d.recipeId ? byId.get(d.recipeId)?.recipe : undefined;
            const { weekday } = dayLabel(d.date, "long");
            const timing = r ? dessertTiming(r) : null;
            return (
              <li key={d.date} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">{weekday}</p>
                  {r ? (
                    <Link href={`/recipes/${r.slug}`} className="block truncate text-[17px] font-semibold hover:underline">
                      {r.title}
                    </Link>
                  ) : (
                    <p className="text-[17px] font-semibold">{d.customTitle ?? "Dessert"}</p>
                  )}
                  {r ? (
                    <p className="text-[14px] text-muted">
                      {categoryLabel(r.dessertCategory)} · {skillLabel(r.skillLevel)} · {formatMinutes(r.prepMinutes + r.cookMinutes)}
                      {r.chillMinutes ? ` + ${formatMinutes(r.chillMinutes)} ${r.dessertCategory === "frozen" ? "freezing" : "chilling"}` : ""}
                    </p>
                  ) : null}
                  {d.note || timing ? <p className="mt-0.5 text-[14px] text-accent">{d.note ?? timing}</p> : null}
                </div>
                <div className="flex items-center gap-1.5" role="group" aria-label={`Servings for ${weekday}'s dessert`}>
                  <button
                    type="button"
                    aria-label="Fewer servings"
                    disabled={busy || d.servings <= 1}
                    onClick={() => onServings(d.date, d.servings - 1)}
                    className="grid size-9 place-items-center rounded-full border border-border bg-background disabled:opacity-35"
                  >
                    <Minus className="size-4" aria-hidden />
                  </button>
                  <span className="min-w-[4.5rem] text-center text-[14px] tabular-nums">{d.servings} servings</span>
                  <button
                    type="button"
                    aria-label="More servings"
                    disabled={busy || d.servings >= 24}
                    onClick={() => onServings(d.date, d.servings + 1)}
                    className="grid size-9 place-items-center rounded-full border border-border bg-background disabled:opacity-35"
                  >
                    <Plus className="size-4" aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${weekday}'s dessert`}
                  title="Remove"
                  disabled={busy}
                  onClick={() => onRemove(d.date)}
                  className="grid size-10 place-items-center rounded-full text-muted hover:bg-surface-strong hover:text-foreground disabled:opacity-35"
                >
                  <X className="size-4.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <Hint>
          {automatic ? "Build the week and a dessert is added to suit it — or add one yourself." : "Add one whenever there's something to celebrate."}
        </Hint>
      )}

      <AddDessertSheet
        open={open}
        onClose={() => setOpen(false)}
        days={days.filter((d) => d >= today)}
        taken={new Set(desserts.map((d) => d.date))}
        planned={new Set(desserts.map((d) => d.recipeId).filter((x): x is string => Boolean(x)))}
        candidates={candidates}
        preferred={preferred}
        favorites={favorites}
        defaultServings={defaultServings}
        onPick={(date, r) => {
          setOpen(false);
          onAdd(date, r.recipe.id, dessertTiming(r.recipe));
        }}
      />
    </Card>
  );
}

function AddDessertSheet({
  open,
  onClose,
  days,
  taken,
  planned,
  candidates,
  preferred,
  favorites,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  days: string[];
  taken: ReadonlySet<string>;
  planned: ReadonlySet<string>;
  candidates: RankedRecipe[];
  preferred: readonly string[];
  favorites: ReadonlySet<string>;
  defaultServings: number;
  onPick: (date: string, r: RankedRecipe) => void;
}) {
  const firstFree = days.find((d) => !taken.has(d) && [5, 6, 4].includes((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7)) ?? days.find((d) => !taken.has(d)) ?? days[0];
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
    <Sheet open={open} onClose={onClose} title="Add a dessert" description="Desserts sit alongside dinner — they never replace it.">
      {days.length === 0 ? (
        <p className="text-[16px] text-muted">This week is over. Add desserts to next week instead.</p>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[15px] font-semibold">Which day?</p>
            <div className="flex flex-wrap gap-2">
              {days.map((d) => (
                <Chip key={d} selected={d === day} onToggle={() => setDate(d)}>
                  {dayLabel(d).weekday}
                  {taken.has(d) ? <span className="text-[13px] text-muted">· replace</span> : null}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[15px] font-semibold">What kind?</p>
            <div className="flex flex-wrap gap-2">
              <Chip selected={cats.length === 0} onToggle={() => setCats([])}>
                Any
              </Chip>
              {dessertCategories.map((c) => (
                <Chip
                  key={c.code}
                  selected={cats.includes(c.code)}
                  onToggle={() => setCats((cur) => (cur.includes(c.code) ? cur.filter((x) => x !== c.code) : [...cur, c.code]))}
                >
                  {c.label}
                </Chip>
              ))}
            </div>
          </div>
          {list.length === 0 ? (
            <p className="text-[15px] text-muted">No desserts in those categories fit your kitchen, diet and dessert skill. Try another category.</p>
          ) : (
            <ul className="space-y-2">
              {list.map((r) => {
                const inWeek = planned.has(r.recipe.id);
                const timing = dessertTiming(r.recipe);
                return (
                  <li key={r.recipe.id}>
                    <button
                      type="button"
                      disabled={!day || inWeek}
                      onClick={() => day && onPick(day, r)}
                      className={cn("w-full rounded-2xl border border-border bg-background px-4 py-3 text-left hover:bg-surface disabled:opacity-50")}
                    >
                      <span className="flex items-center gap-2 text-[16px] font-semibold">
                        {favorites.has(r.recipe.id) ? <Heart className="size-4 fill-current text-accent" aria-label="Favourite" /> : null}
                        {r.recipe.title}
                      </span>
                      <span className="block text-[14px] text-muted">
                        {categoryLabel(r.recipe.dessertCategory)} · {skillLabel(r.recipe.skillLevel)} · {formatMinutes(r.recipe.prepMinutes + r.recipe.cookMinutes)}
                        {inWeek ? " · already this week" : ""}
                      </span>
                      {timing ? <span className="block text-[14px] text-accent">{timing}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}
