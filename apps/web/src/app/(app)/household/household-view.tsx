"use client";

import { inviteEmailHref, inviteLink, type HouseholdMember } from "@kitchen-pantry/database";
import { Check, Copy, Crown, Link2, LogOut, Mail, Pencil, Share2, UserMinus, X } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Avatar } from "@/components/household/avatar";
import { ActivityCard, PortionCard } from "@/components/household/activity";
import { useProfile } from "@/components/profile/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, Hint, PageHeader } from "@/components/ui/card";
import { TextInput } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { useHousehold } from "@/lib/household/use-household";

type Confirm =
  | { kind: "remove"; member: HouseholdMember }
  | { kind: "owner"; member: HouseholdMember }
  | { kind: "leave" }
  | null;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function HouseholdView() {
  const { mode } = useProfile();
  const h = useHousehold();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>, success?: string) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setMessage(r.ok ? (success ?? null) : (r.message ?? "Something went wrong."));
    return r.ok;
  }

  if (mode === "preview") {
    return (
      <div className="animate-enter">
        <PageHeader title="Household" />
        <Card>
          <p className="text-xl font-bold">Sharing needs accounts</p>
          <Hint>
            In preview mode everything stays in this browser. Connect Supabase (see the README) to invite up to five people to share
            your kitchen, meal plans and grocery list.
          </Hint>
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-enter">
      <PageHeader title="Household" subtitle="Share your kitchen, meal plans and grocery list with up to five other people." />

      {h.error ? (
        <p role="alert" className="mb-4 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">
          {h.error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <NameCard
            name={h.active?.name ?? ""}
            canEdit={!h.loading}
            onSave={(name) => run(() => h.rename(name), "Household renamed.")}
          />

          <Card>
            <Eyebrow>People</Eyebrow>
            {h.loading ? (
              <div className="mt-4 h-32 animate-pulse rounded-2xl bg-background" />
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {h.members.map((m) => (
                  <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
                    <Avatar name={m.displayName} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] font-semibold">
                        {m.displayName}
                        {m.isYou ? <span className="font-normal text-muted"> (you)</span> : null}
                      </p>
                      <p className="text-[14px] text-muted">
                        {m.role === "owner" ? "Owner" : "Member"} · joined {shortDate(m.joinedAt)}
                      </p>
                    </div>
                    {h.isOwner && !m.isYou ? (
                      <div className="flex gap-1.5">
                        <Button variant="ghost" className="px-3" onClick={() => setConfirm({ kind: "owner", member: m })} icon={<Crown className="size-4" aria-hidden />}>
                          Make owner
                        </Button>
                        <Button variant="ghost" className="px-3 text-danger" onClick={() => setConfirm({ kind: "remove", member: m })} icon={<UserMinus className="size-4" aria-hidden />}>
                          Remove
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {h.you ? <DisplayName current={h.you.displayName} onSave={(n) => run(() => h.setDisplayName(n), "Name updated.")} /> : null}
          </Card>

          {h.isOwner ? <InviteCard household={h} onMessage={setMessage} /> : null}

          {h.households.length > 1 ? (
            <Card>
              <Eyebrow>Your households</Eyebrow>
              <Hint className="mt-1">You can belong to more than one. The app shows one at a time.</Hint>
              <ul className="mt-3 space-y-2">
                {h.households.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 rounded-2xl bg-background px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{x.name}</p>
                      <p className="text-[14px] text-muted">
                        {x.memberCount} {x.memberCount === 1 ? "person" : "people"} · {x.role === "owner" ? "owner" : "member"}
                      </p>
                    </div>
                    {x.isActive ? (
                      <span className="inline-flex items-center gap-1 text-[15px] font-semibold">
                        <Check className="size-4" aria-hidden /> Showing
                      </span>
                    ) : (
                      <Button variant="secondary" disabled={busy} onClick={() => run(() => h.switchHousehold(x.id), `Now showing ${x.name}.`)}>
                        Switch
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <Eyebrow>What&apos;s shared</Eyebrow>
            <ul className="mt-3 space-y-2 text-[16px]">
              <li>Kitchen inventory</li>
              <li>Weekly meal plans</li>
              <li>The grocery list (live)</li>
              <li>Household size, budget, equipment and store</li>
            </ul>
            <Eyebrow className="mt-5">What stays yours</Eyebrow>
            <ul className="mt-3 space-y-2 text-[16px]">
              <li>Cooking skill and goals</li>
              <li>Favourite cuisines and proteins</li>
              <li>Your allergies and diet choices</li>
            </ul>
            <Hint>
              Meal plans avoid everyone&apos;s allergies and restrictions. Others see the household&apos;s combined list, not a
              per-person breakdown.
            </Hint>
          </Card>

          {h.you && !h.isOwner ? (
            <Card>
              <Eyebrow>Leave</Eyebrow>
              <Hint className="mt-1">You&apos;ll lose access to this household&apos;s kitchen, plans and list.</Hint>
              <Button variant="danger" className="mt-4" onClick={() => setConfirm({ kind: "leave" })} icon={<LogOut className="size-4" aria-hidden />}>
                Leave household
              </Button>
            </Card>
          ) : h.isOwner && h.members.length > 1 ? (
            <Hint className="px-1">To leave this household, make someone else the owner first.</Hint>
          ) : null}
        </div>
      </div>

      {message ? (
        <p role="status" className="mt-4 rounded-2xl bg-surface px-4 py-3 text-[15px]">
          {message}
        </p>
      ) : null}

      <Sheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm?.kind === "remove"
            ? `Remove ${confirm.member.displayName}?`
            : confirm?.kind === "owner"
              ? `Make ${confirm.member.displayName} the owner?`
              : "Leave this household?"
        }
        description={
          confirm?.kind === "remove"
            ? "They'll lose access straight away. Items they added stay on the list."
            : confirm?.kind === "owner"
              ? "They'll be able to invite and remove people. You'll become a member."
              : "You'll go back to your own household. You can rejoin with a new invite."
        }
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={confirm?.kind === "owner" ? "primary" : "danger"}
              className="flex-1"
              disabled={busy}
              onClick={async () => {
                const c = confirm;
                if (!c) return;
                const ok =
                  c.kind === "remove"
                    ? await run(() => h.removeMember(c.member.userId), `${c.member.displayName} was removed.`)
                    : c.kind === "owner"
                      ? await run(() => h.transferOwnership(c.member.userId), `${c.member.displayName} is now the owner.`)
                      : await run(() => h.leave(), "You left the household.");
                if (ok) setConfirm(null);
              }}
            >
              {confirm?.kind === "remove" ? "Remove" : confirm?.kind === "owner" ? "Make owner" : "Leave"}
            </Button>
          </div>
        }
      >
        <span />
      </Sheet>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <ActivityCard />
        <PortionCard />
      </div>
    </div>
  );
}

function NameCard({ name, canEdit, onSave }: { name: string; canEdit: boolean; onSave: (n: string) => Promise<boolean> }) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  return (
    <Card>
      <Eyebrow>Household name</Eyebrow>
      {editing ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            if (await onSave(value)) setEditing(false);
          }}
        >
          <label htmlFor={id} className="sr-only">
            Household name
          </label>
          <TextInput id={id} value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} />
          <Button type="submit" className="h-13 shrink-0" disabled={!value.trim()}>
            Save
          </Button>
        </form>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-2xl font-bold tracking-tight">{name || "…"}</p>
          {canEdit ? (
            <Button
              variant="ghost"
              className="px-3"
              onClick={() => {
                setValue(name);
                setEditing(true);
              }}
              icon={<Pencil className="size-4" aria-hidden />}
            >
              Rename
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function DisplayName({ current, onSave }: { current: string; onSave: (n: string) => Promise<boolean> }) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(current);
          setEditing(true);
        }}
        className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-muted hover:text-foreground"
      >
        <Pencil className="size-4" aria-hidden /> Change the name others see for you
      </button>
    );
  }
  return (
    <form
      className="mt-3"
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        if (await onSave(value)) setEditing(false);
      }}
    >
      <label htmlFor={id} className="mb-1.5 block text-[15px] font-medium">
        Your name in this household
      </label>
      <div className="flex gap-2">
        <TextInput id={id} value={value} maxLength={40} onChange={(e) => setValue(e.target.value)} />
        <Button type="submit" className="h-13 shrink-0" disabled={!value.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}

function InviteCard({ household: h, onMessage }: { household: ReturnType<typeof useHousehold>; onMessage: (m: string | null) => void }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [created, setCreated] = useState<{ link: string; email: string | null; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = h.invites.filter((i) => i.status === "pending");

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await h.createInvite(email.trim() || null);
    setBusy(false);
    if (!r.ok) {
      onMessage(r.message);
      return;
    }
    onMessage(null);
    setCopied(false);
    setCreated({ link: inviteLink(window.location.origin, r.data.token), email: email.trim().toLowerCase() || null, expiresAt: r.data.expiresAt });
    setEmail("");
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
    } catch {
      onMessage("Couldn't copy. Select the link and copy it instead.");
    }
  }

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <Card>
      <Eyebrow>Invite someone</Eyebrow>
      {h.seatsLeft === 0 && !created ? (
        <Hint className="mt-1">The household is full (6 people, counting open invites). Cancel an invite or remove someone to add another.</Hint>
      ) : created ? (
        <div className="mt-3">
          <p className="text-[16px]">
            {created.email ? `Send this link to ${created.email}.` : "Send this link to the person you're inviting."} It works once, only after they
            sign in, and expires {shortDate(created.expiresAt)}.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-background p-2 pl-4">
            <Link2 className="size-4 shrink-0 text-muted" aria-hidden />
            <input
              readOnly
              aria-label="Invite link"
              value={created.link}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 truncate bg-transparent text-[15px] outline-none"
            />
            <Button variant="secondary" onClick={copy} icon={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={inviteEmailHref({
                to: created.email,
                link: created.link,
                householdName: h.active?.name ?? "my household",
                inviterName: h.you?.displayName ?? "Someone",
                expiresAt: created.expiresAt,
              })}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-background px-5 text-[15px] font-semibold hover:bg-surface"
            >
              <Mail className="size-4" aria-hidden /> Email it
            </a>
            {canShare ? (
              <Button
                variant="secondary"
                icon={<Share2 className="size-4" aria-hidden />}
                onClick={() => void navigator.share({ title: "Join my household on Kitchen Pantry", url: created.link }).catch(() => {})}
              >
                Share
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setCreated(null)}>
              Done
            </Button>
          </div>
          <Hint>Kitchen Pantry doesn&apos;t send email itself — &ldquo;Email it&rdquo; opens your own mail app.</Hint>
        </div>
      ) : (
        <form onSubmit={create} className="mt-3">
          <label htmlFor={id} className="mb-1.5 block text-[15px] font-medium">
            Their email <span className="font-normal text-muted">(optional — limits the link to that account)</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <TextInput id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="off" maxLength={254} />
            <Button type="submit" className="h-13 shrink-0" disabled={busy}>
              {busy ? "Creating…" : "Create invite link"}
            </Button>
          </div>
          <Hint>
            {h.seatsLeft} {h.seatsLeft === 1 ? "spot" : "spots"} left. Links expire after 7 days and work once.
          </Hint>
        </form>
      )}

      {pending.length > 0 ? (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-[15px] font-semibold">Open invites</p>
          <ul className="mt-2 space-y-1.5">
            {pending.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 text-[15px]">
                <span className="min-w-0 truncate">
                  {i.email ?? "Link invite"} <span className="text-muted">· expires {shortDate(i.expiresAt)}</span>
                </span>
                <Button
                  variant="ghost"
                  className="shrink-0 px-3"
                  onClick={async () => {
                    const r = await h.revokeInvite(i.id);
                    onMessage(r.ok ? "Invite cancelled. The link no longer works." : r.message);
                  }}
                  icon={<X className="size-4" aria-hidden />}
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
