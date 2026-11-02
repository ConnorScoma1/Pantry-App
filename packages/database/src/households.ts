import { z } from "zod";
import { dbFailure, type DbError, type Result, type SupabaseLike } from "./client";

/**
 * Shared households: members, invitations, roles. Shared by web and mobile.
 * Everything goes through database functions that check who's asking
 * (see supabase/migrations/…_shared_household.sql); this layer validates
 * input and turns database errors into plain messages.
 */

export type HouseholdRole = "owner" | "member";

export interface HouseholdMember {
  userId: string;
  displayName: string;
  role: HouseholdRole;
  joinedAt: string;
  isYou: boolean;
}

export interface HouseholdSummary {
  id: string;
  name: string;
  role: HouseholdRole;
  isActive: boolean;
  memberCount: number;
}

export type InviteStatus = "pending" | "accepted" | "expired" | "revoked";

export interface HouseholdInvite {
  id: string;
  email: string | null;
  createdAt: string;
  expiresAt: string;
  status: InviteStatus;
}

export type InviteCheck = "valid" | "invalid" | "expired" | "used" | "revoked" | "already_member" | "wrong_account" | "full";

export interface InviteDetails {
  householdName: string | null;
  invitedBy: string | null;
  expiresAt: string | null;
  status: InviteCheck;
}

export interface CreatedInvite {
  id: string;
  /** Shown once; only its hash is stored. */
  token: string;
  expiresAt: string;
}

export const MAX_HOUSEHOLD_SIZE = 6;

export interface HouseholdRepository {
  members(): Promise<Result<HouseholdMember[]>>;
  households(): Promise<Result<HouseholdSummary[]>>;
  /** Owner only: this household's invites, newest first. */
  invites(): Promise<Result<HouseholdInvite[]>>;
  createInvite(input: unknown): Promise<Result<CreatedInvite>>;
  revokeInvite(inviteId: unknown): Promise<Result<null>>;
  inviteDetails(tokenOrLink: unknown): Promise<Result<InviteDetails>>;
  acceptInvite(tokenOrLink: unknown): Promise<Result<{ householdId: string }>>;
  removeMember(userId: unknown): Promise<Result<null>>;
  leave(): Promise<Result<null>>;
  transferOwnership(userId: unknown): Promise<Result<null>>;
  switchHousehold(householdId: unknown): Promise<Result<null>>;
  setDisplayName(name: unknown): Promise<Result<null>>;
  rename(householdId: unknown, name: unknown): Promise<Result<null>>;
}

// ---------------------------------------------------------------------------
// Tokens and links
// ---------------------------------------------------------------------------
const TOKEN = /^[0-9a-f]{64}$/;

/** Accepts a raw token or any link ending in /invite/<token>. */
export function parseInviteToken(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  const match = /(?:^|\/invite\/)([0-9a-fA-F]{64})(?:[/?#].*)?$/.exec(trimmed);
  const token = match?.[1]?.toLowerCase() ?? null;
  return token && TOKEN.test(token) ? token : null;
}

export function inviteLink(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/invite/${token}`;
}

/** A mailto: link so the inviter can send the invite from their own email app. */
export function inviteEmailHref(options: { to: string | null; link: string; householdName: string; inviterName: string; expiresAt: string; now?: Date }): string {
  const days = Math.max(1, Math.round((Date.parse(options.expiresAt) - (options.now ?? new Date()).getTime()) / 86_400_000));
  const subject = `Join ${options.householdName} on Kitchen Pantry`;
  const body = [
    `${options.inviterName} invited you to share meal plans, the kitchen inventory and the grocery list on Kitchen Pantry.`,
    "",
    `Open this link to join (you'll sign in or create an account first):`,
    options.link,
    "",
    `The link expires in ${days} ${days === 1 ? "day" : "days"} and works once.`,
  ].join("\n");
  const params = new URLSearchParams({ subject, body }).toString().replace(/\+/g, "%20");
  return `mailto:${encodeURIComponent(options.to ?? "")}?${params}`;
}

export function inviteStatus(row: { accepted_at: string | null; revoked_at: string | null; expires_at: string }, now = new Date()): InviteStatus {
  if (row.accepted_at) return "accepted";
  if (row.revoked_at) return "revoked";
  if (Date.parse(row.expires_at) <= now.getTime()) return "expired";
  return "pending";
}

// ---------------------------------------------------------------------------
// Errors: the database functions raise plain-English messages for expected
// problems (expired invite, household full…). Anything else is generic.
// ---------------------------------------------------------------------------
const FRIENDLY_CODES = new Set(["P0001", "42501", "22023", "28000"]);
function friendly(context: string, error: DbError, fallback: string): Result<never> {
  if (error.code && FRIENDLY_CODES.has(error.code) && error.message) {
    return { ok: false, message: error.message };
  }
  return dbFailure(context, error, fallback);
}

const uuid = z.uuid();
const inviteInput = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email())
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  validDays: z.number().int().min(1).max(14).default(7),
});
const displayName = z.string().trim().min(1, "Enter a name").max(40, "Use 40 characters or fewer");
const householdName = z.string().trim().min(1, "Enter a name").max(80, "Use 80 characters or fewer");

