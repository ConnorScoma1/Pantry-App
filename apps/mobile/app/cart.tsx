import Ionicons from "@expo/vector-icons/Ionicons";
import {
  approveLine,
  cartAsText,
  cartBlockers,
  cartEstimate,
  chooseOption,
  formatCents,
  fulfillmentMethods,
  selectedProduct,
  setCount,
  setInclude,
  type CartDraft,
  type CartLine,
  type FulfillmentMethod,
} from "@kitchen-pantry/grocery-pricing";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, Share, Text, View } from "react-native";
import { Button, ChoiceCard, Notice, Segmented } from "@/components/controls";
import { Body, Card, CardTitle, Eyebrow, Screen } from "@/components/ui";
import { useThemeColors } from "@/lib/theme";
import { useCart } from "@/lib/use-cart";

const timeFmt = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

/** Smart Cart: grocery list → products → household approval → the store's cart. */
export default function CartScreen() {
  const c = useCart();
  const params = useLocalSearchParams<{ kroger_code?: string; kroger_state?: string }>();
  const [retailer, setRetailer] = useState("mock");
  const [fulfillment, setFulfillment] = useState<FulfillmentMethod>("pickup");
  const [rebuilding, setRebuilding] = useState(false);
  const finished = useRef(false);

  // Back from Kroger sign-in (kitchenpantry://cart?kroger_code=…&kroger_state=…).
  useEffect(() => {
    if (finished.current || !params.kroger_code || !params.kroger_state || c.mode !== "supabase") return;
    finished.current = true;
    void c.finishKroger(String(params.kroger_code), String(params.kroger_state));
  }, [params.kroger_code, params.kroger_state, c]);

  useEffect(() => {
    const kroger = c.retailers.find((r) => r.id === "kroger");
    if (kroger?.available) setRetailer("kroger");
  }, [c.retailers]);

  const d = c.draft;
  const done = d !== null && (d.status === "sent" || d.status === "link_ready");

  return (
    <Screen title="Build my cart" subtitle="From your shared list to your store's cart. You approve every product; you pick the time and pay at the store.">
      <Pressable accessibilityRole="button" onPress={() => router.back()} className="min-h-10 justify-center">
        <Text className="text-[16px] font-semibold text-accent">← Back</Text>
      </Pressable>
      {c.message ? <Notice tone={c.message.tone === "success" ? "info" : c.message.tone}>{c.message.text}</Notice> : null}

      {c.loading ? (
        <Body>Loading your cart…</Body>
      ) : !d || rebuilding ? (
        <Card>
          <Eyebrow>1 · Your list</Eyebrow>
          <CardTitle>{c.listCount === 0 ? "The grocery list is empty" : `${c.listCount} items on the shared list`}</CardTitle>
          <Body>Duplicates are combined; what&apos;s in your kitchen is taken off (plan items) or flagged (typed items).</Body>
          {c.listCount === 0 ? (
            <View className="mt-3">
              <Button variant="secondary" icon="cart-outline" label="Add the meal plan on the Grocery tab" onPress={() => router.navigate("/grocery")} />
            </View>
          ) : null}
          <Text className="mb-2 mt-5 text-[15px] font-semibold text-foreground">2 · Where to shop</Text>
          <View className="gap-2.5" accessibilityRole="radiogroup">
            {c.retailers.map((r) => (
              <View key={r.id} style={{ opacity: r.available ? 1 : 0.55 }}>
                <ChoiceCard title={r.name} description={r.note ?? undefined} selected={retailer === r.id} onPress={() => r.available && setRetailer(r.id)} />
              </View>
            ))}
          </View>
          {retailer === "kroger" ? <Body>Prices from {c.store?.name ?? "your store (choose it on the Grocery tab)"}. Kroger adds items to the store selected on your Kroger account.</Body> : null}
          <Text className="mb-2 mt-4 text-[15px] font-semibold text-foreground">Curbside pickup or delivery?</Text>
          <Segmented value={fulfillment} onChange={setFulfillment} options={fulfillmentMethods.map((f) => ({ value: f.code, label: f.label }))} />
          <View className="mt-5 gap-2">
            <Button size="lg" icon="cart-outline" label={c.busy === "building" ? "Matching products…" : "Build my cart"} disabled={c.busy === "building" || c.listCount === 0} onPress={async () => {
              await c.build(retailer, fulfillment);
              setRebuilding(false);
            }} />
            {rebuilding ? <Button variant="ghost" label="Cancel" onPress={() => setRebuilding(false)} /> : null}
          </View>
        </Card>
      ) : done ? (
        <>
          <SentCard c={c} d={d} />
          <Button variant="secondary" icon="cart-outline" label="Build a new cart" onPress={() => setRebuilding(true)} />
        </>
      ) : (
        <DraftView c={c} d={d} onRebuild={() => setRebuilding(true)} />
      )}
    </Screen>
  );
}

