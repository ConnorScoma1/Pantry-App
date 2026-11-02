import Ionicons from "@expo/vector-icons/Ionicons";
import { formatCents } from "@kitchen-pantry/grocery-pricing";
import { hoursToday, miles, type SavedShopping, type StrategyComparison, type StrategyId, type TripPlan } from "@kitchen-pantry/shopping-optimizer";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Field, Input, Notice, Segmented, Toggle } from "@/components/controls";
import { Body, Card, Eyebrow, Screen } from "@/components/ui";
import { useGrocery } from "@/lib/use-grocery";
import { useShopping, type Comparison } from "@/lib/use-shopping";
import { useThemeColors } from "@/lib/theme";

const money = (c: number) => formatCents(c);
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

/** One Store vs. Best Deals (spec 03) on the phone. */
export default function CompareScreen() {
  const grocery = useGrocery();
  const shop = useShopping(grocery.items);
  const toBuy = grocery.items.filter((i) => !i.checked).length;
  const r = shop.result;
  const live = shop.status?.livePrices ?? false;
  const canChoose = r ? !r.isSample || shop.mode === "preview" : false;

  const choose = async (strategy: StrategyId, plan: TripPlan) => {
    const res = await shop.choose(strategy, plan);
    if (res.ok) router.replace("/grocery?view=stores");
  };
  const same = (a: TripPlan | null, b: TripPlan | null) => Boolean(a && b && a.storeKeys.join() === b.storeKeys.join());

  return (
    <Screen title="One store or best deals?" subtitle="Compare your list across nearby stores — groceries, fuel and your time.">
      {shop.status && !live ? (
        <Notice tone="warning">Practice comparison: three made-up sample stores, sample prices and sample drive times — not real ones. Real stores appear once store prices are connected.</Notice>
      ) : null}
      {live ? (
        <Segmented
          options={[
            { value: "live", label: "Real stores" },
            { value: "practice", label: "Practice" },
          ]}
          value={shop.practice ? "practice" : "live"}
          onChange={(v) => shop.setPractice(v === "practice")}
        />
      ) : null}

      {!r ? <Settings shop={shop} /> : null}

      <Button
        size="lg"
        icon="git-compare-outline"
        label={shop.busy === "compare" ? "Comparing…" : r ? "Compare again" : `Compare ${toBuy} items`}
        disabled={!shop.loaded || shop.busy === "compare" || toBuy === 0 || (!shop.practice && shop.saved.compareStoreIds.length === 0)}
        onPress={() => void shop.compare()}
      />
      {shop.error ? <Notice tone="error">{shop.error}</Notice> : null}

      {r ? (
        <>
          <Card>
            <View className="flex-row items-center justify-between">
              <Eyebrow>Recommendation</Eyebrow>
              <Text className="text-[13px] font-semibold text-price-estimated">
                {r.isSample ? "Sample data" : r.confidence === "complete" ? "Complete prices" : r.confidence === "partial" ? "Partial data" : "Not enough data"}
              </Text>
            </View>
            <Text accessibilityLiveRegion="polite" className="mt-2 text-[19px] font-semibold leading-7 text-foreground">
              {r.recommendation.text}
            </Text>
            {shop.advice ? (
              <View className="mt-3 rounded-2xl bg-background p-4">
                <Text className="text-[13px] font-semibold uppercase tracking-widest text-muted">{shop.advice.source === "ai" ? "AI advisor" : "In short"}</Text>
                <Text className="mt-1 text-[16px] leading-6 text-foreground">{shop.advice.summary}</Text>
                {shop.advice.tips.map((t) => (
                  <Text key={t} className="mt-1 text-[15px] text-muted">
                    • {t}
                  </Text>
                ))}
                {shop.advice.notice ? <Text className="mt-2 text-[14px] text-muted">{shop.advice.notice}</Text> : null}
              </View>
            ) : shop.status?.advisor && r.adviceToken ? (
              <View className="mt-3">
                <Button variant="secondary" icon="sparkles-outline" label={shop.busy === "advice" ? "Thinking…" : "Explain this"} disabled={shop.busy === "advice"} onPress={() => void shop.explain()} />
              </View>
            ) : null}
            <Text className="mt-3 text-[13px] text-subtle">
              {r.isSample ? "Sample prices and drive times." : "Prices from Kroger."} {r.travelProvider ? `Drive times from ${r.travelProvider}.` : ""} Tax and fees aren&apos;t included.
            </Text>
            {r.routingNote ? <Text className="mt-2 text-[14px] text-muted">{r.routingNote}</Text> : null}
          </Card>

          <Table r={r} />

          {r.oneStore ? <Plan title="One store" id="one_store" plan={r.oneStore} r={r} canChoose={canChoose} busy={shop.busy === "trip"} onChoose={choose} names={shop.itemNames} /> : null}
          {r.bestDeals && !same(r.bestDeals, r.oneStore) ? <Plan title="Best deals" id="best_deals" plan={r.bestDeals} r={r} canChoose={canChoose} busy={shop.busy === "trip"} onChoose={choose} names={shop.itemNames} /> : null}
          {r.bestValue && !same(r.bestValue, r.bestDeals) && !same(r.bestValue, r.oneStore) ? (
            <Plan title="Best overall value" id="best_value" plan={r.bestValue} r={r} canChoose={canChoose} busy={shop.busy === "trip"} onChoose={choose} names={shop.itemNames} />
          ) : null}
          {r.isSample && shop.mode !== "preview" ? <Body>Practice plans can&apos;t organise your real list. Compare real stores to do that.</Body> : null}

          {r.limitations.length ? (
            <Card>
              <Eyebrow>What this doesn&apos;t include</Eyebrow>
              {r.limitations.map((l) => (
                <Text key={l} className="mt-1.5 text-[15px] leading-5 text-muted">
                  • {l}
                </Text>
              ))}
            </Card>
          ) : null}
          <Settings shop={shop} />
        </>
      ) : null}
    </Screen>
  );
}

