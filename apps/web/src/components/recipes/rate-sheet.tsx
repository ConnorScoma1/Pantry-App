"use client";

import type { Result } from "@kitchen-pantry/database";
import type { Recipe, RecipeRating } from "@kitchen-pantry/shared-types";
import { recipeRatingInputSchema } from "@kitchen-pantry/validation";
import { Star } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip, Segmented, TextInput } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

function Stars({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[15px] font-semibold">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onClick={() => onChange(value === n ? null : n)}
            className="grid size-11 place-items-center rounded-full hover:bg-surface"
          >
            <Star className={cn("size-7", value !== null && n <= value ? "fill-warning text-warning" : "text-border")} aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}

const DIFFICULTY = [
  { value: "1", label: "Easy" },
  { value: "3", label: "As expected" },
  { value: "5", label: "Hard" },
] as const;

/** "How was it?" — real feedback that drives future recommendations. */
export function RateSheet({
  open,
  recipe,
  onClose,
  onSubmit,
}: {
  open: boolean;
  recipe: Recipe;
  onClose: () => void;
  onSubmit: (input: unknown) => Promise<Result<RecipeRating>>;
}) {
  const ids = { minutes: useId(), notes: useId() };
  const [overall, setOverall] = useState<number | null>(null);
  const [flavor, setFlavor] = useState<number | null>(null);
  const [family, setFamily] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<"1" | "3" | "5" | null>(null);
  const [again, setAgain] = useState<boolean | null>(null);
  const [minutes, setMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOverall(null);
    setFlavor(null);
    setFamily(null);
    setDifficulty(null);
    setAgain(null);
    setMinutes("");
    setNotes("");
    setError(null);
  }, [open]);

  async function submit() {
    const input = {
      recipeId: recipe.id,
      overall,
      flavor,
      difficulty: difficulty ? Number(difficulty) : null,
      wouldCookAgain: again,
      actualMinutes: minutes ? Number(minutes) : null,
      familyApproval: family,
      notes: notes.trim() || null,
    };
    const parsed = recipeRatingInputSchema.safeParse(input);
    if (!parsed.success) {
      setError(overall === null ? "Give it an overall rating first." : "Please check your answers.");
      return;
    }
    setBusy(true);
    const result = await onSubmit(parsed.data);
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.message);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="How was it?"
      description={recipe.title}
      footer={
        <div className="space-y-2">
          {error ? (
            <p role="alert" className="text-center text-[15px] font-medium text-danger">
              {error}
            </p>
          ) : null}
          <Button size="lg" className="w-full" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save rating"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Stars
          label="Overall"
          value={overall}
          onChange={(v) => {
            setOverall(v);
            setError(null);
          }}
        />
        <div>
          <p className="mb-1.5 text-[15px] font-semibold">Would you cook it again?</p>
          <div className="flex gap-2">
            <Chip selected={again === true} onToggle={() => setAgain(again === true ? null : true)}>
              Yes
            </Chip>
            <Chip selected={again === false} onToggle={() => setAgain(again === false ? null : false)}>
              No
            </Chip>
          </div>
        </div>
        <Stars label="Flavour" value={flavor} onChange={setFlavor} />
        <Stars label="Family approval" value={family} onChange={setFamily} />
        <div>
          <p className="mb-1.5 text-[15px] font-semibold">Difficulty</p>
          <Segmented
            label="Difficulty"
            value={difficulty ?? ("" as "1")}
            onChange={(v) => setDifficulty(v)}
            options={DIFFICULTY.map((d) => ({ value: d.value, label: d.label }))}
          />
        </div>
        <div>
          <label htmlFor={ids.minutes} className="mb-1.5 block text-[15px] font-semibold">
            How long did it actually take? <span className="font-normal text-muted">(minutes)</span>
          </label>
          <TextInput
            id={ids.minutes}
            inputMode="numeric"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))}
            placeholder={String(recipe.totalMinutes)}
          />
        </div>
        <div>
          <label htmlFor={ids.notes} className="mb-1.5 block text-[15px] font-semibold">
            Notes for next time <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id={ids.notes}
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
            rows={3}
            className="w-full rounded-control border border-border bg-background px-4 py-3 text-[17px] outline-none placeholder:text-subtle focus:border-foreground"
            placeholder="e.g. halve the chili flakes"
          />
        </div>
      </div>
    </Sheet>
  );
}
