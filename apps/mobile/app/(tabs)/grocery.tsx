import Ionicons from "@expo/vector-icons/Ionicons";
import { groupGroceryItems, personName, toPlanLines } from "@kitchen-pantry/database";
import { formatCents, type PricedLine } from "@kitchen-pantry/grocery-pricing";
import { addDays, buildGroceryList, departmentFor, nightsLeft, startOfWeek } from "@kitchen-pantry/meal-planner";
import { groceryDepartments, priceStatuses, type GroceryDepartment, type GroceryItem } from "@kitchen-pantry/shared-types";
import { organizeByStore } from "@kitchen-pantry/shopping-optimizer";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Button, Field, Input, Notice, Segmented } from "@/components/controls";
import { Sheet } from "@/components/kitchen/sheet";
import { Body, Card, CardTitle, Eyebrow, Screen } from "@/components/ui";
import { useGrocery, type SyncState } from "@/lib/use-grocery";
import { useHousehold } from "@/lib/use-household";
import { todayIso } from "@/lib/use-kitchen";
import { useMealPlan } from "@/lib/use-meal-plan";
import { usePricing } from "@/lib/use-pricing";
import { useActiveTrip } from "@/lib/use-shopping";
import { useThemeColors } from "@/lib/theme";
import { useProfile } from "@/lib/app-state";

const tone: Record<string, string> = {
  verified: "text-price-verified",
  cached: "text-price-cached",
  estimated: "text-price-estimated",
  unavailable: "text-muted",
};

