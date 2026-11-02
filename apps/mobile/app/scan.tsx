import { normalizeBarcode, scannedToPrefill, type ScannedProduct } from "@kitchen-pantry/integrations";
import type { PantryItemInput } from "@kitchen-pantry/validation";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Button, Field, Input, Notice } from "@/components/controls";
import { ItemEditor } from "@/components/kitchen/item-editor";
import { Body, Card, Screen } from "@/components/ui";
import { useApp } from "@/lib/app-state";
import { apiUrl } from "@/lib/config";
import { useKitchen } from "@/lib/use-kitchen";

/**
 * Add by barcode (spec 01 §5). Point the camera at a barcode — or type the
 * numbers — and the product is looked up in Open Food Facts through the
 * Kitchen Pantry server. The usual add form opens filled in, to check first.
 */
export default function ScanScreen() {
  const { mode, accessToken } = useApp();
  const kitchen = useKitchen();
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ code: string; prefill: Partial<PantryItemInput>; note: string } | null>(null);
  const handled = useRef(false);
  /** After a failed lookup the same barcode is ignored for a while (no retry loop while the camera still sees it). */
  const cooldown = useRef<{ code: string; until: number } | null>(null);

  const look = useCallback(
    async (raw: string, format?: string): Promise<boolean> => {
      const normalized = normalizeBarcode(raw, format);
      if (!normalized) {
        setError("That doesn't look like a product barcode. Check the numbers under the bars.");
        return false;
      }
      if (mode !== "supabase" || !apiUrl) {
        // Preview mode: no server to ask, and items stay on this phone without the barcode.
        setFound({ code: normalized, prefill: {}, note: "Product lookups need the Kitchen Pantry server and sign-in. Add the name yourself." });
        return true;
      }
      setBusy(true);
      setError(null);
      try {
        const token = await accessToken();
        const res = await fetch(`${apiUrl}/api/products/barcode?code=${normalized}`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
        const r = (await res.json()) as { ok: boolean; data?: { product: ScannedProduct | null; available: boolean }; message?: string };
        if (!r.ok || !r.data) {
          setError(r.message ?? "Couldn't look that barcode up.");
          return false;
        }
        const p = r.data.product;
        setFound({
          code: normalized,
          prefill: p ? scannedToPrefill(p) : {},
          note: p
            ? `From Open Food Facts${p.brand ? ` · ${p.brand}` : ""}${p.sizeLabel ? ` · ${p.sizeLabel}` : ""}. Check the details, then add it.`
            : r.data.available
              ? "That barcode isn't in Open Food Facts yet. Add the name yourself — the barcode is saved with it."
              : "Product lookups aren't set up on the server yet. Add the name yourself — the barcode is saved with it.",
        });
        return true;
      } catch {
        setError("Couldn't reach the Kitchen Pantry server.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [accessToken, mode],
  );

  return (
    <Screen title="Add by barcode" subtitle="Product details come from Open Food Facts, a free open database. You can change anything before saving." showProfile={false}>
      {permission?.granted ? (
        <View className="h-72 overflow-hidden rounded-card bg-black">
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
            onBarcodeScanned={
              found || busy
                ? undefined
                : ({ type, data }) => {
                    if (handled.current) return;
                    const n = normalizeBarcode(data, type);
                    if (!n) return;
                    const cool = cooldown.current;
                    if (cool && cool.code === n && Date.now() < cool.until) return;
                    handled.current = true;
                    setCode(n);
                    void look(n).then((ok) => {
                      if (!ok) cooldown.current = { code: n, until: Date.now() + 15_000 };
                      handled.current = false;
                    });
                  }
            }
          />
        </View>
      ) : (
        <Card>
          <Body>Allow the camera to scan barcodes, or type the numbers below.</Body>
          <View className="mt-3">
            <Button variant="secondary" icon="camera-outline" label="Use the camera" onPress={() => void requestPermission()} />
          </View>
        </Card>
      )}
      <Field label="Barcode number">
        <Input accessibilityLabel="Barcode number" keyboardType="number-pad" value={code} maxLength={16} placeholder="Numbers under the barcode" onChangeText={(t) => setCode(t.replace(/[^\d\s]/g, ""))} />
      </Field>
      <Button
        icon="search"
        label={busy ? "Looking…" : "Look up"}
        disabled={busy || code.replace(/\D/g, "").length < 8}
        onPress={() => {
          cooldown.current = null;
          void look(code);
        }}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Text className="text-[13px] text-muted">Data © Open Food Facts contributors (Open Database Licence).</Text>

      <ItemEditor
        visible={found !== null}
        item={null}
        prefill={found?.prefill ?? null}
        note={found?.note ?? null}
        today={kitchen.today}
        repository={kitchen.repository}
        onClose={() => setFound(null)}
        onSave={async (input) => {
          const r = await kitchen.add(input, { source: "barcode", barcode: found!.code });
          if (r.ok) router.back();
          return r;
        }}
        onRemove={async () => ({ ok: true, data: null })}
      />
    </Screen>
  );
}