type Cart = ReturnType<typeof useCart>;

function DraftView({ c, d, onRebuild }: { c: Cart; d: CartDraft; onRebuild: () => void }) {
  const est = useMemo(() => cartEstimate(d.lines), [d.lines]);
  const blockers = useMemo(() => cartBlockers(d.lines), [d.lines]);
  const editable = ["draft", "approved", "failed"].includes(d.status) && c.busy !== "sending";
  const sample = d.retailer === "mock";
  const name = sample ? "Sample Market" : "Kroger";
  const sorted = [...d.lines].sort((a, b) => Number(a.include && a.approved) - Number(b.include && b.approved) || Number(b.include) - Number(a.include));

  return (
    <>
      {d.status === "unknown" ? (
        <Card>
          <Eyebrow>Check your store cart</Eyebrow>
          <CardTitle>We can&apos;t tell whether the items were added</CardTitle>
          <Body>To avoid adding everything twice, open your {name} cart and tell us what you see.</Body>
          <View className="mt-3 gap-2">
            {d.retailer === "kroger" ? <Button variant="secondary" icon="open-outline" label="Open Kroger cart" onPress={() => void Linking.openURL("https://www.kroger.com/cart")} /> : null}
            <Button label="The items are there" onPress={() => void c.resolve(true)} />
            <Button variant="secondary" label="They're not — send again" onPress={() => void c.resolve(false)} />
          </View>
        </Card>
      ) : null}

      <Card>
        <Eyebrow>{sample ? "Practice cart" : `${name} cart`}</Eyebrow>
        <Text className="mt-1 text-3xl font-bold text-foreground">{formatCents(est.estimatedCents)}</Text>
        <Body>
          Estimate for {est.includedCount} items{est.unpricedCount ? ` (${est.unpricedCount} without a price)` : ""}.{" "}
          {sample ? "Sample prices — not from any real store." : `Not your checkout total: ${name} sets the final price (weighed items, price changes, taxes, fees).`}
        </Body>
        {editable ? (
          <View className="mt-3">
            <Segmented value={d.fulfillment} onChange={c.setFulfillment} options={fulfillmentMethods.map((f) => ({ value: f.code, label: f.label }))} />
          </View>
        ) : null}
        <View className="mt-4 gap-2">
          {d.status === "draft" || d.status === "failed" ? (
            <>
              {d.lastError ? <Text className="text-[14px] text-danger">{d.lastError}</Text> : null}
              <Button size="lg" icon="checkmark" label={c.busy === "approving" ? "Approving…" : "Approve this cart"} disabled={blockers.length > 0 || est.includedCount === 0 || c.busy !== null} onPress={() => void c.approve()} />
              <Text className="text-[13px] text-muted">
                {blockers.length > 0 ? `${blockers.length} item${blockers.length === 1 ? "" : "s"} need your OK first.` : "Everyone in your household can see this cart."}
              </Text>
            </>
          ) : d.status === "approved" || d.status === "sending" ? (
            <>
              <Text className="text-[14px] text-foreground">Approved{d.approvedAt ? ` · ${timeFmt(d.approvedAt)}` : ""}</Text>
              {d.retailer === "kroger" && (!c.krogerConnected || c.needsAuth) ? (
                <Button size="lg" label={c.busy === "connecting" ? "Opening Kroger…" : "Connect your Kroger account"} disabled={c.busy !== null} onPress={() => void c.connectKroger()} />
              ) : (
                <Button size="lg" icon="cart" label={c.busy === "sending" || d.status === "sending" ? "Sending…" : sample ? "Send (practice run)" : `Send to ${name}`} disabled={c.busy !== null || d.status === "sending"} onPress={() => void c.send()} />
              )}
              <Text className="text-[13px] text-muted">Changing anything sends the cart back for approval.</Text>
            </>
          ) : null}
        </View>
      </Card>

      {sorted.map((l) => (
        <LineCard key={l.id} line={l} editable={editable} onChange={(fn) => c.editLine(l.id, fn)} />
      ))}

      <Card>
        <Eyebrow>Shopping list export</Eyebrow>
        <Body>For any store without a cart connection.</Body>
        <View className="mt-3">
          <Button variant="secondary" icon="share-outline" label="Share list" onPress={() => void Share.share({ message: cartAsText({ title: "Grocery list", storeName: d.storeName, lines: d.lines }) })} />
        </View>
      </Card>
      <View className="flex-row flex-wrap gap-2">
        <Button variant="secondary" icon="refresh" label="Rebuild from list" disabled={!editable} onPress={onRebuild} />
        <Button variant="ghost" icon="trash-outline" label="Discard" disabled={d.status === "sending" || d.status === "unknown"} onPress={() => void c.discard()} />
      </View>
    </>
  );
}

