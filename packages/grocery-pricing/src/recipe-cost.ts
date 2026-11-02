import { convert } from "@kitchen-pantry/inventory-engine";
import type { Quantity } from "@kitchen-pantry/shared-types";
import { z } from "zod";
import { chooseProduct, type SearchCache } from "./basket";
import { classifyPrice, PricingProviderError, type PricedProduct, type PricingProvider } from "./provider";

/**
 * What a recipe's ingredients cost per serving at one store — for the
 * amounts the recipe uses (a quarter of a 1 lb bag counts as a quarter of
 * its price), from the store's real prices. Long-lasting basics (salt,
 * spices, oil) are left out by the caller and listed. An ingredient whose
 * amount can't be compared to the package is "not priced", never guessed;
 * the result says how complete it is.
 */
export interface RecipeCostInput {
  id: string;
  servings: number;
  ingredients: Array<{ name: string; quantity: Quantity | null }>;
}

export interface RecipeCost {
  id: string;
  /** Sum of priced portions ÷ servings; null when nothing could be priced. */
  perServingCents: number | null;
  totalCents: number;
  pricedCount: number;
  /** Ingredients that couldn't be priced (no match, no price, or amount can't be compared). */
  unpriced: string[];
  /** True when every counted ingredient was priced. */
  complete: boolean;
  /** Oldest price used. */
  observedAt: string | null;
}

export async function costRecipes(input: {
  provider: PricingProvider;
  storeId: string;
  recipes: readonly RecipeCostInput[];
  cache?: SearchCache;
  now?: () => Date;
}): Promise<{ costs: RecipeCost[]; warning: string | null }> {
  const { provider, storeId } = input;
  const now = input.now ?? (() => new Date());
  let warning: string | null = null;
  let stop = false;
  const search = async (term: string): Promise<PricedProduct[]> => {
    const key = `${provider.id}:${storeId}:${term.toLowerCase().trim()}`;
    const hit = input.cache?.get(key);
    if (hit) return hit;
    const results = provider.searchPriced ? await provider.searchPriced({ text: term, storeId, limit: 10 }) : [];
    input.cache?.set(key, results);
    return results;
  };

  const costs: RecipeCost[] = [];
  for (const recipe of input.recipes) {
    let total = 0;
    let priced = 0;
    const unpriced: string[] = [];
    const dates: string[] = [];
    for (const ing of recipe.ingredients) {
      if (stop) {
        unpriced.push(ing.name);
        continue;
      }
      let results: PricedProduct[];
      try {
        results = await search(ing.name);
      } catch (error) {
        const e = error instanceof PricingProviderError ? error : null;
        if (e && (e.kind === "auth" || e.kind === "rate_limited" || e.kind === "not_configured")) stop = true;
        warning ??= e?.message ?? "Some prices couldn't be loaded.";
        unpriced.push(ing.name);
        continue;
      }
      const choice = chooseProduct({ id: ing.name, name: ing.name, quantity: ing.quantity }, results);
      const obs = choice?.priced.observation ?? null;
      const status = obs ? classifyPrice(obs, provider, now()) : "unavailable";
      if (!choice || !obs || (status !== "verified" && status !== "cached")) {
        unpriced.push(ing.name);
        continue;
      }
      const each = obs.promoPriceCents ?? obs.priceCents;
      const product = choice.priced.product;
      let portion: number | null = null;
      if (ing.quantity && product.soldByWeight) {
        const lb = convert(ing.quantity, "lb");
        portion = lb === null ? null : lb * each;
      } else if (ing.quantity && product.packageSize && product.packageSize.value > 0) {
        const amount = convert(ing.quantity, product.packageSize.unit);
        portion = amount === null ? null : (amount / product.packageSize.value) * each;
      }
      if (portion === null) {
        unpriced.push(ing.name);
        continue;
      }
      total += portion;
      priced++;
      dates.push(obs.observedAt.toISOString());
    }
    const servings = Math.max(1, recipe.servings);
    costs.push({
      id: recipe.id,
      perServingCents: priced > 0 ? Math.round(total / servings) : null,
      totalCents: Math.round(total),
      pricedCount: priced,
      unpriced,
      complete: unpriced.length === 0 && priced > 0,
      observedAt: dates.sort()[0] ?? null,
    });
  }
  return { costs, warning };
}

export const recipeCostRequestSchema = z.object({
  storeId: z.string().regex(/^[0-9A-Za-z]{4,20}$/, "That store id isn't valid."),
  recipes: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        servings: z.number().int().min(1).max(24),
        ingredients: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(120),
              quantity: z.object({ value: z.number().positive().finite().max(100_000), unit: z.string().min(1).max(20) }).nullable(),
            }),
          )
          .max(25),
      }),
    )
    .min(1)
    .max(8),
});

export const recipeCostSchema = z.object({
  id: z.string().max(64),
  perServingCents: z.number().int().nonnegative().nullable(),
  totalCents: z.number().int().nonnegative(),
  pricedCount: z.number().int().nonnegative(),
  unpriced: z.array(z.string().max(120)).max(25),
  complete: z.boolean(),
  observedAt: z.string().max(40).nullable(),
});
export const recipeCostsResultSchema = z.object({ costs: z.array(recipeCostSchema).max(8), warning: z.string().max(300).nullable() });
