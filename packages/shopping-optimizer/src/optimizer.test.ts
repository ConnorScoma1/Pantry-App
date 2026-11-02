import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStoreHours, summarize, type PricedLine } from "@kitchen-pantry/grocery-pricing";
import {
  compareStrategies,
  DEFAULT_SETTINGS,
  fuelCostCents,
  hoursToday,
  isOpenAt,
  MapboxRoutingProvider,
  organizeByStore,
  orderStops,
  RoutingError,
  runComparison,
  SAMPLE_STORES,
  SampleRoutingProvider,
  SampleStoresPricingProvider,
  compareRequestSchema,
  comparisonResultSchema,
  type ShoppingSettings,
  type ShoppingStore,
  type StoreBasket,
  type TravelMatrix,
} from "./index";

const NOW = new Date("2026-11-02T15:00:00Z"); // Monday 9:00 am in Chicago
const fresh = new Date(NOW.getTime() - 10 * 60_000).toISOString();

function store(id: string, extra: Partial<ShoppingStore> = {}): ShoppingStore {
  return { key: `kroger:${id}`, provider: "kroger", storeId: id, retailer: "Kroger", name: `Store ${id}`, address: null, location: null, hours: null, isSample: false, ...extra };
}

type Price = number | { cents: number; sale?: number; out?: boolean; at?: string; status?: PricedLine["status"]; assumed?: boolean };
function basket(s: ShoppingStore, prices: Record<string, Price | null>): StoreBasket {
  const lines: PricedLine[] = Object.entries(prices).map(([id, p]) => {
    if (p === null)
      return { id, status: "unavailable", product: null, packages: null, regularCents: null, saleCents: null, lineTotalCents: null, assumedOnePackage: false, outOfStock: false, note: "No match at this store", observedAt: null };
    const o = typeof p === "number" ? { cents: p } : p;
    return {
      id,
      status: o.status ?? "verified",
      product: { id: `${s.storeId}-${id}`, name: id, brand: null, size: null },
      packages: 1,
      regularCents: o.cents,
      saleCents: o.sale ?? null,
      lineTotalCents: o.sale ?? o.cents,
      assumedOnePackage: o.assumed ?? false,
      outOfStock: o.out ?? false,
      note: null,
      observedAt: o.at ?? fresh,
    };
  });
  return { store: s, basket: summarize(s.provider, s.storeId, lines), error: null };
}

const settings = (over: Partial<ShoppingSettings> = {}): ShoppingSettings => ({ ...DEFAULT_SETTINGS, ...over });

/** Minutes and miles between start (0) and stores (1…n). */
function matrix(keys: string[], minutes: number[][], milesM: number[][]): TravelMatrix {
  return { provider: "test", isSample: false, observedAt: NOW.toISOString(), storeKeys: keys, seconds: minutes.map((r) => r.map((m) => m * 60)), meters: milesM.map((r) => r.map((m) => m * 1609.344)) };
}

const A = store("A0000001");
const B = store("B0000002");
const C = store("C0000003");
const items = ["milk", "eggs", "chicken", "rice"];

