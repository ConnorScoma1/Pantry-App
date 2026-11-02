import { ActivityCard, PortionCard } from "@/components/household/who-is-eating";
import { todayIso } from "@/lib/use-kitchen";
import { inviteLink, parseInviteToken, type HouseholdMember } from "@kitchen-pantry/database";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Share, Text, View } from "react-native";
import { Button, Field, Input, Notice } from "@/components/controls";
import { PushedPage } from "@/components/recipes/page";
import { Body, Card, CardTitle, Eyebrow } from "@/components/ui";
import { apiUrl } from "@/lib/config";
import { useHousehold } from "@/lib/use-household";

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Web link when the server is configured (works anywhere); otherwise an app link. */
function linkFor(token: string): string {
  return apiUrl ? inviteLink(apiUrl, token) : `kitchenpantry://invite/${token}`;
}

export default function HouseholdScreen() {
  return (
    <PushedPage backLabel="Back">
      <HouseholdContent />
    </PushedPage>
  );
}

function HouseholdContent() {
  const h = useHousehold();
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const say = (r: { ok: boolean; message?: string }, success: string) => setMessage(r.ok ? { tone: "info", text: success } : { tone: "error", text: r.message ?? "Something went wrong." });

  const confirmRemove = (m: HouseholdMember) =>
    Alert.alert(`Remove ${m.displayName}?`, "They'll lose access straight away. Items they added stay on the list.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => say(await h.removeMember(m.userId), `${m.displayName} was removed.`) },
    ]);
  const confirmOwner = (m: HouseholdMember) =>
    Alert.alert(`Make ${m.displayName} the owner?`, "They'll be able to invite and remove people. You'll become a member.", [
      { text: "Cancel", style: "cancel" },
      { text: "Make owner", onPress: async () => say(await h.transferOwnership(m.userId), `${m.displayName} is now the owner.`) },
    ]);
  const confirmLeave = () =>
    Alert.alert("Leave this household?", "You'll go back to your own household. You can rejoin with a new invite.", [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: async () => say(await h.leave(), "You left the household.") },
    ]);

  if (h.mode === "preview") {
    return (
      <View className="gap-4">
        <Text accessibilityRole="header" className="text-[34px] font-bold tracking-tight text-foreground">
          Household
        </Text>
        <Card>
          <CardTitle>Sharing needs accounts</CardTitle>
          <Body>In preview mode everything stays on this device. Connect Supabase (see the README) to invite up to five people.</Body>
        </Card>
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View>
        <Text accessibilityRole="header" className="text-[34px] font-bold tracking-tight text-foreground">
          Household
        </Text>
        <Text className="mt-1 text-[17px] leading-6 text-muted">Share your kitchen, meal plans and grocery list with up to five people.</Text>
      </View>
      {h.error ? <Notice tone="error">{h.error}</Notice> : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <Card>
        <Eyebrow>{h.active?.name ?? "Your household"}</Eyebrow>
        <View className="mt-2">
          {h.members.map((m) => (
            <View key={m.userId} className="border-b border-border py-3 last:border-0">
              <Text className="text-[17px] font-semibold text-foreground">
                {m.displayName}
                {m.isYou ? <Text className="font-normal text-muted"> (you)</Text> : null}
              </Text>
              <Text className="text-[14px] text-muted">
                {m.role === "owner" ? "Owner" : "Member"} · joined {shortDate(m.joinedAt)}
              </Text>
              {h.isOwner && !m.isYou ? (
                <View className="mt-2 flex-row gap-2">
                  <Button variant="secondary" icon="ribbon-outline" label="Make owner" onPress={() => confirmOwner(m)} />
                  <Button variant="danger" icon="person-remove-outline" label="Remove" onPress={() => confirmRemove(m)} />
                </View>
              ) : null}
            </View>
          ))}
        </View>
        {h.you ? <DisplayName current={h.you.displayName} onSave={async (n) => say(await h.setDisplayName(n), "Name updated.")} /> : null}
      </Card>

      {h.isOwner ? <Invite household={h} onMessage={setMessage} /> : null}

      <JoinByLink onJoined={(name) => setMessage({ tone: "info", text: `You joined ${name}.` })} household={h} />

      {h.households.length > 1 ? (
        <Card>
          <Eyebrow>Your households</Eyebrow>
          <View className="mt-3 gap-2">
            {h.households.map((x) => (
              <View key={x.id} className="flex-row items-center justify-between rounded-2xl bg-background px-4 py-3">
                <View className="flex-1">
                  <Text className="font-semibold text-foreground">{x.name}</Text>
                  <Text className="text-[14px] text-muted">
                    {x.memberCount} {x.memberCount === 1 ? "person" : "people"}
                  </Text>
                </View>
                {x.isActive ? (
                  <Text className="font-semibold text-foreground">Showing</Text>
                ) : (
                  <Button variant="secondary" label="Switch" onPress={async () => say(await h.switchHousehold(x.id), `Now showing ${x.name}.`)} />
                )}
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Card>
        <Eyebrow>What&apos;s shared</Eyebrow>
        <Body>Kitchen inventory, weekly meal plans, the grocery list, and household size, budget, equipment and store.</Body>
        <View className="mt-4">
          <Eyebrow>What stays yours</Eyebrow>
        </View>
        <Body>Cooking skill and goals, favourite cuisines and proteins, and your allergies and diet. Plans avoid everyone&apos;s allergies.</Body>
      </Card>

      <ActivityCard />
      <PortionCard today={todayIso()} />

      {h.you && !h.isOwner ? <Button variant="danger" icon="log-out-outline" label="Leave household" onPress={confirmLeave} /> : null}
      {h.isOwner && h.members.length > 1 ? <Body>To leave this household, make someone else the owner first.</Body> : null}
    </View>
  );
}

function DisplayName({ current, onSave }: { current: string; onSave: (name: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);
  if (!editing) {
    return (
      <View className="mt-3">
        <Button
          variant="ghost"
          icon="pencil"
          label="Change the name others see"
          onPress={() => {
            setValue(current);
            setEditing(true);
          }}
        />
      </View>
    );
  }
  return (
    <View className="mt-3 gap-2">
      <Field label="Your name in this household">
        <Input value={value} maxLength={40} onChangeText={setValue} autoFocus />
      </Field>
      <Button
        label="Save"
        disabled={!value.trim()}
        onPress={async () => {
          await onSave(value);
          setEditing(false);
        }}
      />
    </View>
  );
}

function Invite({ household: h, onMessage }: { household: ReturnType<typeof useHousehold>; onMessage: (m: { tone: "info" | "error"; text: string } | null) => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ link: string; token: string; expiresAt: string } | null>(null);
  const pending = h.invites.filter((i) => i.status === "pending");

  async function share(c: { link: string; token: string; expiresAt: string }) {
    await Share.share({
      message: `Join ${h.active?.name ?? "my household"} on Kitchen Pantry to share our meal plans, kitchen and grocery list: ${c.link}\n\nOr paste this code in the app (Profile → Household): ${c.token}\n\nIt works once and expires ${shortDate(c.expiresAt)}.`,
    }).catch(() => {});
  }

  return (
    <Card>
      <Eyebrow>Invite someone</Eyebrow>
      {created ? (
        <View className="mt-2 gap-3">
          <Body>The link works once, only after they sign in, and expires {shortDate(created.expiresAt)}.</Body>
          <Text selectable className="rounded-2xl bg-background px-4 py-3 text-[14px] text-foreground">
            {created.link}
          </Text>
          <Button icon="share-outline" label="Share invite" onPress={() => void share(created)} />
          <Button variant="ghost" label="Done" onPress={() => setCreated(null)} />
        </View>
      ) : h.seatsLeft === 0 ? (
        <Body>The household is full (6 people, counting open invites).</Body>
      ) : (
        <View className="mt-3 gap-3">
          <Field label="Their email (optional)" hint="Limits the invite to that account.">
            <Input value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} />
          </Field>
          <Button
            label={busy ? "Creating…" : "Create invite"}
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              const r = await h.createInvite(email.trim() || null);
              setBusy(false);
              if (!r.ok) {
                onMessage({ tone: "error", text: r.message });
                return;
              }
              onMessage(null);
              const c = { link: linkFor(r.data.token), token: r.data.token, expiresAt: r.data.expiresAt };
              setCreated(c);
              setEmail("");
              void share(c);
            }}
          />
          <Body>
            {h.seatsLeft} {h.seatsLeft === 1 ? "spot" : "spots"} left. Invites expire after 7 days.
          </Body>
        </View>
      )}
      {pending.length > 0 ? (
        <View className="mt-4 border-t border-border pt-3">
          <Text className="text-[15px] font-semibold text-foreground">Open invites</Text>
          {pending.map((i) => (
            <View key={i.id} className="mt-2 flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-[15px] text-foreground" numberOfLines={1}>
                {i.email ?? "Link invite"} <Text className="text-muted">· expires {shortDate(i.expiresAt)}</Text>
              </Text>
              <Button
                variant="ghost"
                label="Cancel"
                onPress={async () => {
                  const r = await h.revokeInvite(i.id);
                  onMessage(r.ok ? { tone: "info", text: "Invite cancelled." } : { tone: "error", text: r.message });
                }}
              />
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function JoinByLink({ household: h, onJoined }: { household: ReturnType<typeof useHousehold>; onJoined: (name: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <Eyebrow>Join a household</Eyebrow>
      <Body>Got an invite? Paste the link or code.</Body>
      <View className="mt-3 gap-2">
        <Input value={value} onChangeText={setValue} placeholder="Invite link or code" autoCapitalize="none" autoCorrect={false} invalid={Boolean(error)} />
        {error ? (
          <Text accessibilityRole="alert" className="text-[15px] text-danger">
            {error}
          </Text>
        ) : null}
        <Button
          variant="secondary"
          label="Continue"
          disabled={!value.trim()}
          onPress={() => {
            const token = parseInviteToken(value);
            if (!token) {
              setError("That doesn't look like an invite link or code.");
              return;
            }
            setError(null);
            setValue("");
            router.push(`/invite/${token}`);
          }}
        />
      </View>
    </Card>
  );
}
