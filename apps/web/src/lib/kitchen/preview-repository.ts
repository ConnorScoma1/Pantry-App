"use client";

import { searchLocalIngredients, STAPLES, displayName } from "@kitchen-pantry/inventory-engine";
import type { PantryItem } from "@kitchen-pantry/shared-types";
import { issuesToFieldErrors, pantryItemInputSchema, type PantryItemInput } from "@kitchen-pantry/validation";
import type { KitchenRepository, Result } from "./types";

/** Browser-only kitchen for PREVIEW MODE. Same validation as the server. */
const KEY = "kp-preview-pantry-v1";

function load(): PantryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? (value as PantryItem[]) : [];
  } catch {
    return [];
  }
}

function save(items: PantryItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage unavailable: changes last for this visit only.
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fromInput(input: PantryItemInput, base?: PantryItem): PantryItem {
  const now = new Date().toISOString();
  return {
    id: base?.id ?? newId(),
    ingredientId: input.ingredientId,
    name: input.name,
    category: input.category,
    quantity: input.quantity,
    unit: input.quantity === null ? null : input.unit,
    storageLocation: input.storageLocation,
    purchasedOn: input.purchasedOn,
    useBy: input.useBy,
    openedOn: input.openedOn,
    estimatedRemainingPct: input.estimatedRemainingPct,
    pricePaidCents: input.pricePaidCents,
    isStaple: input.isStaple,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
  };
}

function invalid(error: Parameters<typeof issuesToFieldErrors>[0]): Result<never> {
  return { ok: false, message: "Please check the highlighted fields.", fieldErrors: issuesToFieldErrors(error) };
}

export const previewKitchenRepository: KitchenRepository = {
  async list() {
    return { ok: true, data: load() };
  },
  async add(input) {
    const parsed = pantryItemInputSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const item = fromInput(parsed.data);
    save([...load(), item]);
    return { ok: true, data: item };
  },
  async update(id, input) {
    const parsed = pantryItemInputSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const items = load();
    const existing = items.find((i) => i.id === id);
    if (!existing) return { ok: false, message: "That item no longer exists." };
    const updated = fromInput(parsed.data, existing);
    save(items.map((i) => (i.id === id ? updated : i)));
    return { ok: true, data: updated };
  },
  async remove(id) {
    save(load().filter((i) => i.id !== id));
    return { ok: true, data: null };
  },
  async addStaples(names) {
    const created = names
      .map((n) => STAPLES.find((s) => s.name === n.toLowerCase()))
      .filter((s): s is (typeof STAPLES)[number] => Boolean(s))
      .map((s) =>
        fromInput({
          ingredientId: null,
          name: displayName(s.name),
          category: s.category,
          quantity: null,
          unit: null,
          storageLocation: s.storageLocation,
          purchasedOn: null,
          useBy: null,
          openedOn: null,
          estimatedRemainingPct: null,
          pricePaidCents: null,
          isStaple: true,
        }),
      );
    save([...load(), ...created]);
    return { ok: true, data: created };
  },
  async searchIngredients(query) {
    return { ok: true, data: searchLocalIngredients(query) };
  },
};
