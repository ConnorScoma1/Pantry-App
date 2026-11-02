"use client";

import {
  pantryCategories,
  remainingLevels,
  storageLocations,
  type IngredientOption,
  type PantryItem,
  type RemovalReason,
} from "@kitchen-pantry/shared-types";
import { emptyPantryItemInput, pantryItemInputSchema, issuesToFieldErrors, type PantryItemInput } from "@kitchen-pantry/validation";
import { ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip, FieldError, Segmented, TextInput } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { guessCategory } from "@kitchen-pantry/inventory-engine";
import { addDays } from "@kitchen-pantry/meal-planner";
import type { KitchenRepository, Result } from "@/lib/kitchen/types";

const UNITS = ["each", "lb", "oz", "g", "kg", "cup", "tbsp", "tsp", "ml", "l", "fl oz", "can", "jar", "bag", "box", "bunch", "package"];

function toInput(item: PantryItem): PantryItemInput {
  return {
    ingredientId: item.ingredientId,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    storageLocation: item.storageLocation,
    purchasedOn: item.purchasedOn,
    useBy: item.useBy,
    openedOn: item.openedOn,
    estimatedRemainingPct: item.estimatedRemainingPct,
    pricePaidCents: item.pricePaidCents,
    isStaple: item.isStaple,
  };
}

