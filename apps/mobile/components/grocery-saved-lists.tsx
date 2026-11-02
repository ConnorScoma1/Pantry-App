import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Input } from "@/components/controls";
import { Body, Card, Eyebrow } from "@/components/ui";
import type { useSavedLists } from "@/lib/use-saved-lists";

/** Saved lists (spec 01 §9): keep the list under a name and add it back in one tap. */
export function SavedListsCard({ saved, onMessage }: { saved: ReturnType<typeof useSavedLists>; onMessage: (m: string) => void }) {
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <Card>
      <Eyebrow>Saved lists</Eyebrow>
      {saved.loading ? null : saved.lists.length === 0 ? (
        <Body>Save the things you buy every week, then add them back in one tap.</Body>
      ) : (
        <View className="mt-3 gap-2">
          {saved.lists.map((l) => (
            <View key={l.id} className="rounded-2xl bg-background px-4 py-3">
              {renaming?.id === l.id ? (
                <View className="gap-2">
                  <Input accessibilityLabel="New name" value={renaming.name} maxLength={60} autoFocus onChangeText={(t) => setRenaming({ id: l.id, name: t })} />
                  <View className="flex-row gap-2">
                    <Button
                      label="Save"
                      onPress={async () => {
                        const r = await saved.rename(l.id, renaming.name);
                        if (r.ok) setRenaming(null);
                        else onMessage(r.message);
                      }}
                    />
                    <Button label="Cancel" variant="ghost" onPress={() => setRenaming(null)} />
                  </View>
                </View>
              ) : (
                <>
                  <View className="flex-row items-center gap-3">
                    <View className="flex-1">
                      <Text numberOfLines={1} className="text-[16px] font-semibold text-foreground">
                        {l.name}
                      </Text>
                      <Text numberOfLines={1} className="text-[14px] text-muted">
                        {l.items.length} item{l.items.length === 1 ? "" : "s"} · {l.items.slice(0, 3).map((i) => i.name).join(", ")}
                        {l.items.length > 3 ? "…" : ""}
                      </Text>
                    </View>
                    <Button
                      variant="secondary"
                      icon="add"
                      label={saved.busy === l.id ? "Adding…" : "Add"}
                      onPress={async () => {
                        if (saved.busy) return;
                        const r = await saved.addToList(l.id);
                        onMessage(r.ok ? (r.data.added === 0 ? `Everything from “${l.name}” is already on the list.` : `Added ${r.data.added} item${r.data.added === 1 ? "" : "s"} from “${l.name}”.`) : r.message);
                      }}
                    />
                  </View>
                  <View className="mt-1 flex-row gap-5">
                    <Pressable accessibilityRole="button" onPress={() => setRenaming({ id: l.id, name: l.name })} className="min-h-10 justify-center">
                      <Text className="text-[14px] font-semibold text-muted">Rename</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={async () => {
                        if (confirmDelete !== l.id) return setConfirmDelete(l.id);
                        setConfirmDelete(null);
                        const r = await saved.remove(l.id);
                        if (!r.ok) onMessage(r.message);
                      }}
                      className="min-h-10 justify-center"
                    >
                      <Text className={`text-[14px] font-semibold ${confirmDelete === l.id ? "text-danger" : "text-muted"}`}>{confirmDelete === l.id ? "Tap again to delete" : "Delete"}</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          ))}
        </View>
      )}
      {saved.canSave ? (
        <View className="mt-4 gap-2">
          <Text className="text-[15px] font-semibold text-foreground">Save this list as</Text>
          <Input accessibilityLabel="Save this list as" value={name} maxLength={60} placeholder="e.g. Weekly basics" onChangeText={setName} />
          <Button
            icon="bookmark-outline"
            label={saved.busy === "save" ? "Saving…" : "Save list"}
            onPress={async () => {
              if (!name.trim() || saved.busy) return;
              const r = await saved.save(name);
              if (r.ok) {
                onMessage(`Saved “${name.trim()}”. Saving again under the same name updates it.`);
                setName("");
              } else onMessage(r.message);
            }}
          />
          <Text className="text-[13px] leading-5 text-muted">Saves each item once — not whether it&apos;s been bought. Your household can use it too.</Text>
        </View>
      ) : null}
    </Card>
  );
}