export default function GroceryScreen() {
  const grocery = useGrocery();
  const household = useHousehold();
  const pricing = usePricing(grocery.items);
  const [editing, setEditing] = useState<GroceryItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const others = household.members.filter((m) => !m.isYou);
  const groups = useMemo(() => groupGroceryItems(grocery.items), [grocery.items]);
  const you = household.you?.userId ?? null;
  const trip = useActiveTrip();
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<"aisle" | "stores">(params.view === "stores" ? "stores" : "aisle");
  useEffect(() => {
    if (params.view === "stores") {
      setView("stores");
      void trip.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.view]);
  const byStore = useMemo(
    () => (trip.trip ? organizeByStore(grocery.items, trip.trip.stops.map((s) => s.storeKey), new Map(Object.entries(trip.trip.assignment))) : []),
    [grocery.items, trip.trip],
  );
  const showStores = view === "stores" && trip.trip !== null;
  const row = (item: GroceryItem) => (
    <Row
      key={item.id}
      item={item}
      shared={others.length > 0}
      addedBy={personName(item.addedBy, household.names, you)}
      price={showStores ? null : (pricing.lines.get(item.id) ?? null)}
      checkedBy={personName(item.checkedBy, household.names, you)}
      onToggle={async () => {
        const r = await grocery.toggle(item);
        if (!r.ok) setMessage(r.message);
      }}
      onEdit={() => setEditing(item)}
    />
  );

  return (
    <Screen
      title="Grocery List"
      subtitle={others.length > 0 ? `Shared with ${others.map((m) => m.displayName).join(", ")}` : "Everything for the week, by aisle."}
    >
      <SyncBadge state={grocery.sync} />
      <AddItem onAdd={grocery.add} disabled={grocery.loading || !grocery.listId} />
      {grocery.error ? <Notice tone="error">{grocery.error}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}
      {grocery.stats.left > 0 ? <Button icon="cart-outline" label="Build my cart" onPress={() => router.push("/cart")} /> : null}

      {grocery.loading ? (
        <ActivityIndicator accessibilityLabel="Loading" />
      ) : grocery.items.length === 0 ? (
        <Card>
          <CardTitle>Your list is empty</CardTitle>
          <Body>Add things as you think of them, or bring in what this week&apos;s dinners need below.</Body>
        </Card>
      ) : (
        <View className="overflow-hidden rounded-card bg-surface">
          <View className="flex-row items-center justify-between border-b border-border px-5 py-3">
            <Text className="text-[16px] text-foreground">
              <Text className="font-semibold">{grocery.stats.left} to get</Text>
              {grocery.stats.checked > 0 ? <Text className="text-muted"> · {grocery.stats.checked} in the cart</Text> : null}
              {pricing.basket && pricing.basket.pricedCount > 0 ? (
                <Text className="text-muted">
                  {" · "}
                  <Text className="font-semibold text-foreground">{formatCents(pricing.basket.totalCents)}</Text>
                  {pricing.basket.missingCount > 0 ? ` for ${pricing.basket.pricedCount} priced` : ""}
                </Text>
              ) : null}
            </Text>
            {grocery.stats.checked > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  const r = await grocery.clearChecked();
                  if (!r.ok) setMessage(r.message);
                }}
                className="min-h-11 justify-center px-2"
              >
                <Text className="text-[15px] font-semibold text-foreground">Clear checked</Text>
              </Pressable>
            ) : null}
          </View>
          {trip.trip ? (
            <View className="border-b border-border px-5 py-3">
              <Segmented
                options={[
                  { value: "aisle", label: "By aisle" },
                  { value: "stores", label: trip.trip.stops.length === 1 ? "My store" : `By store (${trip.trip.stops.length})` },
                ]}
                value={view}
                onChange={setView}
              />
            </View>
          ) : null}
          {showStores
            ? byStore.map((section, si) => {
                const stop = trip.trip!.stops.find((x) => x.storeKey === section.storeKey);
                return (
                  <View key={section.storeKey ?? "unassigned"}>
                    <View className="px-5 pb-2 pt-4">
                      <Text accessibilityRole="header" className="text-[18px] font-bold text-foreground">
                        {stop ? `${trip.trip!.stops.length > 1 ? `${si + 1}. ` : ""}${stop.name}` : "Not assigned to a store"}
                      </Text>
                      <Text className="text-[14px] text-muted">
                        {stop?.address ?? (stop ? "" : "Added after the trip was planned, or no store priced it")}
                        {section.count ? ` · ${section.count} item${section.count === 1 ? "" : "s"}` : ""}
                      </Text>
                    </View>
                    {section.departments.map((d) => (
                      <View key={d.department}>
                        <View className="bg-surface-strong/50 px-5 py-1.5">
                          <Text className="text-[12px] font-semibold uppercase tracking-widest text-muted">{groceryDepartments.find((x) => x.code === d.department)?.label ?? d.department}</Text>
                        </View>
                        {d.items.map(row)}
                      </View>
                    ))}
                  </View>
                );
              })
            : groups.map((g) => (
            <View key={g.department}>
              <View className="flex-row justify-between bg-surface-strong/50 px-5 py-2">
                <Text accessibilityRole="header" className="text-[13px] font-semibold uppercase tracking-widest text-muted">
                  {g.label}
                </Text>
                <Text className="text-[13px] text-muted">{g.remaining > 0 ? `${g.remaining} left` : "Done"}</Text>
              </View>
              {g.items.map(row)}
            </View>
          ))}
        </View>
      )}

      <Card>
        <Eyebrow>One store or best deals</Eyebrow>
        {trip.trip ? (
          <>
            <CardTitle>{trip.trip.stops.length === 1 ? `Shopping at ${trip.trip.stops[0]!.name}` : `Shopping at ${trip.trip.stops.length} stores`}</CardTitle>
            {trip.trip.stops.length > 1 ? <Body>{trip.trip.stops.map((s) => s.name).join(" → ")}</Body> : null}
            <View className="mt-3 flex-row gap-2">
              <Button variant="secondary" label="Compare again" onPress={() => router.push("/compare")} />
              <Button
                variant="ghost"
                label="Finish trip"
                onPress={async () => {
                  const r = await trip.end("done");
                  setMessage(r.ok ? "Trip finished. The list is grouped by aisle again." : r.message);
                }}
              />
            </View>
          </>
        ) : (
          <>
            <Body>See whether splitting your list across nearby stores is worth the extra drive — after fuel and your time.</Body>
            <View className="mt-3">
              <Button icon="git-compare-outline" label="Compare stores" disabled={grocery.stats.left === 0} onPress={() => router.push("/compare")} />
            </View>
          </>
        )}
      </Card>

      <Prices pricing={pricing} hasItems={grocery.stats.left > 0} />

      <FromPlan
        hasPlanItems={grocery.items.some((i) => i.source === "plan" && !i.checked)}
        onAdd={async (lines, planId) => {
          const r = await grocery.addPlan(lines, planId);
          setMessage(
            r.ok
              ? r.data.added === 0
                ? "Everything from the plan is already on the list or in the cart."
                : `Added ${r.data.added} item${r.data.added === 1 ? "" : "s"} from the meal plan.`
              : r.message,
          );
        }}
      />

      <Card>
        <Eyebrow>Household</Eyebrow>
        {household.mode === "preview" ? (
          <Body>Sharing the list needs accounts. Connect Supabase (see the README) to invite people.</Body>
        ) : (
          <>
            <CardTitle>{household.active?.name ?? "Your household"}</CardTitle>
            <Body>
              {household.members.length} {household.members.length === 1 ? "person" : "people"}
            </Body>
            <View className="mt-3">
              <Button
                variant="secondary"
                icon={household.isOwner && household.seatsLeft > 0 ? "person-add-outline" : "people-outline"}
                label={household.isOwner && household.seatsLeft > 0 ? "Invite someone" : "Manage household"}
                onPress={() => router.push("/household")}
              />
            </View>
          </>
        )}
      </Card>

      <EditSheet
        item={editing}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          if (!editing) return;
          const r = await grocery.update(editing.id, patch);
          if (r.ok) setEditing(null);
          else setMessage(r.message);
        }}
        onRemove={async () => {
          if (!editing) return;
          const id = editing.id;
          setEditing(null);
          const r = await grocery.remove(id);
          if (!r.ok) setMessage(r.message);
        }}
      />
    </Screen>
  );
}

