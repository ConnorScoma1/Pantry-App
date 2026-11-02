import Ionicons from "@expo/vector-icons/Ionicons";
import { summarizeBasket } from "@kitchen-pantry/meal-planner";
import type { SpendingEntry } from "@kitchen-pantry/shared-types";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Field, Input, Notice, Segmented } from "@/components/controls";
import { Sheet } from "@/components/kitchen/sheet";
import { Card, Eyebrow, Screen } from "@/components/ui";
import { useThemeColors } from "@/lib/theme";
import { useGrocery } from "@/lib/use-grocery";
import { usePricing } from "@/lib/use-pricing";
import { useSavings, type SavingsRange } from "@/lib/use-savings";

const RANGES: ReadonlyArray<{ value: SavingsRange; label: string }> = [
  { value: "week", label: "This week" },
  { value: "eight_weeks", label: "Last 8 weeks" },
];

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Tag({ tone, children }: { tone: "verified" | "estimate" | "value"; children: string }) {
  const box = tone === "verified" ? "bg-accent-soft" : tone === "estimate" ? "bg-warning/10" : "bg-surface-strong";
  const text = tone === "verified" ? "text-accent" : tone === "estimate" ? "text-warning" : "text-muted";
  return (
    <View className={`self-start rounded-full px-2.5 py-0.5 ${box}`}>
      <Text className={`text-[12px] font-semibold ${text}`}>{children}</Text>
    </View>
  );
}

function Head({ label, tag }: { label: string; tag: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-2">
      <View className="flex-1">
        <Eyebrow>{label}</Eyebrow>
      </View>
      {tag}
    </View>
  );
}

const Big = ({ children }: { children: string }) => <Text className="mt-2 text-[32px] font-bold tracking-tight text-foreground">{children}</Text>;
const Muted = ({ children }: { children: ReactNode }) => <Text className="text-[15px] leading-5 text-muted">{children}</Text>;