function LineCard({ line, editable, onChange }: { line: CartLine; editable: boolean; onChange: (fn: (l: CartLine) => CartLine) => void }) {
  const c = useThemeColors();
  const [open, setOpen] = useState(false);
  const p = selectedProduct(line);
  const needsOk = line.include && !line.approved;
  return (
    <View className={`rounded-card bg-surface p-4 ${needsOk ? "border-2 border-warning/60" : ""} ${line.include ? "" : "opacity-70"}`}>
      <Text className="text-[12px] font-semibold uppercase tracking-widest text-muted">
        {line.name}
        {line.amountText ? ` · ${line.amountText}` : ""}
        {!line.include ? " · not in cart" : ""}
      </Text>
      {p ? (
        <View className="mt-1 flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-[17px] font-semibold text-foreground">{p.name}</Text>
            <Text className="text-[14px] text-muted">{[p.brand, p.sizeLabel, p.availability === "limited" ? "Low stock" : null].filter(Boolean).join(" · ")}</Text>
          </View>
          <View className="items-end">
            <Text className="text-[17px] font-semibold text-foreground">{formatCents((p.saleCents ?? p.regularCents) * line.count)}</Text>
            <Text className="text-[13px] text-muted">
              {line.count} × {formatCents(p.saleCents ?? p.regularCents)}
              {p.soldByWeight ? "/lb" : ""}
            </Text>
          </View>
        </View>
      ) : (
        <Text className="mt-1 text-[16px] text-muted">{line.reason ?? "No product chosen"}</Text>
      )}
      {line.reason && line.include ? <Text className={`mt-2 text-[14px] ${needsOk ? "text-warning" : "text-muted"}`}>{line.reason}</Text> : null}
      {line.inKitchen && line.include ? <Text className="mt-1 text-[14px] text-accent">{line.inKitchen} — skip it if you don&apos;t need more.</Text> : null}
      {editable ? (
        <View className="mt-3 flex-row flex-wrap items-center gap-2">
          {needsOk ? <Button icon="checkmark" label={line.state === "substitute" ? "OK, use this" : "Looks right"} onPress={() => onChange(approveLine)} /> : null}
          {p && line.include ? (
            <View className="flex-row items-center gap-1">
              <Pressable accessibilityRole="button" accessibilityLabel="Fewer" disabled={line.count <= 1} onPress={() => onChange((l) => setCount(l, l.count - 1))} className="size-10 items-center justify-center rounded-full border border-border bg-background">
                <Ionicons name="remove" size={18} color={c.foreground} />
              </Pressable>
              <Text className="min-w-10 text-center text-[15px] text-foreground">{line.count}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="More" disabled={line.count >= 99} onPress={() => onChange((l) => setCount(l, l.count + 1))} className="size-10 items-center justify-center rounded-full border border-border bg-background">
                <Ionicons name="add" size={18} color={c.foreground} />
              </Pressable>
            </View>
          ) : null}
          {line.options.length > 1 ? <Button variant="secondary" label={open ? "Close" : `Change (${line.options.length})`} onPress={() => setOpen((o) => !o)} /> : null}
          {line.selected ? <Button variant="ghost" label={line.include ? "Skip" : "Add back"} onPress={() => onChange((l) => setInclude(l, !l.include))} /> : null}
        </View>
      ) : null}
      {open
        ? line.options.map((o) => {
            const out = o.availability === "out_of_stock";
            return (
              <Pressable
                key={o.productId}
                accessibilityRole="radio"
                accessibilityState={{ checked: o.productId === line.selected, disabled: out }}
                disabled={out}
                onPress={() => {
                  onChange((l) => chooseOption(l, o.productId));
                  setOpen(false);
                }}
                className={`mt-2 flex-row items-center justify-between gap-3 rounded-xl bg-background px-3 py-2 ${o.productId === line.selected ? "border-2 border-foreground" : "border border-border"} ${out ? "opacity-50" : ""}`}
              >
                <View className="flex-1">
                  <Text className="text-[15px] font-medium text-foreground">{o.name}</Text>
                  <Text className="text-[13px] text-muted">{[o.brand, o.sizeLabel, out ? "Out of stock" : null].filter(Boolean).join(" · ")}</Text>
                </View>
                <Text className="text-[15px] font-semibold text-foreground">{formatCents(o.saleCents ?? o.regularCents)}</Text>
              </Pressable>
            );
          })
        : null}
    </View>
  );
}