function SyncBadge({ state }: { state: SyncState }) {
  const label = { live: "Live — changes sync to everyone", connecting: "Connecting…", offline: "Offline — will catch up", local: "Saved on this device" }[state];
  const dot = state === "live" ? "bg-success" : state === "local" ? "bg-subtle" : "bg-warning";
  return (
    <View accessibilityRole="text" className="-mt-2 flex-row items-center gap-2">
      <View className={`size-2.5 rounded-full ${dot}`} />
      <Text className="text-[14px] text-muted">{label}</Text>
    </View>
  );
}

function AddItem({ onAdd, disabled }: { onAdd: ReturnType<typeof useGrocery>["add"]; disabled: boolean }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    const r = await onAdd({ name, department: departmentFor(name) });
    setSaving(false);
    if (r.ok) {
      setName("");
      setError(null);
    } else setError(r.message);
  }
  return (
    <View>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Input
            accessibilityLabel="Add an item"
            value={name}
            onChangeText={setName}
            placeholder="Add an item…"
            maxLength={120}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            editable={!disabled}
            invalid={Boolean(error)}
          />
        </View>
        <Button label="Add" icon="add" onPress={() => void submit()} disabled={disabled || saving || !name.trim()} />
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="mt-1.5 text-[15px] text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function Row({
  item,
  shared,
  addedBy,
  checkedBy,
  price,
  onToggle,
  onEdit,
}: {
  item: GroceryItem;
  shared: boolean;
  addedBy: string | null;
  checkedBy: string | null;
  price: PricedLine | null;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const c = useThemeColors();
  const showPrice = price && !item.checked ? price : null;
  const meta = [
    showPrice?.product
      ? `${showPrice.product.name}${showPrice.product.size ? ` · ${showPrice.product.size}` : ""}${showPrice.packages && showPrice.packages > 1 ? ` × ${showPrice.packages}` : ""}`
      : null,
    showPrice?.note ?? null,
    item.neededFor.length > 0 ? `For ${item.neededFor.slice(0, 2).join(", ")}${item.neededFor.length > 2 ? ` +${item.neededFor.length - 2}` : ""}` : null,
    item.note,
    shared && item.checked && checkedBy ? `Got by ${checkedBy}` : shared && addedBy ? `Added by ${addedBy}` : null,
  ].filter(Boolean);
  return (
    <View className="flex-row items-center border-b border-border">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked }}
        accessibilityLabel={`${item.name}${item.amount ? `, ${item.amount}` : ""}`}
        onPress={onToggle}
        className="min-h-16 flex-1 flex-row items-center gap-3.5 py-2.5 pl-5 pr-2 active:bg-surface-strong/50"
      >
        <View className={`size-7 items-center justify-center rounded-full border-2 ${item.checked ? "border-foreground bg-foreground" : "border-subtle"}`}>
          {item.checked ? <Ionicons name="checkmark" size={16} color={c.background} /> : null}
        </View>
        <View className="flex-1">
          <Text className={`text-[17px] font-medium ${item.checked ? "text-muted line-through" : "text-foreground"}`}>
            {item.name}
            {item.amount ? <Text className="font-normal text-muted"> {item.amount}</Text> : null}
          </Text>
          {meta.length > 0 ? (
            <Text numberOfLines={1} className="text-[14px] text-muted">
              {meta.join(" · ")}
            </Text>
          ) : null}
        </View>
        {showPrice ? <PriceTag line={showPrice} /> : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} onPress={onEdit} className="mr-3 size-11 items-center justify-center rounded-full">
        <Ionicons name="pencil" size={18} color={c.muted} />
      </Pressable>
    </View>
  );
}