export default function SavingsScreen() {
  const s = useSavings();
  const [editing, setEditing] = useState<{ entry: SpendingEntry | null; cartId: string | null; amountCents: number | null; storeName: string | null } | null>(null);
  const rangeLabel = s.range === "week" ? "this week" : "in the last 8 weeks";
  const sum = s.summary;

  return (
    <Screen title="Savings" subtitle="What you spend, save and use up. Verified numbers and estimates are always kept apart.">
      <Pressable accessibilityRole="button" onPress={() => router.back()} className="min-h-10 justify-center">
        <Text className="text-[16px] font-semibold text-accent">← Back</Text>
      </Pressable>
      <Button icon="add" label="Log a shop" onPress={() => setEditing({ entry: null, cartId: null, amountCents: null, storeName: null })} />
      <BudgetCard budget={s.budget} />
      <Segmented options={RANGES} value={s.range} onChange={s.setRange} />
      {s.error ? <Notice tone="error">{s.error}</Notice> : null}
      {sum ? (
        <>
          <Card>
            <Head label="Sale savings" tag={<Tag tone="verified">✓ Verified</Tag>} />
            <Big>{money(sum.carts.verifiedCents)}</Big>
            <Muted>
              {sum.carts.verifiedItems > 0
                ? `On ${plural(sum.carts.verifiedItems, "item")} in ${plural(sum.carts.orderedCarts, "order")} you placed ${rangeLabel}.`
                : `None verified ${rangeLabel}.`}
            </Muted>
            {sum.carts.estimatedCents > 0 ? (
              <View className="mt-3 gap-1">
                <Tag tone="estimate">Estimate</Tag>
                <Text className="text-[15px] leading-5 text-foreground">
                  {money(sum.carts.estimatedCents)} more on {plural(sum.carts.estimatedItems, "item")} — orders not marked as placed, items sold by weight, or older prices.
                </Text>
              </View>
            ) : null}
            <View className="mt-3">
              <Muted>Counted only when the store reported both the regular and sale price, you sent the cart to the store, and you marked it as ordered.</Muted>
            </View>
          </Card>
          <Card>
            <Head label="Food used from your kitchen" tag={<Tag tone="value">Value, not savings</Tag>} />
            <Big>{money(sum.pantry.usedValueCents)}</Big>
            <Muted>
              {sum.pantry.usedCount > 0
                ? `What you paid for ${plural(sum.pantry.usedCount - sum.pantry.usedUnpriced, "item")} you used up ${rangeLabel}.${sum.pantry.usedUnpriced > 0 ? ` ${plural(sum.pantry.usedUnpriced, "more item")} had no price.` : ""}`
                : `Nothing marked "Used it up" ${rangeLabel}.`}
            </Muted>
            <View className="mt-3">
              <Muted>This food was already bought, so it isn&apos;t counted as money saved.</Muted>
            </View>
          </Card>
          <Card>
            <Head label="Waste avoided" tag={<Tag tone="estimate">Potential</Tag>} />
            <Big>{plural(sum.pantry.rescuedCount, "item")}</Big>
            <Muted>
              {sum.pantry.rescuedCount > 0
                ? `Used up close to their use-by date: ${sum.pantry.rescuedNames.join(", ")}${sum.pantry.rescuedValueCents > 0 ? ` (${money(sum.pantry.rescuedValueCents)} paid)` : ""}.`
                : `Nothing used up within 3 days of its use-by date ${rangeLabel}.`}
            </Muted>
            <Text className="mt-3 text-[15px] leading-5 text-foreground">
              {sum.pantry.wastedCount > 0
                ? `Thrown out or expired: ${plural(sum.pantry.wastedCount, "item")} (${sum.pantry.wastedNames.join(", ")})${sum.pantry.wastedValueCents > 0 ? ` — up to ${money(sum.pantry.wastedValueCents)}` : ""}.`
                : "Nothing thrown out. Nice."}
            </Text>
          </Card>
          <SpendingCard
            s={s}
            onEdit={(entry) => setEditing({ entry, cartId: entry.cartDraftId, amountCents: entry.amountCents, storeName: entry.storeName })}
            onLogOrder={(cartId, amountCents, storeName) => setEditing({ entry: null, cartId, amountCents, storeName })}
          />
        </>
      ) : (
        <Muted>Loading…</Muted>
      )}
      {editing ? (
        <ShopSheet
          key={editing.entry?.id ?? editing.cartId ?? "new"}
          state={editing}
          today={s.today}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const r = editing.entry ? await s.updateSpending(editing.entry.id, input) : await s.addSpending(input);
            if (r.ok) setEditing(null);
            return r.ok ? null : r.message;
          }}
          onDelete={
            editing.entry
              ? async () => {
                  const r = await s.removeSpending(editing.entry!.id);
                  if (r.ok) setEditing(null);
                }
              : undefined
          }
        />
      ) : null}
    </Screen>
  );
}

function BudgetCard({ budget }: { budget: number | null }) {
  const grocery = useGrocery();
  const pricing = usePricing(grocery.items);
  const b = pricing.basket;
  const summary = b ? summarizeBasket(b.lines.map((l) => ({ totalCents: l.lineTotalCents, status: l.status })), budget) : null;
  const left = grocery.items.filter((i) => !i.checked).length;
  let verdict: ReactNode = null;
  if (summary && budget !== null) {
    const diff = money(Math.abs(budget - summary.totalCents));
    verdict =
      summary.verdict === "within_budget" ? <Tag tone="verified">{`${diff} under budget`}</Tag>
      : summary.verdict === "over_budget" ? <Tag tone="estimate">{`${diff} over budget`}</Tag>
      : summary.verdict === "incomplete" ? <Tag tone="value">{`Can't compare yet — ${plural(summary.unpricedLines, "item")} without a price`}</Tag>
      : <Tag tone="estimate">{`Estimate — probably ${summary.verdict === "estimate_within_budget" ? "within" : "over"} budget`}</Tag>;
  }
  return (
    <Card>
      <Eyebrow>Weekly grocery budget</Eyebrow>
      <Big>{budget === null ? "None set" : money(budget)}</Big>
      <Muted>{budget === null ? "Add one in Plan → Planning settings to compare." : "From your planning settings."}</Muted>
      <View className="mt-5">
        <Head label="Estimated basket (grocery list)" tag={<Tag tone="estimate">Estimate</Tag>} />
        {grocery.loading || pricing.blocker === "checking" ? (
          <Muted>Checking…</Muted>
        ) : left === 0 ? (
          <Muted>Your grocery list is empty, so there&apos;s nothing to estimate.</Muted>
        ) : pricing.blocker !== null ? (
          <Muted>Store prices aren&apos;t connected here, so there&apos;s no estimate. We never guess prices.</Muted>
        ) : !pricing.store ? (
          <Muted>Choose your store on the Grocery tab to estimate the basket.</Muted>
        ) : b && summary ? (
          <>
            <Big>{money(summary.totalCents)}</Big>
            <Muted>
              {b.pricedCount} of {b.pricedCount + b.missingCount} items priced at {pricing.store.name}.
              {b.saleSavingsCents > 0 ? ` Includes ${money(b.saleSavingsCents)} in current sale prices.` : ""}
            </Muted>
            {verdict ? <View className="mt-2">{verdict}</View> : null}
          </>
        ) : (
          <Muted>{pricing.error ?? `Checking prices at ${pricing.store.name}…`}</Muted>
        )}
      </View>
    </Card>
  );
}

