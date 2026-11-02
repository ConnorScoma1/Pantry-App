import Ionicons from "@expo/vector-icons/Ionicons";
import { formatCents } from "@kitchen-pantry/grocery-pricing";
import { viewSpecials, type ShownSpecial, type SpecialsSort } from "@kitchen-pantry/meal-planner";
import { groceryDepartments, labelFor, type GroceryDepartment } from "@kitchen-pantry/shared-types";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Button, Chip, ChipRow, Input, Notice, Segmented, Toggle } from "@/components/controls";
import { Body, Card, CardTitle, Eyebrow, Screen } from "@/components/ui";
import { useThemeColors } from "@/lib/theme";
import { useSpecials } from "@/lib/use-specials";

const DISCOUNTS = [
  { value: "0", label: "Any" },
  { value: "20", label: "20%+" },
  { value: "33", label: "33%+" },
  { value: "50", label: "50%+" },
] as const;
const SORTS: ReadonlyArray<{ value: SpecialsSort; label: string }> = [
  { value: "relevant", label: "For you" },
  { value: "discount", label: "Most off" },
  { value: "unit_price", label: "Unit price" },
];
const unitLabel = (cents: number, per: string) => (cents < 100 ? `${cents}¢/${per}` : `${formatCents(cents)}/${per}`);
const dayFmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Specials tab: sale prices at the household's store (Kroger API), filtered for this household. */
export default function SpecialsScreen() {
  const s = useSpecials();
  const [department, setDepartment] = useState<GroceryDepartment | null>(null);
  const [discount, setDiscount] = useState<(typeof DISCOUNTS)[number]["value"]>("0");
  const [sort, setSort] = useState<SpecialsSort>("relevant");
  const [fitsDiet, setFitsDiet] = useState(true);
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());

  const view = useMemo(
    () =>
      s.result
        ? viewSpecials(s.result.specials, { profile: s.profile, listNames: s.listNames, seasonal: s.seasonal }, { department, minPercentOff: Number(discount), fitsDiet, query, sort })
        : null,
    [s.result, s.profile, s.listNames, s.seasonal, department, discount, fitsDiet, query, sort],
  );

  const blocked =
    s.blocker === "preview"
      ? "Sign in to see specials — they come from the Kitchen Pantry server, which keeps the store connection private."
      : s.blocker === "no_server"
        ? "Specials need the Kitchen Pantry web server (EXPO_PUBLIC_API_URL) — see the README."
        : s.blocker === "not_connected"
          ? "Specials need a store price connection on the server (Kroger API keys). We never make up a sale."
          : null;

  return (
    <Screen title="Specials" subtitle={s.store ? `Sale prices at ${s.store.name}.` : "Sale prices at your store."}>
      {s.choices.length > 1 ? (
        <View>
          <Text className="mb-1.5 text-[15px] font-semibold text-foreground">Stores on your trip</Text>
          <Segmented options={s.choices.map((c) => ({ value: c.storeId, label: c.name }))} value={s.store?.storeId ?? ""} onChange={(v) => s.pick(v)} />
        </View>
      ) : null}
      {s.blocker === null && s.store && !s.hasTrip ? (
        <Pressable accessibilityRole="button" onPress={() => router.push("/compare")} className="rounded-2xl bg-surface px-4 py-3 active:opacity-80">
          <Text className="text-[15px] text-foreground">
            <Text className="font-semibold">Worth a second stop?</Text> <Text className="text-muted">Compare your whole list across nearby stores →</Text>
          </Text>
        </Pressable>
      ) : null}
      {s.blocker === "checking" ? (
        <Body>Checking your store…</Body>
      ) : blocked ? (
        <Card>
          <Eyebrow>Not available here yet</Eyebrow>
          <Body>{blocked}</Body>
        </Card>
      ) : !s.store ? (
        <Card>
          <Eyebrow>Choose your store</Eyebrow>
          <CardTitle>Which store do you shop at?</CardTitle>
          <Body>Pick a Kroger-family store on the Grocery tab and its sale prices show up here.</Body>
          <View className="mt-3">
            <Button variant="secondary" icon="cart-outline" label="Choose a store" onPress={() => router.navigate("/grocery")} />
          </View>
        </Card>
      ) : (
        <>
          <Input value={query} onChangeText={setQuery} placeholder="Search specials" accessibilityLabel="Search specials" returnKeyType="search" />
          <ChipRow>
            <Chip label="All" selected={department === null} onPress={() => setDepartment(null)} />
            {groceryDepartments
              .filter((d) => view?.departments.some((x) => x.code === d.code))
              .map((d) => (
                <Chip
                  key={d.code}
                  label={`${d.label} ${view?.departments.find((x) => x.code === d.code)?.count ?? ""}`}
                  selected={department === d.code}
                  onPress={() => setDepartment(department === d.code ? null : d.code)}
                />
              ))}
          </ChipRow>
          <Segmented value={discount} onChange={setDiscount} options={DISCOUNTS} />
          <Segmented value={sort} onChange={setSort} options={SORTS} />
          <Toggle label="Fits our diet" description={view && view.hiddenForDiet > 0 ? `${view.hiddenForDiet} hidden` : undefined} value={fitsDiet} onChange={setFitsDiet} />
          <Button variant="secondary" icon="refresh" label={s.busy ? "Checking…" : "Refresh"} disabled={s.busy} onPress={() => void s.refresh()} />

          {s.error ? <Notice tone="error">{s.error}</Notice> : null}
          {s.result?.warning && s.result.failed > 0 ? (
            <Notice tone="warning">
              {s.result.warning} {s.result.failed} of {s.result.checked} items couldn&apos;t be checked.
            </Notice>
          ) : null}
          {s.busy && !s.result ? <Body>Checking sale prices…</Body> : null}

          {view && view.shown.length > 0
            ? view.shown.map((x) => (
                <SpecialCard
                  key={x.special.id}
                  x={x}
                  added={added.has(x.special.id)}
                  onAdd={async () => {
                    const r = await s.addToList(x.special);
                    if (r.ok) setAdded((cur) => new Set(cur).add(x.special.id));
                  }}
                />
              ))
            : s.result ? (
                <Card>
                  <CardTitle>{s.result.specials.length === 0 ? "Nothing we checked is on sale right now" : "No specials match these filters"}</CardTitle>
                  <Body>{s.result.specials.length === 0 ? "Stores change sale prices through the week — try again later." : "Try another department or a smaller discount."}</Body>
                </Card>
              ) : null}

          {s.result ? (
            <Card>
              <Eyebrow>Where these come from</Eyebrow>
              <Body>
                {s.store.name}&apos;s own prices from the Kroger API, for {s.result.checked} items (your list, this season&apos;s produce, everyday staples). Only sale prices
                below regular are shown. It isn&apos;t the full weekly ad: buy-one-get-one, digital coupons and loyalty-card details aren&apos;t in this source.
                &ldquo;Fits our diet&rdquo; reads product names only — always check the label.
              </Body>
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function SpecialCard({ x, added, onAdd }: { x: ShownSpecial; added: boolean; onAdd: () => Promise<void> }) {
  const c = useThemeColors();
  const sp = x.special;
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Text className="text-[12px] font-semibold uppercase tracking-widest text-muted">{labelFor(groceryDepartments, sp.department)}</Text>
        {x.onList ? <Badge text="On your list" /> : null}
        {x.inSeason ? <Badge text="In season" /> : null}
        {sp.availability === "limited" ? <Badge text="Low stock" warning /> : null}
      </View>
      <Text className="mt-1.5 text-[17px] font-semibold text-foreground">{sp.name}</Text>
      {sp.brand || sp.sizeLabel ? <Text className="text-[14px] text-muted">{[sp.brand, sp.sizeLabel].filter(Boolean).join(" · ")}</Text> : null}
      <View className="mt-2 flex-row items-baseline gap-2">
        <Text className="text-2xl font-bold text-accent">
          {formatCents(sp.saleCents)}
          {sp.soldByWeight ? "/lb" : ""}
        </Text>
        <Text className="text-[15px] text-muted line-through">{formatCents(sp.regularCents)}</Text>
      </View>
      <Text className="text-[14px] font-medium text-foreground">
        Save {formatCents(sp.regularCents - sp.saleCents)} ({sp.percentOff}% off)
      </Text>
      {sp.unitPrice && !sp.soldByWeight && sp.unitPrice.saleCents !== sp.saleCents ? (
        <Text className="text-[14px] text-muted">
          {unitLabel(sp.unitPrice.saleCents, sp.unitPrice.per)} <Text className="line-through">{unitLabel(sp.unitPrice.regularCents, sp.unitPrice.per)}</Text>
        </Text>
      ) : null}
      <Text className="mt-1 text-[13px] text-muted">
        {sp.endsOn ? `Ends ${dayFmt(sp.endsOn)}` : "End date not given by the store"}
        {sp.requiresMembership === null ? " · Card or coupon not stated" : sp.requiresMembership ? " · Needs the store card" : ""}
      </Text>
      {x.conflicts.length > 0 ? <Text className="mt-1 text-[13px] text-warning">{x.conflicts.join(" · ")}</Text> : null}
      <View className="mt-3 flex-row flex-wrap items-center gap-3">
        {x.onList ? (
          <View className="min-h-10 flex-row items-center gap-1.5">
            <Ionicons name="checkmark" size={16} color={c.muted} />
            <Text className="text-[14px] font-medium text-muted">On your list</Text>
          </View>
        ) : (
          <Button
            variant="secondary"
            icon={added ? "checkmark" : "add"}
            label={added ? "Added" : "Add to list"}
            disabled={busy || added}
            onPress={async () => {
              setBusy(true);
              await onAdd();
              setBusy(false);
            }}
          />
        )}
        {sp.sourceUrl ? (
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(sp.sourceUrl!)} className="min-h-10 justify-center">
            <Text className="text-[15px] font-semibold text-accent">View at store ↗</Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

function Badge({ text, warning = false }: { text: string; warning?: boolean }) {
  return (
    <View className={`rounded-full px-2 py-0.5 ${warning ? "bg-warning/15" : "bg-accent-soft"}`}>
      <Text className={`text-[12px] font-semibold ${warning ? "text-warning" : "text-accent"}`}>{text}</Text>
    </View>
  );
}