const SOMETHING_WRONG = "Something went wrong. Please try again.";

export function createSupabaseHouseholdRepository(db: SupabaseLike): HouseholdRepository {
  async function call(fn: string, args: Record<string, unknown> | undefined, context: string): Promise<Result<unknown>> {
    const { data, error } = await db.rpc(fn, args);
    if (error) return friendly(context, error, SOMETHING_WRONG);
    return { ok: true, data };
  }
  const done = (r: Result<unknown>): Result<null> => (r.ok ? { ok: true, data: null } : r);

  return {
    async members() {
      const r = await call("household_member_list", undefined, "household members");
      if (!r.ok) return r;
      const rows = (r.data ?? []) as Array<{ user_id: string; display_name: string; role: HouseholdRole; joined_at: string; is_you: boolean }>;
      return { ok: true, data: rows.map((m) => ({ userId: m.user_id, displayName: m.display_name, role: m.role, joinedAt: m.joined_at, isYou: m.is_you })) };
    },
    async households() {
      const r = await call("my_households", undefined, "my households");
      if (!r.ok) return r;
      const rows = (r.data ?? []) as Array<{ household_id: string; name: string; role: HouseholdRole; is_active: boolean; member_count: number }>;
      return { ok: true, data: rows.map((h) => ({ id: h.household_id, name: h.name, role: h.role, isActive: h.is_active, memberCount: h.member_count })) };
    },
    async invites() {
      const { data, error } = await db
        .from("household_invites")
        .select("id, email, created_at, expires_at, accepted_at, revoked_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return dbFailure("household invites", error, SOMETHING_WRONG);
      const rows = data as Array<{ id: string; email: string | null; created_at: string; expires_at: string; accepted_at: string | null; revoked_at: string | null }>;
      return { ok: true, data: rows.map((i) => ({ id: i.id, email: i.email, createdAt: i.created_at, expiresAt: i.expires_at, status: inviteStatus(i) })) };
    },
    async createInvite(input) {
      const parsed = inviteInput.safeParse(input ?? {});
      if (!parsed.success) return { ok: false, message: "That email address doesn't look right." };
      const r = await call("create_household_invite", { invite_email: parsed.data.email ?? null, valid_days: parsed.data.validDays }, "create invite");
      if (!r.ok) return r;
      const row = (Array.isArray(r.data) ? r.data[0] : r.data) as { invite_id: string; token: string; expires_at: string } | undefined;
      if (!row || !TOKEN.test(row.token)) return { ok: false, message: SOMETHING_WRONG };
      return { ok: true, data: { id: row.invite_id, token: row.token, expiresAt: row.expires_at } };
    },
    async revokeInvite(inviteId) {
      const id = uuid.safeParse(inviteId);
      if (!id.success) return { ok: false, message: "That invite no longer exists." };
      return done(await call("revoke_household_invite", { target_invite: id.data }, "revoke invite"));
    },
    async inviteDetails(tokenOrLink) {
      const token = parseInviteToken(tokenOrLink);
      if (!token) return { ok: true, data: { householdName: null, invitedBy: null, expiresAt: null, status: "invalid" } };
      const r = await call("household_invite_details", { invite_token: token }, "invite details");
      if (!r.ok) return r;
      const row = (Array.isArray(r.data) ? r.data[0] : r.data) as
        | { household_name: string | null; invited_by: string | null; expires_at: string | null; status: InviteCheck }
        | undefined;
      if (!row) return { ok: true, data: { householdName: null, invitedBy: null, expiresAt: null, status: "invalid" } };
      return { ok: true, data: { householdName: row.household_name, invitedBy: row.invited_by, expiresAt: row.expires_at, status: row.status } };
    },
    async acceptInvite(tokenOrLink) {
      const token = parseInviteToken(tokenOrLink);
      if (!token) return { ok: false, message: "That invite link isn't valid." };
      const r = await call("accept_household_invite", { invite_token: token }, "accept invite");
      if (!r.ok) return r;
      return { ok: true, data: { householdId: String(r.data) } };
    },
    async removeMember(userId) {
      const id = uuid.safeParse(userId);
      if (!id.success) return { ok: false, message: "That person isn't a member of this household." };
      return done(await call("remove_household_member", { member: id.data }, "remove member"));
    },
    async leave() {
      return done(await call("leave_household", undefined, "leave household"));
    },
    async transferOwnership(userId) {
      const id = uuid.safeParse(userId);
      if (!id.success) return { ok: false, message: "Choose a current member." };
      return done(await call("transfer_household_ownership", { new_owner: id.data }, "transfer ownership"));
    },
    async switchHousehold(householdId) {
      const id = uuid.safeParse(householdId);
      if (!id.success) return { ok: false, message: "You're not a member of that household." };
      return done(await call("switch_household", { target_household: id.data }, "switch household"));
    },
    async setDisplayName(name) {
      const parsed = displayName.safeParse(name);
      if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Enter a name" };
      return done(await call("set_display_name", { new_name: parsed.data }, "set display name"));
    },
    async rename(householdId, name) {
      const id = uuid.safeParse(householdId);
      const parsed = householdName.safeParse(name);
      if (!id.success || !parsed.success) return { ok: false, message: parsed.success ? SOMETHING_WRONG : parsed.error.issues[0]?.message ?? "Enter a name" };
      const { error } = await db.from("households").update({ name: parsed.data }).eq("id", id.data);
      if (error) return dbFailure("rename household", error, SOMETHING_WRONG);
      return { ok: true, data: null };
    },
  };
}

/** Preview mode has no accounts, so sharing explains what it needs. */
export function createPreviewHouseholdRepository(): HouseholdRepository {
  const needsAccount: Result<never> = {
    ok: false,
    message: "Sharing needs accounts. Connect Supabase (see the README) to invite people to your household.",
  };
  const you: HouseholdMember = { userId: "preview", displayName: "You", role: "owner", joinedAt: new Date(0).toISOString(), isYou: true };
  return {
    members: async () => ({ ok: true, data: [you] }),
    households: async () => ({ ok: true, data: [{ id: "preview", name: "My household", role: "owner", isActive: true, memberCount: 1 }] }),
    invites: async () => ({ ok: true, data: [] }),
    createInvite: async () => needsAccount,
    revokeInvite: async () => needsAccount,
    inviteDetails: async () => needsAccount,
    acceptInvite: async () => needsAccount,
    removeMember: async () => needsAccount,
    leave: async () => needsAccount,
    transferOwnership: async () => needsAccount,
    switchHousehold: async () => needsAccount,
    setDisplayName: async () => needsAccount,
    rename: async () => needsAccount,
  };
}
