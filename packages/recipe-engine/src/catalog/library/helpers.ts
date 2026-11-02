import type { LibraryIngredientInput, LibraryStepInput } from "../../library/import";

/** Compact authoring helpers for library records (same shape any partner feed is converted to). */
export const i = (quantity: number | string | null, unit: string | null, item: string, preparation?: string, optional = false): LibraryIngredientInput => ({
  quantity,
  unit,
  item,
  preparation: preparation ?? null,
  optional,
});

/** Same, inside a named component ("Sauce", "Garnish"). */
export const ci = (component: string, quantity: number | string | null, unit: string | null, item: string, preparation?: string, optional = false): LibraryIngredientInput => ({
  ...i(quantity, unit, item, preparation, optional),
  component,
});

export const s = (body: string, opts: Omit<LibraryStepInput, "body"> = {}): LibraryStepInput => ({ body, ...opts });
export const cs = (component: string, body: string, opts: Omit<LibraryStepInput, "body" | "component"> = {}): LibraryStepInput => ({ body, component, ...opts });

/** Food-safety notes reused across raw and lightly cooked dishes. */
export const SAFETY = {
  rawShellfish:
    "Raw oysters and clams can carry Vibrio and norovirus. Buy from a reputable fishmonger, keep them on ice, discard any that are open before shucking, and skip them if you're pregnant, older, have liver disease or a weakened immune system.",
  rawFish:
    "Use very fresh fish sold for eating raw and keep it cold. Citrus doesn't kill bacteria or parasites the way cooking does. Not recommended for pregnant people, young children, older adults or anyone with a weakened immune system.",
  softEggs:
    "The eggs here aren't cooked to 160°F. Use pasteurized eggs if you're serving anyone pregnant, very young, older, or with a weakened immune system.",
  rawEggs:
    "This uses raw eggs. Use pasteurized eggs, and don't serve it to anyone pregnant, very young, older, or with a weakened immune system.",
} as const;