type Shop = ReturnType<typeof useShopping>;

function Table({ r }: { r: Comparison }) {
  const cols: Array<{ label: string; plan: TripPlan; vs: StrategyComparison | null }> = [];
  if (r.oneStore) cols.push({ label: "One store", plan: r.oneStore, vs: null });
  if (r.bestDeals && r.bestDeals.storeKeys.join() !== r.oneStore?.storeKeys.join()) cols.push({ label: "Best deals", plan: r.bestDeals, vs: r.dealsVsOne });
  if (r.bestValue && !cols.some((c) => c.plan.storeKeys.join() === r.bestValue!.storeKeys.join())) cols.push({ label: "Best value", plan: r.bestValue, vs: r.valueVsOne });
  if (!cols.length) return null;
  const rows: Array<[string, (c: (typeof cols)[number]) => string]> = [
    ["Grocery total", (c) => money(c.plan.groceryCents)],
    ["Items priced", (c) => `${c.plan.pricedCount} of ${c.plan.itemCount}`],
    ["Stores", (c) => String(c.plan.storeKeys.length)],
    ["Drive time", (c) => (c.plan.travel ? mins(Math.round(c.plan.travel.driveSeconds / 60)) : "—")],
    ["Fuel", (c) => (c.plan.travel?.fuelCents != null ? money(c.plan.travel.fuelCents) : "—")],
    ["Groceries + fuel", (c) => (c.plan.cashCents !== null ? money(c.plan.cashCents) : "—")],
    ["Cash savings", (c) => (c.vs ? `${money(Math.abs(c.vs.netSavingsCents ?? c.vs.grocerySavingsCents))}${(c.vs.netSavingsCents ?? c.vs.grocerySavingsCents) < 0 ? " more" : ""}${c.vs.netSavingsCents === null ? " (before fuel)" : ""}` : "—")],
    ["Extra time", (c) => (c.vs?.extraMinutes != null && c.vs.extraMinutes > 0 ? `+${mins(c.vs.extraMinutes)}` : "—")],
  ];
  return (
    <View className="rounded-card bg-surface px-4 py-2">
      <View className="flex-row border-b border-border py-2">
        <View className="flex-1" />
        {cols.map((c) => (
          <Text key={c.label} className="w-[29%] text-right text-[12px] font-semibold uppercase tracking-wider text-muted">
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map(([label, f]) => (
        <View key={label} className="flex-row items-center border-b border-border py-2.5 last:border-b-0">
          <Text className="flex-1 text-[15px] font-medium text-foreground">{label}</Text>
          {cols.map((c) => (
            <Text key={c.label} className="w-[29%] text-right text-[15px] text-foreground" style={{ fontVariant: ["tabular-nums"] }}>
              {f(c)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Plan({ title, id, plan, r, canChoose, busy, onChoose, names }: { title: string; id: StrategyId; plan: TripPlan; r: Comparison; canChoose: boolean; busy: boolean; onChoose: (s: StrategyId, p: TripPlan) => void; names: Map<string, string> }) {
  const recommended = r.recommendation.strategy === id;
  return (
    <View className={`rounded-card bg-surface p-5 ${recommended ? "border-2 border-foreground" : ""}`}>
      <View className="flex-row items-center justify-between">
        <Eyebrow>{title}</Eyebrow>
        {recommended ? <Text className="rounded-full bg-foreground px-2.5 py-0.5 text-[12px] font-semibold text-background">Recommended</Text> : null}
      </View>
      <Text className="mt-1 text-[28px] font-bold text-foreground">{money(plan.groceryCents)}</Text>
      <Text className="text-[14px] text-muted">
        {plan.storeKeys.length === 1 ? "1 store" : `${plan.storeKeys.length} stores`}
        {plan.travel ? ` · ${mins(plan.travel.totalMinutes)} with driving · ${miles(plan.travel.meters).toFixed(1)} mi` : ""}
      </Text>
      {plan.stops.map((s, i) => {
        const store = r.stores.find((x) => x.key === s.storeKey);
        const hours = store ? hoursToday(store.hours, new Date()) : null;
        return (
          <View key={s.storeKey} className="mt-2 rounded-2xl bg-background px-4 py-3">
            <View className="flex-row justify-between gap-2">
              <Text className="flex-1 font-semibold text-foreground">
                {plan.stops.length > 1 ? `${i + 1}. ` : ""}
                {store?.name ?? "Store"}
              </Text>
              <Text className="text-foreground">{money(s.subtotalCents)}</Text>
            </View>
            <Text className="text-[13px] text-muted">
              {s.itemIds.length} item{s.itemIds.length === 1 ? "" : "s"}
              {hours ? ` · ${hours}` : ""}
            </Text>
            {s.arrivalNote ? <Text className="mt-1 text-[13px] font-medium text-danger">{s.arrivalNote}</Text> : null}
            {plan.stops.length > 1 ? (
              <Text numberOfLines={2} className="mt-1 text-[13px] text-subtle">
                {s.itemIds.map((x) => names.get(x) ?? "item").join(", ")}
              </Text>
            ) : null}
          </View>
        );
      })}
      {plan.missingIds.length ? <Text className="mt-2 text-[14px] text-muted">Not priced here: {plan.missingIds.slice(0, 5).map((x) => names.get(x) ?? "item").join(", ")}</Text> : null}
      {plan.saleNotCountedCents > 0 ? <Text className="mt-2 text-[14px] text-muted">{money(plan.saleNotCountedCents)} in sale prices not counted — they may need a loyalty card.</Text> : null}
      {canChoose ? (
        <View className="mt-3">
          <Button variant={recommended ? "primary" : "secondary"} disabled={busy} label={plan.storeKeys.length === 1 ? "Shop here" : "Split my list this way"} onPress={() => onChoose(id, plan)} />
        </View>
      ) : null}
    </View>
  );
}

function NumberInput({ label, value, onCommit, hint, placeholder }: { label: string; value: number | null; onCommit: (v: number | null) => void; hint?: string; placeholder?: string }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);
  return (
    <Field label={label} hint={hint}>
      <Input
        accessibilityLabel={label}
        keyboardType="decimal-pad"
        value={text}
        placeholder={placeholder}
        onChangeText={(t) => setText(t.replace(/[^\d.]/g, ""))}
        onEndEditing={() => {
          const t = text.trim();
          if (t === "") return onCommit(null);
          const n = Number(t);
          if (Number.isFinite(n)) onCommit(n);
        }}
      />
    </Field>
  );
}

function Settings({ shop }: { shop: Shop }) {
  const c = useThemeColors();
  const s = shop.saved.settings;
  const set = (patch: Partial<SavedShopping["settings"]>) => void shop.save({ ...shop.saved, settings: { ...s, ...patch } });
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const [address, setAddress] = useState(shop.saved.startAddress ?? "");
  useEffect(() => setAddress(shop.saved.startAddress ?? ""), [shop.saved.startAddress]);
  const card = shop.practice ? { key: "sample discount", label: "I have a Sample Discount card" } : { key: "kroger", label: "I have a Kroger family loyalty card" };
  const ids = shop.saved.compareStoreIds;
  const list = useMemo(() => shop.nearby ?? ids.map((id) => ({ locationId: id, name: shop.result?.stores.find((x) => x.storeId === id)?.name ?? `Store ${id}`, address: "", city: "" })), [shop.nearby, ids, shop.result]);

  return (
    <>
      {!shop.practice ? (
        <Card>
          <Eyebrow>Stores to compare</Eyebrow>
          <Body>Kroger-family stores with live prices (up to 6). Tap the star for stores you prefer.</Body>
          {list.map((st) => {
            const on = ids.includes(st.locationId);
            const key = `kroger:${st.locationId}`;
            const preferred = s.preferredStores.includes(key);
            return (
              <View key={st.locationId} className="mt-2 flex-row items-center gap-2 rounded-2xl bg-background px-3 py-2">
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => void shop.save({ ...shop.saved, compareStoreIds: on ? ids.filter((x) => x !== st.locationId) : ids.length >= 6 ? ids : [...ids, st.locationId] })}
                  className="min-h-11 flex-1 flex-row items-center gap-3"
                >
                  <Ionicons name={on ? "checkbox" : "square-outline"} size={24} color={c.foreground} />
                  <View className="flex-1">
                    <Text className="font-medium text-foreground">{st.name}</Text>
                    {st.address ? <Text className="text-[13px] text-muted">{[st.address, st.city].filter(Boolean).join(", ")}</Text> : null}
                    {shop.usualStoreKey === key ? <Text className="text-[12px] font-semibold text-muted">Your usual store</Text> : null}
                  </View>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Prefer ${st.name}`} accessibilityState={{ selected: preferred }} onPress={() => set({ preferredStores: preferred ? s.preferredStores.filter((k) => k !== key) : [...s.preferredStores, key].slice(0, 10) })} className="size-11 items-center justify-center">
                  <Ionicons name={preferred ? "star" : "star-outline"} size={22} color={c.foreground} />
                </Pressable>
              </View>
            );
          })}
          <View className="mt-3">
            <Button variant="secondary" icon="location-outline" label={shop.busy === "stores" ? "Finding…" : "Find stores near me"} disabled={shop.busy === "stores"} onPress={() => void shop.findNearby()} />
          </View>
        </Card>
      ) : (
        <Card>
          <Eyebrow>Sample stores</Eyebrow>
          <Body>Sample Supermarket A (sales open to everyone), Sample Discount B (cheaper, card-only sales) and Sample Produce Market C (produce only). Nothing here is real.</Body>
        </Card>
      )}

      <Card>
        <Eyebrow>Your trip</Eyebrow>
        <View className="mt-3 gap-4">
          <Field label="Most stores to visit">
            <Segmented options={[{ value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }]} value={String(s.maxStops)} onChange={(v) => set({ maxStops: Number(v) as 1 | 2 | 3 | 4 })} />
          </Field>
          {!shop.practice ? (
            <Field label="Starting from" hint={shop.status?.routing ? "Used only for drive times; saved for you alone." : "Drive times need a routing service on the server."}>
              <Input
                accessibilityLabel="Starting from"
                value={address}
                maxLength={200}
                placeholder="Home address or ZIP"
                onChangeText={setAddress}
                onEndEditing={() => {
                  const t = address.trim();
                  if (t.length === 0 || t.length >= 3) void shop.save({ ...shop.saved, startAddress: t || null });
                }}
              />
            </Field>
          ) : null}
          <Toggle label="Include the drive home" value={s.returnHome} onChange={(v) => set({ returnHome: v })} />
          <NumberInput label="Fuel price ($ per gallon)" value={s.fuelCentsPerGallon === null ? null : s.fuelCentsPerGallon / 100} placeholder="e.g. 3.29" hint="What you pay — we don't guess." onCommit={(v) => set({ fuelCentsPerGallon: v === null ? null : Math.round(clamp(v, 0.5, 20) * 100) })} />
          <NumberInput label="Your car (mpg)" value={s.milesPerGallon} onCommit={(v) => set({ milesPerGallon: v === null ? null : clamp(v, 5, 150) })} />
          <NumberInput label="Your time is worth ($ per hour)" value={s.valueOfTimeCentsPerHour / 100} hint="Used for Best overall value. 0 ignores time." onCommit={(v) => set({ valueOfTimeCentsPerHour: Math.round(clamp(v ?? 0, 0, 500) * 100) })} />
          <NumberInput label="Minutes in each store" value={s.minutesPerStop} hint="Your estimate for parking and checkout." onCommit={(v) => set({ minutesPerStop: Math.round(clamp(v ?? 0, 0, 90)) })} />
          <NumberInput label="Most extra minutes" value={s.maxExtraMinutes} placeholder="No limit" onCommit={(v) => set({ maxExtraMinutes: v === null ? null : Math.round(clamp(v, 0, 240)) })} />
          <Toggle label={card.label} description="Sale prices count only with the card." value={s.loyaltyRetailers.includes(card.key)} onChange={(v) => set({ loyaltyRetailers: v ? [...new Set([...s.loyaltyRetailers, card.key])] : s.loyaltyRetailers.filter((x) => x !== card.key) })} />
          <Text className="text-[13px] text-subtle">Your settings are yours alone — other household members don&apos;t see them.</Text>
        </View>
      </Card>
    </>
  );
}