function EditSheet({
  item,
  onClose,
  onSave,
  onRemove,
}: {
  item: GroceryItem | null;
  onClose: () => void;
  onSave: (patch: { name: string; amount: string | null; note: string | null; department: GroceryDepartment }) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [form, setForm] = useState({ name: "", amount: "", note: "", department: "other" as GroceryDepartment });
  useEffect(() => {
    if (item) setForm({ name: item.name, amount: item.amount ?? "", note: item.note ?? "", department: item.department });
  }, [item]);
  return (
    <Sheet
      visible={item !== null}
      title="Edit item"
      description={item?.source === "plan" ? "From the meal plan. Updating from the plan replaces plan items you haven't checked." : undefined}
      onClose={onClose}
      footer={
        <View className="flex-row gap-2">
          <Button variant="danger" label="Remove" onPress={() => void onRemove()} />
          <View className="flex-1">
            <Button
              label="Save"
              disabled={!form.name.trim()}
              onPress={() => void onSave({ name: form.name, amount: form.amount.trim() || null, note: form.note.trim() || null, department: form.department })}
            />
          </View>
        </View>
      }
    >
      <View className="gap-4">
        <Field label="Item">
          <Input value={form.name} maxLength={120} onChangeText={(name) => setForm({ ...form, name })} />
        </Field>
        <Field label="Amount">
          <Input value={form.amount} maxLength={60} placeholder="e.g. 2 lb" onChangeText={(amount) => setForm({ ...form, amount })} />
        </Field>
        <Field label="Aisle">
          <Segmented
            value={form.department}
            onChange={(department) => setForm({ ...form, department })}
            options={groceryDepartments.map((d) => ({ value: d.code as GroceryDepartment, label: d.label }))}
          />
        </Field>
        <Field label="Note (optional)">
          <Input value={form.note} maxLength={200} placeholder="e.g. the big bag" onChangeText={(note) => setForm({ ...form, note })} />
        </Field>
      </View>
    </Sheet>
  );
}

function FromPlan({ hasPlanItems, onAdd }: { hasPlanItems: boolean; onAdd: (lines: ReturnType<typeof toPlanLines>, planId: string | null) => Promise<void> }) {
  const today = todayIso();
  const thisWeek = startOfWeek(today);
  const weeks = [
    { value: thisWeek, label: "This week" },
    { value: addDays(thisWeek, 7), label: "Next week" },
  ];
  const [weekStart, setWeekStart] = useState(weeks[nightsLeft(thisWeek, today) < 2 ? 1 : 0]!.value);
  return (
    <Card>
      <Eyebrow>From your meal plan</Eyebrow>
      <View className="mt-3">
        <Segmented value={weekStart} onChange={setWeekStart} options={weeks} />
      </View>
      <PlanSummary key={weekStart} weekStart={weekStart} hasPlanItems={hasPlanItems} onAdd={onAdd} />
    </Card>
  );
}

function PlanSummary({ weekStart, hasPlanItems, onAdd }: { weekStart: string; hasPlanItems: boolean; onAdd: (lines: ReturnType<typeof toPlanLines>, planId: string | null) => Promise<void> }) {
  const plan = useMealPlan(weekStart);
  const [busy, setBusy] = useState(false);
  const meals = [...plan.draft.meals, ...plan.draft.desserts].filter((m) => m.recipeId && plan.byId.get(m.recipeId));
  const dessertCount = plan.draft.desserts.filter((m) => m.recipeId && plan.byId.get(m.recipeId)).length;
  const dinnerCount = meals.length - dessertCount;
  const custom = plan.draft.meals.length - dinnerCount;
  const draft = useMemo(
    () =>
      meals.length === 0
        ? null
        : buildGroceryList({ meals: meals.map((m) => ({ recipe: plan.byId.get(m.recipeId!)!.recipe, servings: m.servings })), pantry: plan.recipesData.context.pantry, today: plan.today }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan.draft.meals, plan.draft.desserts, plan.byId, plan.recipesData.context.pantry, plan.today],
  );
  if (plan.loading) return <ActivityIndicator className="mt-4" accessibilityLabel="Loading" />;
  if (!draft) {
    return (
      <>
        <Body>No recipe dinners planned for this week yet.</Body>
        <View className="mt-3">
          <Button variant="secondary" label="Plan the week" onPress={() => router.push("/plan")} />
        </View>
      </>
    );
  }
  return (
    <>
      <Text className="mt-4 text-[17px] text-foreground">
        <Text className="font-semibold">
          {dinnerCount} dinner{dinnerCount === 1 ? "" : "s"}
          {dessertCount > 0 ? ` and ${dessertCount} dessert${dessertCount === 1 ? "" : "s"}` : ""}
        </Text>{" "}
        need{" "}
        <Text className="font-semibold">
          {draft.toBuy.length} item{draft.toBuy.length === 1 ? "" : "s"}
        </Text>
        .
      </Text>
      <Body>
        {draft.inKitchen.length > 0 ? `${draft.inKitchen.length} already in your kitchen ${draft.inKitchen.length === 1 ? "is" : "are"} left off. ` : ""}
        {custom > 0 ? `${custom} meal${custom === 1 ? "" : "s"} of your own aren't included. ` : ""}
        Amounts are what the recipes call for, not package sizes.
      </Body>
      <View className="mt-4">
        <Button
          label={busy ? "Adding…" : hasPlanItems ? "Update list from plan" : "Add to list"}
          disabled={busy || draft.toBuy.length === 0}
          onPress={async () => {
            setBusy(true);
            await onAdd(toPlanLines(draft.toBuy), plan.plan?.id ?? null);
            setBusy(false);
          }}
        />
      </View>
    </>
  );
}

function PriceTag({ line }: { line: PricedLine }) {
  if (line.lineTotalCents === null) return <Text className="text-[14px] text-muted">No price</Text>;
  const label = line.saleCents !== null ? "Sale" : (priceStatuses.find((p) => p.code === line.status)?.label ?? "");
  return (
    <View className="items-end">
      <Text className="text-[16px] font-semibold text-foreground">{formatCents(line.lineTotalCents)}</Text>
      <Text className={`text-[12px] font-semibold ${line.saleCents !== null ? "text-success" : (tone[line.status] ?? "")}`}>{label}</Text>
    </View>
  );
}

function Prices({ pricing, hasItems }: { pricing: ReturnType<typeof usePricing>; hasItems: boolean }) {
  const profile = useProfile();
  const [zip, setZip] = useState(profile.household.country === "US" ? profile.household.postalCode.slice(0, 5) : "");
  const [changing, setChanging] = useState(false);
  const b = pricing.basket;
  const budget = profile.budget.period === "week" ? profile.budget.amountCents : null;

  if (pricing.blocker === "checking") return null;
  if (pricing.blocker !== null) {
    const why =
      pricing.blocker === "preview"
        ? "Store prices need an account and the Kitchen Pantry server. Until then the list shows no prices — never guesses."
        : pricing.blocker === "no_server"
          ? "Set EXPO_PUBLIC_API_URL to your Kitchen Pantry server (see the README) to see live Kroger prices here."
          : "The server doesn't have Kroger API keys yet (see the README), so the list shows no prices.";
    return (
      <Card>
        <Eyebrow>Store prices</Eyebrow>
        <CardTitle>Not connected</CardTitle>
        <Body>{why}</Body>
      </Card>
    );
  }

  if (!pricing.store || changing) {
    return (
      <Card>
        <Eyebrow>Store prices</Eyebrow>
        <Body>Pick a Kroger-family store (Kroger, Ralphs, Fred Meyer, King Soopers, Pick &apos;n Save, Mariano&apos;s…) to see its prices.</Body>
        <View className="mt-3 flex-row gap-2">
          <View className="flex-1">
            <Input accessibilityLabel="ZIP code" value={zip} keyboardType="number-pad" maxLength={5} placeholder="ZIP code" onChangeText={(v) => setZip(v.replace(/\D/g, ""))} />
          </View>
          <Button label={pricing.busy === "stores" ? "Finding…" : "Find"} icon="location-outline" disabled={zip.length !== 5 || pricing.busy === "stores"} onPress={() => void pricing.findStores(zip)} />
        </View>
        {pricing.error ? (
          <View className="mt-3">
            <Notice tone="error">{pricing.error}</Notice>
          </View>
        ) : null}
        {pricing.stores ? (
          pricing.stores.length === 0 ? (
            <Body>No Kroger-family stores within 15 miles of that ZIP.</Body>
          ) : (
            <View className="mt-3 gap-2">
              {pricing.stores.map((s) => (
                <Pressable
                  key={s.locationId}
                  accessibilityRole="button"
                  onPress={async () => {
                    if (await pricing.chooseStore(s)) setChanging(false);
                  }}
                  className="rounded-2xl bg-background px-4 py-3 active:opacity-80"
                >
                  <Text className="font-semibold text-foreground">{s.name}</Text>
                  <Text className="text-[14px] text-muted">{[s.address, s.city, s.region].filter(Boolean).join(", ")}</Text>
                </Pressable>
              ))}
            </View>
          )
        ) : null}
        {changing && pricing.store ? (
          <View className="mt-2">
            <Button variant="ghost" label={`Keep ${pricing.store.name}`} onPress={() => setChanging(false)} />
          </View>
        ) : null}
      </Card>
    );
  }

  return (
    <Card>
      <Eyebrow>Store prices</Eyebrow>
      <View className="mt-1.5 flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text numberOfLines={1} className="text-xl font-bold text-foreground">
            {pricing.store.name}
          </Text>
          {pricing.store.address ? (
            <Text numberOfLines={1} className="text-[14px] text-muted">
              {pricing.store.address}
            </Text>
          ) : null}
        </View>
        <Button variant="ghost" label="Change" onPress={() => setChanging(true)} />
      </View>
      {!hasItems ? (
        <Body>Prices show up here once there&apos;s something on the list.</Body>
      ) : b ? (
        <View className="mt-3 rounded-2xl bg-background p-4">
          <Text className="text-[15px] text-muted">{b.missingCount > 0 ? `${b.pricedCount} of ${b.pricedCount + b.missingCount} items` : "Everything left to buy"}</Text>
          <Text className="text-[32px] font-bold text-foreground">{formatCents(b.totalCents)}</Text>
          {b.saleSavingsCents > 0 ? <Text className="text-[14px] text-success">Includes {formatCents(b.saleSavingsCents)} in sale prices</Text> : null}
          {b.missingCount > 0 ? <Text className="text-[14px] text-muted">{b.missingCount} without a price at this store — not included</Text> : null}
          {b.assumedCount > 0 ? <Text className="text-[14px] text-muted">{b.assumedCount} priced as one package — check the amounts</Text> : null}
          {budget !== null && b.missingCount === 0 ? (
            <Text className="text-[14px] text-muted">
              {b.totalCents <= budget
                ? `${formatCents(budget - b.totalCents)} under your ${formatCents(budget)} weekly budget`
                : `${formatCents(b.totalCents - budget)} over your ${formatCents(budget)} weekly budget`}
            </Text>
          ) : null}
          <Text className="mt-2 text-[13px] text-subtle">Prices from Kroger. Shelf prices can change; tax not included.</Text>
        </View>
      ) : null}
      {pricing.error ? (
        <View className="mt-3">
          <Notice tone="error">{pricing.error}</Notice>
        </View>
      ) : null}
      {hasItems ? (
        <View className="mt-3">
          <Button
            variant={pricing.stale || !b ? "primary" : "secondary"}
            icon="refresh"
            label={pricing.busy === "prices" ? "Checking prices…" : pricing.stale ? "List changed — update prices" : b ? "Refresh prices" : "Check prices"}
            disabled={pricing.busy === "prices"}
            onPress={() => void pricing.refresh()}
          />
        </View>
      ) : null}
    </Card>
  );
}
