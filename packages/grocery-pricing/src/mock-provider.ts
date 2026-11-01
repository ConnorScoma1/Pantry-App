import type {
  PriceObservation,
  PricingProvider,
  ProductSearchQuery,
  RetailerProduct,
} from "./provider";

/**
 * SAMPLE DATA ONLY. These are illustrative placeholder prices used for
 * development and demos. They are not real prices from any retailer or
 * store, and `classifyPrice` will always label them "estimated".
 */
const SAMPLE_CATALOG: Array<RetailerProduct & { samplePriceCents: number }> = [
  { externalProductId: "sample-broccoli-1lb", name: "Broccoli crowns", packageSize: { value: 1, unit: "lb" }, samplePriceCents: 199 },
  { externalProductId: "sample-spinach-10oz", name: "Baby spinach", packageSize: { value: 10, unit: "oz" }, samplePriceCents: 349 },
  { externalProductId: "sample-chicken-thighs-1.5lb", name: "Boneless chicken thighs", packageSize: { value: 1.5, unit: "lb" }, samplePriceCents: 599 },
  { externalProductId: "sample-heavy-cream-16floz", name: "Heavy whipping cream", packageSize: { value: 16, unit: "fl oz" }, samplePriceCents: 389 },
  { externalProductId: "sample-garlic-3ct", name: "Garlic bulbs", packageSize: { value: 3, unit: "each" }, samplePriceCents: 189 },
  { externalProductId: "sample-lemon-1ct", name: "Lemon", packageSize: { value: 1, unit: "each" }, samplePriceCents: 59 },
  { externalProductId: "sample-parmesan-5oz", name: "Parmesan, grated", packageSize: { value: 5, unit: "oz" }, samplePriceCents: 429 },
  { externalProductId: "sample-rice-2lb", name: "Long-grain white rice", packageSize: { value: 2, unit: "lb" }, samplePriceCents: 249 },
  { externalProductId: "sample-bell-pepper-1ct", name: "Bell pepper", packageSize: { value: 1, unit: "each" }, samplePriceCents: 99 },
  { externalProductId: "sample-onion-3lb", name: "Yellow onions", packageSize: { value: 3, unit: "lb" }, samplePriceCents: 329 },
].map((p) => ({ ...p, provider: "mock", retailer: "Sample Store", brand: null, upc: null }));

export class MockPricingProvider implements PricingProvider {
  readonly id = "mock";
  readonly displayName = "Sample prices (not real)";
  readonly isMock = true;
  readonly storeSpecific = false;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async searchProducts(query: ProductSearchQuery): Promise<RetailerProduct[]> {
    const words = query.text.toLowerCase().split(/\s+/).filter(Boolean);
    return SAMPLE_CATALOG.filter((p) => {
      const name = p.name.toLowerCase();
      return words.some((w) => name.includes(w));
    })
      .slice(0, query.limit ?? 10)
      .map(({ samplePriceCents: _price, ...product }) => product);
  }

  async getPrices(storeId: string, externalProductIds: string[]): Promise<PriceObservation[]> {
    return externalProductIds.flatMap((id) => {
      const product = SAMPLE_CATALOG.find((p) => p.externalProductId === id);
      if (!product) return [];
      return [
        {
          externalProductId: id,
          storeId,
          priceCents: product.samplePriceCents,
          promoPriceCents: null,
          promoDescription: null,
          unitPriceCents: null,
          unitPriceUnit: null,
          availability: "unknown" as const,
          observedAt: this.now(),
        },
      ];
    });
  }
}