describe("basket totals and missing prices", () => {
  it("totals one store and lists what it can't price", () => {
    const r = compareStrategies({ itemIds: items, baskets: [basket(A, { milk: 300, eggs: 250, chicken: 800, rice: null }), basket(B, { milk: 310, eggs: 260, chicken: 820, rice: 200 })], settings: settings({ maxStops: 1 }), travel: null, start: null, now: NOW });
    const a = r.singles.find((p) => p.storeKeys[0] === A.key)!;
    assert.equal(a.groceryCents, 1350);
    assert.deepEqual(a.missingIds, ["rice"]);
    // B prices everything; A looks cheaper only because it leaves rice out — B ranks first.
    assert.equal(r.oneStore!.storeKeys[0], B.key);
  });

  it("counts savings only on items both trips price", () => {
    const r = compareStrategies({ itemIds: items, baskets: [basket(A, { milk: 300, eggs: 300, chicken: 900, rice: 200 }), basket(B, { milk: 200, eggs: 200, chicken: 500, rice: null })], settings: settings({ maxStops: 2 }), travel: null, start: null, now: NOW, baselineStoreKey: A.key });
    assert.deepEqual(r.bestDeals!.storeKeys.sort(), [A.key, B.key].sort());
    assert.equal(r.dealsVsOne!.comparableCount, 4);
    assert.equal(r.dealsVsOne!.grocerySavingsCents, 600);
    assert.match(r.recommendation.text, /saves \$6\.00 on groceries/);
    assert.match(r.recommendation.text, /Drive time and fuel aren't included/);
  });

  it("says when the cheaper-looking trip only wins by covering more items", () => {
    const r = compareStrategies({ itemIds: ["milk", "eggs", "chicken"], baskets: [basket(A, { milk: 300, eggs: 300, chicken: null }), basket(B, { milk: 400, eggs: 350, chicken: 900 })], settings: settings({ maxStops: 1 }), travel: null, start: null, now: NOW, baselineStoreKey: A.key });
    assert.equal(r.bestDeals!.storeKeys[0], B.key);
    assert.match(r.recommendation.text, /covers 1 more item than Store A0000001, but costs \$1\.50 more on the 2 items both price/);
    assert.match(r.recommendation.text, /not a definitive answer/);
  });

  it("refuses the same list item twice", () => {
    const req = { mode: "live", items: [{ id: "1", name: "milk", quantity: null }, { id: "1", name: "milk", quantity: null }], settings: DEFAULT_SETTINGS };
    assert.equal(compareRequestSchema.safeParse(req).success, false);
  });

  it("ignores out-of-stock, stale and estimated real prices", () => {
    const old = new Date(NOW.getTime() - 30 * 3_600_000).toISOString();
    const r = compareStrategies({ itemIds: ["milk", "eggs", "rice"], baskets: [basket(A, { milk: { cents: 100, out: true }, eggs: { cents: 100, at: old }, rice: { cents: 100, status: "estimated" } }), basket(B, { milk: 400, eggs: 400, rice: 400 })], settings: settings(), travel: null, start: null, now: NOW });
    const a = r.singles.find((p) => p.storeKeys[0] === A.key)!;
    assert.equal(a.pricedCount, 0);
    assert.equal(r.bestDeals!.storeKeys.join(), B.key);
  });

  it("says when there isn't enough data instead of naming a cheapest store", () => {
    const r = compareStrategies({ itemIds: items, baskets: [basket(A, { milk: 300, eggs: null, chicken: null, rice: null }), basket(B, { milk: 310, eggs: null, chicken: null, rice: null })], settings: settings(), travel: null, start: null, now: NOW });
    assert.equal(r.confidence, "insufficient");
    assert.equal(r.recommendation.strategy, null);
    assert.match(r.recommendation.text, /isn't enough to say/);
  });

  it("needs a second store to compare", () => {
    const r = compareStrategies({ itemIds: items, baskets: [basket(A, { milk: 1, eggs: 1, chicken: 1, rice: 1 }), { store: B, basket: null, error: "Kroger isn't responding" }], settings: settings(), travel: null, start: null, now: NOW });
    assert.match(r.recommendation.text, /Add another store/);
    assert.ok(r.limitations.some((l) => l.includes("Kroger isn't responding")));
  });
});

describe("promotions", () => {
  const sale = { milk: { cents: 400, sale: 200 }, eggs: 300 };
  it("doesn't count a sale price without the retailer's card", () => {
    const r = compareStrategies({ itemIds: ["milk", "eggs"], baskets: [basket(A, sale), basket(B, { milk: 350, eggs: 300 })], settings: settings(), travel: null, start: null, now: NOW });
    const a = r.singles.find((p) => p.storeKeys[0] === A.key)!;
    assert.equal(a.groceryCents, 700);
    assert.equal(a.saleNotCountedCents, 200);
    assert.equal(a.saleSavingsCents, 0);
    assert.ok(r.limitations.some((l) => /Kroger family loyalty card/.test(l)));
  });
  it("counts it once they say they have the card", () => {
    const r = compareStrategies({ itemIds: ["milk", "eggs"], baskets: [basket(A, sale), basket(B, { milk: 350, eggs: 300 })], settings: settings({ loyaltyRetailers: ["kroger"] }), travel: null, start: null, now: NOW });
    const a = r.singles.find((p) => p.storeKeys[0] === A.key)!;
    assert.equal(a.groceryCents, 500);
    assert.equal(a.saleSavingsCents, 200);
    assert.equal(r.oneStore!.storeKeys[0], A.key);
  });
  it("never counts digital coupons (no source) and says so", () => {
    const r = compareStrategies({ itemIds: ["milk"], baskets: [basket(A, { milk: 300 }), basket(B, { milk: 300 })], settings: settings({ digitalCoupons: true }), travel: null, start: null, now: NOW });
    assert.ok(r.limitations.some((l) => /Digital coupons aren't included/.test(l)));
  });
});

describe("travel and fuel", () => {
  it("works out fuel from the shopper's own price and mpg", () => {
    assert.equal(fuelCostCents(10 * 1609.344, { fuelCentsPerGallon: 350, milesPerGallon: 25 }), 140);
    assert.equal(fuelCostCents(10 * 1609.344, { fuelCentsPerGallon: null, milesPerGallon: 25 }), null);
  });
  it("orders stops by drive time and gives up on unroutable legs", () => {
    const m = matrix([A.key, B.key], [[0, 10, 5], [10, 0, 3], [5, 3, 0]], [[0, 5, 2], [5, 0, 1], [2, 1, 0]]);
    const r = orderStops([A.key, B.key], m, true)!;
    assert.deepEqual(r.order.length, 2);
    assert.equal(r.seconds, (5 + 3 + 10) * 60);
    const broken = { ...m, seconds: [[0, null, 5], [null, 0, 3], [5, 3, 0]] };
    assert.equal(orderStops([A.key, B.key], broken, true), null);
  });

  const start = { lat: 43, lng: -88 };
  const three = [basket(A, { milk: 400, eggs: 400, chicken: 1200, rice: 300 }), basket(B, { milk: 250, eggs: 260, chicken: 700, rice: 290 }), basket(C, { milk: 260, eggs: 200, chicken: 900, rice: 150 })];
  const m = matrix(
    [A.key, B.key, C.key],
    [
      [0, 5, 15, 20],
      [5, 0, 12, 18],
      [15, 12, 0, 6],
      [20, 18, 6, 0],
    ],
    [
      [0, 2, 8, 10],
      [2, 0, 7, 9],
      [8, 7, 0, 3],
      [10, 9, 3, 0],
    ],
  );

  it("nets fuel out of the savings and reports the extra time", () => {
    const r = compareStrategies({ itemIds: items, baskets: three, settings: settings({ maxStops: 3, fuelCentsPerGallon: 350, milesPerGallon: 25 }), travel: m, start, now: NOW, baselineStoreKey: A.key });
    const d = r.dealsVsOne!;
    assert.ok(r.bestDeals!.storeKeys.length >= 2);
    assert.equal(d.netSavingsCents, d.grocerySavingsCents - d.extraFuelCents!);
    assert.ok(d.extraMinutes! > 0);
    assert.match(r.recommendation.text, /could save \$[\d.]+ after estimated additional fuel costs, but would take about \d+ extra minutes/);
  });

  it("keeps to the stop limit", () => {
    const r = compareStrategies({ itemIds: items, baskets: three, settings: settings({ maxStops: 2, fuelCentsPerGallon: 350, milesPerGallon: 25 }), travel: m, start, now: NOW });
    assert.ok(r.bestDeals!.storeKeys.length <= 2);
  });

  it("keeps to the extra-time and distance limits", () => {
    const t = compareStrategies({ itemIds: items, baskets: three, settings: settings({ maxStops: 3, maxExtraMinutes: 5, fuelCentsPerGallon: 350, milesPerGallon: 25 }), travel: m, start, now: NOW, baselineStoreKey: A.key });
    const base = t.oneStore!.travel!.totalMinutes;
    assert.ok(t.bestDeals!.storeKeys.length === 1 || t.bestDeals!.travel!.totalMinutes - base <= 5);
    const d = compareStrategies({ itemIds: items, baskets: three, settings: settings({ maxStops: 3, maxDriveMiles: 5 }), travel: m, start, now: NOW });
    assert.equal(d.bestDeals!.storeKeys.length, 1);
  });

  it("leaves out excluded stores and stores outside the radius", () => {
    const far = store("D0000004", { location: { lat: 44, lng: -88 } }); // ~69 miles north
    const r = compareStrategies({ itemIds: items, baskets: [...three, basket(far, { milk: 1, eggs: 1, chicken: 1, rice: 1 })], settings: settings({ maxStops: 3, excludedStores: [C.key] }), travel: m, start, now: NOW });
    assert.ok(!r.stores.some((s) => s.key === C.key || s.key === far.key));
    assert.ok(r.limitations.some((l) => /More than 10 miles away/.test(l)));
  });

  it("weighs time for Best Overall Value", () => {
    const cheapTime = compareStrategies({ itemIds: items, baskets: three, settings: settings({ maxStops: 3, fuelCentsPerGallon: 350, milesPerGallon: 25, valueOfTimeCentsPerHour: 0 }), travel: m, start, now: NOW });
    const dearTime = compareStrategies({ itemIds: items, baskets: three, settings: settings({ maxStops: 3, fuelCentsPerGallon: 350, milesPerGallon: 25, valueOfTimeCentsPerHour: 20_000 }), travel: m, start, now: NOW });
    assert.ok(cheapTime.bestValue!.storeKeys.length >= dearTime.bestValue!.storeKeys.length);
    assert.equal(dearTime.bestValue!.storeKeys.length, 1);
  });

  it("has no Best Overall Value without drive times", () => {
    const r = compareStrategies({ itemIds: items, baskets: three, settings: settings({ maxStops: 3 }), travel: null, start: null, now: NOW });
    assert.equal(r.bestValue, null);
    assert.equal(r.travelAvailable, false);
  });
});

describe("store hours", () => {
  const hours = parseStoreHours({ timezone: "America/Chicago", Open24: false, monday: { open: "06:00", close: "22:00", open24: false }, sunday: { open24: true } })!;
  it("reads Kroger's hours", () => {
    assert.equal(hours.days.monday!.close, "22:00");
    assert.equal(hours.days.sunday!.open24, true);
    assert.equal(parseStoreHours(undefined), null);
  });
  it("checks opening times in the store's own time zone", () => {
    assert.equal(isOpenAt(hours, NOW), true); // 9:00 am Monday in Chicago
    assert.equal(isOpenAt(hours, new Date("2026-11-03T04:30:00Z")), false); // 10:30 pm Monday
    assert.equal(isOpenAt(hours, new Date("2026-11-04T15:00:00Z")), null); // Wednesday not given
    assert.equal(hoursToday(hours, NOW), "6:00 am–10:00 pm");
  });
});

describe("list by store", () => {
  it("groups by store then department, with unassigned items last", () => {
    const list = [
      { id: "1", name: "Milk", department: "dairy" as const },
      { id: "2", name: "Apples", department: "produce" as const },
      { id: "3", name: "Rice", department: "pantry" as const },
      { id: "4", name: "Foil", department: "household" as never },
    ];
    const s = organizeByStore(list, [A.key, B.key], new Map([["1", A.key], ["2", B.key], ["3", B.key]]));
    assert.equal(s.length, 3);
    assert.deepEqual(s[1]!.departments.map((d) => d.department), ["produce", "pantry"]);
    assert.equal(s[2]!.storeKey, null);
    assert.equal(s[2]!.count, 1);
  });
});

describe("sample stores (practice mode)", () => {
  it("runs end to end, labelled, and checks against the response schema", async () => {
    const needs = [
      { id: "11111111-1111-4111-8111-111111111111", name: "broccoli", quantity: { value: 1, unit: "lb" } },
      { id: "22222222-2222-4222-8222-222222222222", name: "chicken thighs", quantity: { value: 1.5, unit: "lb" } },
      { id: "33333333-3333-4333-8333-333333333333", name: "yellow onions", quantity: null },
      { id: "44444444-4444-4444-8444-444444444444", name: "rice", quantity: null },
      { id: "55555555-5555-4555-8555-555555555555", name: "heavy cream", quantity: null },
    ];
    const r = await runComparison({ pricing: new SampleStoresPricingProvider(() => NOW), stores: SAMPLE_STORES, needs, settings: settings({ maxStops: 3, fuelCentsPerGallon: 300 }), routing: new SampleRoutingProvider(() => NOW), start: { lat: 0, lng: 0 }, now: () => NOW });
    assert.equal(r.isSample, true);
    assert.ok(r.limitations[0]!.startsWith("Practice comparison"));
    assert.equal(r.travelAvailable, true);
    assert.equal(r.travelProvider, null);
    assert.ok(comparisonResultSchema.safeParse(r).success);
    // The produce market only stocks produce.
    const c = r.singles.find((p) => p.storeKeys[0] === "sample:store-c");
    assert.ok(!c || c.missingIds.includes("44444444-4444-4444-8444-444444444444"));
  });

  it("never mixes sample stores with real ones", () => {
    const r = compareStrategies({ itemIds: ["milk"], baskets: [basket(SAMPLE_STORES[0]!, { milk: 100 }), basket(A, { milk: 50 })], settings: settings(), travel: null, start: null, now: NOW });
    assert.ok(r.stores.every((s) => s.isSample));
    assert.ok(r.limitations.some((l) => /aren't compared together/.test(l)));
  });

  it("refuses to route real stores with sample drive times", async () => {
    await assert.rejects(new SampleRoutingProvider().matrix({ lat: 0, lng: 0 }, [{ key: A.key, location: { lat: 1, lng: 1 } }]), RoutingError);
  });
});

describe("Mapbox adapter", () => {
  const ok = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it("asks for durations and distances, longitude first", async () => {
    let seen = "";
    const fetchSpy = (async (url: string) => {
      seen = url;
      return new Response(JSON.stringify({ code: "Ok", durations: [[0, 60], [60, 0]], distances: [[0, 1000], [1000, 0]] }));
    }) as unknown as typeof fetch;
    const p = new MapboxRoutingProvider({ accessToken: "tok", fetch: fetchSpy });
    const m = await p.matrix({ lat: 43.123456, lng: -88.654321 }, [{ key: A.key, location: { lat: 43.2, lng: -88.7 } }]);
    assert.match(seen, /\/directions-matrix\/v1\/mapbox\/driving\/-88\.65432,43\.12346;-88\.7,43\.2\?annotations=duration,distance&access_token=tok$/);
    assert.deepEqual(m.storeKeys, [A.key]);
    assert.equal(m.meters[0]![1], 1000);
  });
  it("maps errors and rejects odd answers", async () => {
    await assert.rejects(new MapboxRoutingProvider({ accessToken: "t", fetch: ok({ message: "no" }, 401) }).matrix({ lat: 1, lng: 1 }, [{ key: A.key, location: { lat: 1, lng: 2 } }]), (e: RoutingError) => e.kind === "auth");
    await assert.rejects(new MapboxRoutingProvider({ accessToken: "t", fetch: ok({ code: "NoRoute" }) }).matrix({ lat: 1, lng: 1 }, [{ key: A.key, location: { lat: 1, lng: 2 } }]), (e: RoutingError) => e.kind === "no_route");
    await assert.rejects(new MapboxRoutingProvider({ accessToken: "t", fetch: ok({ code: "Ok", durations: [[0]], distances: [[0]] }) }).matrix({ lat: 1, lng: 1 }, [{ key: A.key, location: { lat: 1, lng: 2 } }]), RoutingError);
    assert.throws(() => new MapboxRoutingProvider({ accessToken: "" }), RoutingError);
  });
  it("geocodes once, without asking to store the result", async () => {
    let seen = "";
    const fetchSpy = (async (url: string) => {
      seen = url;
      return new Response(JSON.stringify({ features: [{ geometry: { coordinates: [-88.1, 43.1] } }] }));
    }) as unknown as typeof fetch;
    const p = await new MapboxRoutingProvider({ accessToken: "t", fetch: fetchSpy }).geocode("123 Main St; Oak Creek WI");
    assert.deepEqual(p, { lng: -88.1, lat: 43.1 });
    assert.ok(!seen.includes("permanent=true"));
    assert.ok(!decodeURIComponent(seen).includes(";"));
  });
});

describe("request validation", () => {
  it("bounds what a client can ask for", () => {
    const base = { mode: "live", items: [{ id: "1", name: "milk", quantity: null }], settings: DEFAULT_SETTINGS };
    assert.ok(compareRequestSchema.safeParse(base).success);
    assert.ok(!compareRequestSchema.safeParse({ ...base, storeIds: Array(7).fill("01400376") }).success);
    assert.ok(!compareRequestSchema.safeParse({ ...base, settings: { ...DEFAULT_SETTINGS, maxStops: 5 } }).success);
    assert.ok(!compareRequestSchema.safeParse({ ...base, prices: [] }).success);
    assert.ok(!compareRequestSchema.safeParse({ ...base, start: { kind: "point", lat: 200, lng: 0 } }).success);
  });
});
