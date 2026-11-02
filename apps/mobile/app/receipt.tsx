import Ionicons from "@expo/vector-icons/Ionicons";
import { formatCents } from "@kitchen-pantry/grocery-pricing";
import { pantryCategories } from "@kitchen-pantry/shared-types";
import { receiptDraftSchema, receiptLineToInput, type ReceiptDraftData } from "@kitchen-pantry/validation";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Input, Notice } from "@/components/controls";
import { Body, Card, Screen } from "@/components/ui";
import { useApp } from "@/lib/app-state";
import { apiUrl } from "@/lib/config";
import { useKitchen } from "@/lib/use-kitchen";
import { useThemeColors } from "@/lib/theme";

type Row = ReceiptDraftData["lines"][number] & { keep: boolean };

/**
 * Add from a receipt (spec 01 §5). The photo is read once on the Kitchen
 * Pantry server by the AI assistant and not kept. Review the list, fix
 * names, untick what you don't want, then add.
 */
export default function ReceiptScreen() {
  const c = useThemeColors();
  const { mode, accessToken } = useApp();
  const kitchen = useKitchen();
  const [busy, setBusy] = useState<null | "reading" | "adding">(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ store: string | null; date: string | null; rows: Row[] } | null>(null);
  const ready = mode === "supabase" && Boolean(apiUrl);

  async function pick(source: "camera" | "library") {
    setError(null);
    const perm = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError(source === "camera" ? "Allow the camera to photograph a receipt." : "Allow access to your photos to choose a receipt.");
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.5, base64: true, exif: false };
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.base64) return;
    const mediaType = asset.mimeType === "image/png" ? "image/png" : asset.mimeType === "image/webp" ? "image/webp" : "image/jpeg";
    if (asset.base64.length > 4_600_000) return setError("That photo is too large. Try again a little further away.");
    setBusy("reading");
    try {
      const token = await accessToken();
      const res = await fetch(`${apiUrl}/api/kitchen/receipt`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ mediaType, base64: asset.base64 }),
      });
      const r = (await res.json()) as { ok: boolean; data?: unknown; message?: string };
      if (!r.ok) return setError(r.message ?? "Couldn't read that receipt.");
      const parsed = receiptDraftSchema.safeParse(r.data);
      if (!parsed.success) return setError("The receipt came back in an unexpected shape.");
      setDraft({ store: parsed.data.store, date: parsed.data.date, rows: parsed.data.lines.map((l) => ({ ...l, keep: l.isFood })) });
    } catch {
      setError("Couldn't reach the Kitchen Pantry server.");
    } finally {
      setBusy(null);
    }
  }

  const kept = draft?.rows.filter((r) => r.keep && r.name.trim()) ?? [];
  const label = (code: string) => pantryCategories.find((x) => x.code === code)?.label ?? "Other";

  return (
    <Screen title="Add from a receipt" subtitle="Photograph a grocery receipt. It's read once by the AI assistant and not kept; you choose what goes into your kitchen." showProfile={false}>
      {!ready ? <Notice tone="warning">Reading receipts needs the Kitchen Pantry server and sign-in.</Notice> : null}
      {!draft ? (
        <Card>
          <Body>Flat, in good light, the whole receipt in view.</Body>
          <View className="mt-3 gap-2">
            <Button icon="camera-outline" label={busy === "reading" ? "Reading your receipt…" : "Take a photo"} disabled={!ready || busy !== null} onPress={() => void pick("camera")} />
            <Button variant="secondary" icon="image-outline" label="Choose a photo" disabled={!ready || busy !== null} onPress={() => void pick("library")} />
          </View>
        </Card>
      ) : (
        <>
          <Text className="text-[15px] text-muted">
            {draft.store ?? "Receipt"}
            {draft.date ? ` · ${draft.date}` : ""} · read by AI — check the names before adding.
          </Text>
          {draft.rows.map((row, i) => (
            <View key={i} className={`flex-row items-start gap-3 rounded-2xl bg-surface px-3 py-2.5 ${row.keep ? "" : "opacity-60"}`}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: row.keep }}
                accessibilityLabel={`Add ${row.name}`}
                onPress={() => setDraft({ ...draft, rows: draft.rows.map((r, j) => (j === i ? { ...r, keep: !r.keep } : r)) })}
                className="mt-3 size-11 items-center justify-center"
              >
                <Ionicons name={row.keep ? "checkbox" : "square-outline"} size={24} color={c.foreground} />
              </Pressable>
              <View className="flex-1">
                <Input accessibilityLabel="Item name" value={row.name} maxLength={120} onChangeText={(t) => setDraft({ ...draft, rows: draft.rows.map((r, j) => (j === i ? { ...r, name: t } : r)) })} />
                <Text className="mt-1 text-[13px] text-muted">
                  {row.text}
                  {row.quantity !== null ? ` · ${row.quantity} ${row.unit ?? ""}` : ""} · {label(row.category)}
                  {!row.isFood ? " · not food" : ""}
                </Text>
              </View>
              <Text className="mt-4 text-[15px] text-foreground">{row.priceCents !== null ? formatCents(row.priceCents) : "—"}</Text>
            </View>
          ))}
          <Button
            size="lg"
            label={busy === "adding" ? "Adding…" : `Add ${kept.length} item${kept.length === 1 ? "" : "s"} to My Kitchen`}
            disabled={busy !== null || kept.length === 0}
            onPress={async () => {
              setBusy("adding");
              const purchasedOn = draft.date && draft.date <= kitchen.today ? draft.date : kitchen.today;
              const r = await kitchen.addMany(kept.map((row) => receiptLineToInput(row, purchasedOn)), { source: "receipt" });
              setBusy(null);
              if (r.ok) router.back();
              else setError(r.message);
            }}
          />
          <Button variant="ghost" label="Use a different photo" onPress={() => setDraft(null)} />
        </>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Screen>
  );
}