function SpendingCard({
  s,
  onEdit,
  onLogOrder,
}: {
  s: ReturnType<typeof useSavings>;
  onEdit: (e: SpendingEntry) => void;
  onLogOrder: (cartId: string, amountCents: number, storeName: string | null) => void;
}) {
  const c = useThemeColors();
  const sum = s.summary!;
  const weeks = sum.byWeek;
  const max = Math.max(s.budget ?? 0, ...weeks.map((w) => w.spentCents), 1);
  const entries = s.data?.spending ?? [];
  return (
    <Card>
      <Eyebrow>Grocery spending</Eyebrow>
      <Text className="mt-1.5 text-[16px] leading-6 text-foreground">
        {sum.trend.averageCents === null
          ? "Log your shops to see your spending over time."
          : `About ${money(sum.trend.averageCents)} a week across ${plural(sum.trend.loggedWeeks, "logged week")}.`}
        {sum.trend.direction === "up" ? " Trending up." : sum.trend.direction === "down" ? " Trending down." : sum.trend.direction === "steady" ? " Holding steady." : ""}
      </Text>
      <View accessibilityLabel={`Spending per week for the last 8 weeks${s.budget !== null ? `, budget ${money(s.budget)}` : ""}`} className="relative mt-5 h-40 flex-row items-end gap-2">
        {s.budget !== null ? (
          <View pointerEvents="none" className="absolute inset-x-0 border-t border-dashed border-subtle" style={{ bottom: `${(s.budget / max) * 100}%` }} />
        ) : null}
        {weeks.map((w) => (
          <View key={w.weekStart} className="h-full flex-1 justify-end">
            <View
              accessibilityLabel={`Week of ${shortDate(w.weekStart)}: ${w.shops > 0 ? money(w.spentCents) : "nothing logged"}`}
              className={`w-full rounded-t-lg ${w.shops === 0 ? "h-1 bg-surface-strong" : w.overBudget ? "bg-warning" : "bg-accent"}`}
              style={w.shops > 0 ? { height: `${Math.max((w.spentCents / max) * 100, 3)}%` } : undefined}
            />
          </View>
        ))}
      </View>
      <View className="mt-2 flex-row gap-2">
        {weeks.map((w, i) => (
          <Text key={w.weekStart} numberOfLines={1} className="flex-1 text-center text-[12px] text-muted">
            {i === weeks.length - 1 ? "Now" : `${Number(w.weekStart.slice(5, 7))}/${Number(w.weekStart.slice(8, 10))}`}
          </Text>
        ))}
      </View>
      {s.budget !== null ? <Text className="mt-1 text-[13px] text-muted">Dashed line: your {money(s.budget)} weekly budget.</Text> : null}

      {sum.orders.length > 0 ? (
        <View className="mt-5 gap-2 rounded-2xl bg-surface-strong/60 p-4">
          <Text className="text-[15px] font-semibold text-foreground">Orders you placed that aren&apos;t logged yet</Text>
          {sum.orders.slice(0, 3).map((o) => (
            <View key={o.cart.id} className="gap-2">
              <Text className="text-[15px] text-foreground">
                {o.cart.storeName ?? "Store order"} · {shortDate(o.cart.createdAt.slice(0, 10))} · cart estimate {money(o.estimateCents)}
              </Text>
              <Button variant="secondary" label="Log what I paid" onPress={() => onLogOrder(o.cart.id, o.estimateCents, o.cart.storeName)} />
            </View>
          ))}
        </View>
      ) : null}

      <Text className="mt-5 mb-1 text-[15px] font-semibold text-foreground">Logged shops</Text>
      {entries.length === 0 ? (
        <Muted>None yet. Spending here only ever comes from shops you log — we never guess it.</Muted>
      ) : (
        entries.slice(0, 12).map((e) => (
          <Pressable
            key={e.id}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${e.storeName ?? "shop"} on ${shortDate(e.spentOn)}`}
            onPress={() => onEdit(e)}
            className="min-h-14 flex-row items-center gap-3 border-b border-border py-2"
          >
            <Ionicons name="receipt-outline" size={20} color={c.muted} />
            <View className="flex-1">
              <Text numberOfLines={1} className="text-[16px] font-medium text-foreground">{e.storeName ?? "Groceries"}</Text>
              <Text numberOfLines={1} className="text-[14px] text-muted">
                {shortDate(e.spentOn)}
                {e.note ? ` · ${e.note}` : ""}
                {e.cartDraftId ? " · from an order" : ""}
              </Text>
            </View>
            <Text className="text-[16px] font-semibold text-foreground">{money(e.amountCents)}</Text>
          </Pressable>
        ))
      )}
    </Card>
  );
}

function ShopSheet({
  state,
  today,
  onClose,
  onSave,
  onDelete,
}: {
  state: { entry: SpendingEntry | null; cartId: string | null; amountCents: number | null; storeName: string | null };
  today: string;
  onClose: () => void;
  onSave: (input: unknown) => Promise<string | null>;
  onDelete?: () => Promise<void>;
}) {
  const [date, setDate] = useState(state.entry?.spentOn ?? today);
  const [amount, setAmount] = useState(state.amountCents ? (state.amountCents / 100).toFixed(2) : "");
  const [store, setStore] = useState(state.storeName ?? "");
  const [note, setNote] = useState(state.entry?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const cents = Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return setError("Enter the amount you spent.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Enter the date as YYYY-MM-DD.");
    setBusy(true);
    const message = await onSave({ spentOn: date, amountCents: cents, storeName: store.trim() || null, note: note.trim() || null, cartDraftId: state.cartId });
    setBusy(false);
    setError(message);
  }

  return (
    <Sheet
      visible
      title={state.entry ? "Edit shop" : "Log a shop"}
      description={state.cartId && !state.entry ? "Prefilled with the cart's estimate — change it to your receipt total." : "What you actually spent. This is the only source for spending trends."}
      onClose={onClose}
      footer={
        <View className="gap-2">
          <Button label={busy ? "Saving…" : "Save"} onPress={() => void save()} disabled={busy} />
          {onDelete ? <Button variant="danger" icon="trash-outline" label="Delete" onPress={() => void onDelete()} disabled={busy} /> : null}
        </View>
      }
    >
      <View className="gap-4">
        <Field label="Amount spent" error={error ?? undefined}>
          <Input accessibilityLabel="Amount spent" keyboardType="decimal-pad" placeholder="0.00" value={amount} onChangeText={setAmount} invalid={Boolean(error)} />
        </Field>
        <Field label="Date" hint="YYYY-MM-DD">
          <Input accessibilityLabel="Date" value={date} onChangeText={setDate} autoCapitalize="none" />
        </Field>
        <Field label="Store (optional)">
          <Input accessibilityLabel="Store" maxLength={120} value={store} onChangeText={setStore} />
        </Field>
        <Field label="Note (optional)">
          <Input accessibilityLabel="Note" maxLength={200} value={note} onChangeText={setNote} />
        </Field>
      </View>
    </Sheet>
  );
}
