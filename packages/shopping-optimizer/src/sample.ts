import { SampleCatalogProvider, type PricedProduct, type PricingProvider, type ProductSearchQuery } from "@kitchen-pantry/grocery-pricing";
import type { ShoppingStore } from "./types";

/**
 * PRACTICE MODE ONLY. Three made-up stores with made-up prices, so the
 * comparison can be tried before real store prices and routing are
 * connected (spec 03 §7 "mock data first, clearly labeled"). Every name
 * starts with "Sample", every price is labelled estimated, and these stores
 * are never compared with real ones.
 */
export const SAMPLE_STORES: ShoppingStore[] = [
  { key: "sample:store-a", provider: "sample", storeId: "store-a", retailer: "Sample Supermarket", name: "Sample Supermarket A", address: "Sample location — not a real store", location: null, hours: { timezone: "America/Chicago", open24: false, days: { monday: { open: "06:00", close: "23:00", open24: false }, tuesday: { open: "06:00", close: "23:00", open24: false }, wednesday: { open: "06:00", close: "23:00", open24: false }, thursday: { open: "06:00", close: "23:00", open24: false }, friday: { open: "06:00", close: "23:00", open24: false }, saturday: { open: "06:00", close: "23:00", open24: false }, sunday: { open: "07:00", close: "22:00", open24: false } } }, isSample: true },
  { key: "sample:store-b", provider: "sample", storeId: "store-b", retailer: "Sample Discount", name: "Sample Discount B", address: "Sample location — not a real store", location: null, hours: { timezone: "America/Chicago", open24: false, days: { monday: { open: "08:00", close: "21:00", open24: false }, tuesday: { open: "08:00", close: "21:00", open24: false }, wednesday: { open: "08:00", close: "21:00", open24: false }, thursday: { open: "08:00", close: "21:00", open24: false }, friday: { open: "08:00", close: "21:00", open24: false }, saturday: { open: "08:00", close: "21:00", open24: false }, sunday: { open: "09:00", close: "19:00", open24: false } } }, isSample: true },
  { key: "sample:store-c", provider: "sample", storeId: "store-c", retailer: "Sample Produce Market", name: "Sample Produce Market C", address: "Sample location — not a real store", location: null, hours: null, isSample: true },
];

/** How each sample store prices things (made up): B is cheaper on most, C is a small produce shop. */
const STORE_FACTOR: Record<string, number> = { "store-a": 1, "store-b": 0.84, "store-c": 0.92 };

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PRODUCE = /\b(apple|banana|berr|lemon|lime|orange|onion|garlic|potato|tomato|pepper|lettuce|spinach|kale|carrot|celery|cucumber|zucchini|squash|broccoli|cauliflower|cabbage|mushroom|avocado|herb|cilantro|parsley|basil|ginger|scallion|leek|corn|bean sprout|grape|melon|peach|pear)/i;

export class SampleStoresPricingProvider implements PricingProvider {
  readonly id = "sample";
  readonly displayName = "Sample stores (sample prices, not real)";
  readonly isMock = true;
  readonly storeSpecific = false;
  private readonly base: SampleCatalogProvider;
  constructor(private readonly now: () => Date = () => new Date()) {
    this.base = new SampleCatalogProvider(now);
  }
  async searchProducts() {
    return [];
  }
  async getPrices() {
    return [];
  }
  async searchPriced(query: ProductSearchQuery): Promise<PricedProduct[]> {
    const store = query.storeId;
    const factor = STORE_FACTOR[store];
    if (factor === undefined) return [];
    const h = hash(`${store}:${query.text.toLowerCase().trim()}`);
    // The produce market only sells produce; B doesn't carry about one item in six.
    if (store === "store-c" && !PRODUCE.test(query.text)) return [];
    if (store === "store-b" && h % 6 === 0) return [];
    const products = await this.base.searchPriced({ text: query.text, storeId: store });
    return products.map((p, i) => {
      const obs = p.observation!;
      const wobble = 0.9 + ((h >> (i + 2)) % 25) / 100; // 0.90–1.14, so no store is cheapest on everything
      const regular = Math.max(49, Math.round(obs.priceCents * factor * wobble));
      // Sample B runs card-only sales (to show promotion eligibility); A's are open to everyone.
      const onSale = store !== "store-c" && (h >> i) % 4 === 0;
      return {
        product: { ...p.product, provider: "sample", retailer: store, externalProductId: `${store}-${p.product.externalProductId}` },
        observation: {
          ...obs,
          externalProductId: `${store}-${p.product.externalProductId}`,
          storeId: store,
          priceCents: regular,
          promoPriceCents: onSale ? Math.round(regular * 0.8) : null,
          promoDescription: onSale ? (store === "store-b" ? "Sample card price" : "Sample sale") : null,
          availability: obs.availability,
          observedAt: this.now(),
        },
      };
    });
  }
}