export function ItemSheet({
  open,
  item,
  today,
  repository,
  onClose,
  onSave,
  onRemove,
  prefill = null,
  note = null,
}: {
  open: boolean;
  /** null = adding a new item */
  item: PantryItem | null;
  /** Starting values for a new item (e.g. from a scanned barcode). */
  prefill?: Partial<PantryItemInput> | null;
  /** A line shown at the top (e.g. where the details came from). */
  note?: string | null;
  today: string;
  repository: KitchenRepository;
  onClose: () => void;
  onSave: (input: PantryItemInput) => Promise<Result<unknown>>;
  onRemove: (reason: RemovalReason) => Promise<Result<unknown>>;
}) {
  const [form, setForm] = useState<PantryItemInput>(emptyPantryItemInput());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [suggestions, setSuggestions] = useState<IngredientOption[]>([]);
  const [priceText, setPriceText] = useState("");
  const [qtyText, setQtyText] = useState("");
  /** Once the user picks category/location themselves, stop auto-guessing. */
  const [manual, setManual] = useState(false);
  const searchSeq = useRef(0);
  const ids = { name: useId(), qty: useId(), unit: useId(), category: useId(), useBy: useId() };

  useEffect(() => {
    if (!open) return;
    const initial = item ? toInput(item) : { ...emptyPantryItemInput(), ...(prefill ?? {}) };
    setForm(initial);
    setQtyText(initial.quantity === null ? "" : String(initial.quantity));
    setPriceText(initial.pricePaidCents === null ? "" : (initial.pricePaidCents / 100).toFixed(2));
    setShowMore(Boolean(item && (item.purchasedOn || item.openedOn || item.pricePaidCents !== null)));
    setErrors({});
    setFormError(null);
    setSuggestions([]);
    setManual(item !== null || Boolean(prefill?.category));
  }, [open, item, prefill]);

  const set = (patch: Partial<PantryItemInput>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
    setFormError(null);
  };

  async function onNameChange(value: string) {
    const guess = manual ? null : guessCategory(value);
    set({ name: value, ingredientId: null, ...(guess ?? {}) });
    const seq = ++searchSeq.current;
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const result = await repository.searchIngredients(value);
    if (seq === searchSeq.current && result.ok) {
      setSuggestions(result.data.filter((s) => s.name.toLowerCase() !== value.trim().toLowerCase()));
    }
  }

  function pickSuggestion(option: IngredientOption) {
    set({
      name: option.name,
      ingredientId: option.id,
      category: option.category,
      storageLocation: option.storageLocation,
      unit: form.unit ?? (option.defaultUnit === "g" || option.defaultUnit === "ml" ? null : option.defaultUnit),
    });
    setSuggestions([]);
  }

  async function submit() {
    const quantity = qtyText.trim() === "" ? null : Number(qtyText);
    const pricePaidCents = priceText.trim() === "" ? null : Math.round(Number(priceText) * 100);
    const candidate: PantryItemInput = {
      ...form,
      quantity: quantity !== null && Number.isFinite(quantity) ? quantity : quantity === null ? null : NaN,
      unit: quantity === null ? null : (form.unit ?? "each"),
      pricePaidCents: pricePaidCents !== null && Number.isFinite(pricePaidCents) ? pricePaidCents : pricePaidCents === null ? null : NaN,
    };
    const parsed = pantryItemInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error));
      setFormError("Please check the highlighted fields.");
      return;
    }
    setBusy(true);
    const result = await onSave(parsed.data);
    setBusy(false);
    if (result.ok) onClose();
    else {
      setFormError(result.message);
      if (result.fieldErrors) setErrors(result.fieldErrors);
    }
  }

  async function remove(reason: RemovalReason) {
    setBusy(true);
    const result = await onRemove(reason);
    setBusy(false);
    if (result.ok) onClose();
    else setFormError(result.message);
  }

  const quickDates = [
    { label: "Today", value: today },
    { label: "In 3 days", value: addDays(today, 3) },
    { label: "In a week", value: addDays(today, 7) },
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item ? "Edit item" : "Add to your kitchen"}
      description={note ?? undefined}
      footer={
        <div className="space-y-2">
          {formError ? (
            <p role="alert" className="text-center text-[15px] font-medium text-danger">
              {formError}
            </p>
          ) : null}
          <Button size="lg" className="w-full" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : item ? "Save changes" : "Add item"}
          </Button>
          {item ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => remove("consumed")} disabled={busy}>
                Used it up
              </Button>
              <Button variant="danger" onClick={() => remove("discarded")} disabled={busy}>
                Threw it out
              </Button>
            </div>
          ) : null}
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <label htmlFor={ids.name} className="mb-1.5 block text-[15px] font-semibold">
            What is it?
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-subtle" aria-hidden />
            <TextInput
              id={ids.name}
              value={form.name}
              onChange={(e) => void onNameChange(e.target.value)}
              placeholder="e.g. chicken thighs, spinach"
              autoComplete="off"
              className="pl-11"
              invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? `${ids.name}-error` : undefined}
            />
          </div>
          <FieldError id={`${ids.name}-error`} message={errors.name} />
          {suggestions.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="Suggestions">
              {suggestions.slice(0, 6).map((s) => (
                <li key={s.name}>
                  <button
                    type="button"
                    onClick={() => pickSuggestion(s)}
                    className="min-h-10 rounded-full bg-surface px-4 text-[15px] font-medium hover:bg-surface-strong"
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div>
          <p className="mb-1.5 text-[15px] font-semibold">Where does it live?</p>
          <Segmented
            label="Storage location"
            value={form.storageLocation}
            onChange={(storageLocation) => {
              setManual(true);
              set({ storageLocation });
            }}
            options={storageLocations.map((l) => ({ value: l.code, label: l.label }))}
          />
        </div>

        <div className="grid grid-cols-[1fr_1.2fr] gap-3">
          <div>
            <label htmlFor={ids.qty} className="mb-1.5 block text-[15px] font-semibold">
              Amount <span className="font-normal text-muted">(optional)</span>
            </label>
            <TextInput
              id={ids.qty}
              inputMode="decimal"
              value={qtyText}
              onChange={(e) => {
                setQtyText(e.target.value.replace(/[^0-9.]/g, ""));
                setErrors({});
              }}
              placeholder="—"
              invalid={Boolean(errors.quantity)}
            />
            <FieldError message={errors.quantity} />
          </div>
          <div>
            <label htmlFor={ids.unit} className="mb-1.5 block text-[15px] font-semibold">
              Unit
            </label>
            <select
              id={ids.unit}
              value={form.unit ?? "each"}
              onChange={(e) => set({ unit: e.target.value })}
              className="h-13 w-full rounded-control border border-border bg-background px-4 text-[17px] outline-none focus:border-foreground"
            >
              {(form.unit && !UNITS.includes(form.unit) ? [form.unit, ...UNITS] : UNITS).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <FieldError message={errors.unit} />
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[15px] font-semibold">
            How much is left? <span className="font-normal text-muted">(optional)</span>
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="How much is left">
            {remainingLevels.map((level) => (
              <Chip
                key={level.pct}
                selected={form.estimatedRemainingPct === level.pct}
                onToggle={() =>
                  set({ estimatedRemainingPct: form.estimatedRemainingPct === level.pct ? null : level.pct })
                }
              >
                {level.label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor={ids.useBy} className="mb-1.5 block text-[15px] font-semibold">
            Use by <span className="font-normal text-muted">(optional)</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <TextInput
              id={ids.useBy}
              type="date"
              value={form.useBy ?? ""}
              onChange={(e) => set({ useBy: e.target.value || null })}
              className="w-auto flex-1 min-w-[10rem]"
              invalid={Boolean(errors.useBy)}
            />
            {quickDates.map((d) => (
              <Chip key={d.label} selected={form.useBy === d.value} onToggle={() => set({ useBy: form.useBy === d.value ? null : d.value })}>
                {d.label}
              </Chip>
            ))}
          </div>
          <FieldError message={errors.useBy} />
          <p className="mt-2 text-[14px] text-muted">
            Go by the date on the pack. We never suggest anything past its use-by date.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="flex w-full items-center justify-between rounded-2xl bg-surface px-4 py-3 text-[15px] font-semibold"
        >
          More details
          <ChevronDown className={`size-5 transition-transform ${showMore ? "rotate-180" : ""}`} aria-hidden />
        </button>

        {showMore ? (
          <div className="space-y-4">
            <div>
              <label htmlFor={ids.category} className="mb-1.5 block text-[15px] font-semibold">
                Category
              </label>
              <select
                id={ids.category}
                value={form.category}
                onChange={(e) => {
                  setManual(true);
                  set({ category: e.target.value as PantryItemInput["category"] });
                }}
                className="h-13 w-full rounded-control border border-border bg-background px-4 text-[17px] outline-none focus:border-foreground"
              >
                {pantryCategories.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${ids.name}-bought`} className="mb-1.5 block text-[15px] font-semibold">
                  Bought
                </label>
                <TextInput
                  id={`${ids.name}-bought`}
                  type="date"
                  value={form.purchasedOn ?? ""}
                  onChange={(e) => set({ purchasedOn: e.target.value || null })}
                />
              </div>
              <div>
                <label htmlFor={`${ids.name}-opened`} className="mb-1.5 block text-[15px] font-semibold">
                  Opened
                </label>
                <TextInput
                  id={`${ids.name}-opened`}
                  type="date"
                  value={form.openedOn ?? ""}
                  onChange={(e) => set({ openedOn: e.target.value || null })}
                  invalid={Boolean(errors.openedOn)}
                />
                <FieldError message={errors.openedOn} />
              </div>
            </div>
            <div>
              <label htmlFor={`${ids.name}-price`} className="mb-1.5 block text-[15px] font-semibold">
                Price paid <span className="font-normal text-muted">(optional)</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[17px] text-muted">$</span>
                <TextInput
                  id={`${ids.name}-price`}
                  inputMode="decimal"
                  value={priceText}
                  onChange={(e) => setPriceText(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="pl-8"
                  invalid={Boolean(errors.pricePaidCents)}
                />
              </div>
              <FieldError message={errors.pricePaidCents} />
            </div>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