function SentCard({ c, d }: { c: Cart; d: CartDraft }) {
  const r = d.result;
  const mock = r?.kind === "cart_confirmed" && r.confirmedBy === "mock";
  return (
    <Card>
      <Eyebrow>{mock ? "Practice run finished" : "Sent"}</Eyebrow>
      {r?.kind === "cart_confirmed" ? (
        <>
          <CardTitle>
            {mock ? "Nothing was sent to a real store" : r.confirmedBy === "household" ? "You confirmed the items are in your cart" : `The store accepted ${r.added} items into your cart`}
          </CardTitle>
          <Body>{mock ? "This was the practice retailer." : "Open your cart to check it, pick a pickup or delivery time, and pay on the store's site."}</Body>
          {r.checkoutUrl ? (
            <View className="mt-3">
              <Button icon="open-outline" label="Open your cart" onPress={() => void Linking.openURL(r.checkoutUrl!)} />
            </View>
          ) : null}
        </>
      ) : r?.kind === "link" ? (
        <View className="mt-3">
          <Button icon="open-outline" label={r.label} onPress={() => void Linking.openURL(r.url)} />
        </View>
      ) : null}
      <Text className="mt-5 text-[15px] font-semibold text-foreground">Did you place the order?</Text>
      <Text className="text-[14px] text-muted">Only you can tell us — we never see the checkout. This doesn&apos;t change the grocery list.</Text>
      <View className="mt-3 gap-2">
        <Button variant={d.purchase === "ordered" ? "primary" : "secondary"} icon={d.purchase === "ordered" ? "checkmark" : undefined} label={d.purchase === "ordered" ? "Order placed" : "I placed the order"} onPress={() => void c.setPurchase(d.purchase !== "ordered")} />
        {d.purchase === "ordered" ? <Button variant="secondary" label="Tick these off the grocery list" onPress={() => void c.checkOffList()} /> : null}
      </View>
    </Card>
  );
}
