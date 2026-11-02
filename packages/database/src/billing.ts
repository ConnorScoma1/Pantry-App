import type { AccessStatus } from "@kitchen-pantry/shared-types";
import { z } from "zod";
import type { SupabaseLike } from "./client";

/**
 * Subscription access (migration …2800). Reading never locks anyone out by
 * mistake: if the status can't be read (migration not applied, network
 * error), the app treats billing as off. Paid features that cost money (AI)
 * are enforced in the database itself, not here.
 */
export const OPEN_ACCESS: AccessStatus = { enforced: false, access: true, reason: "trial", trialEndsAt: null, trialDays: 14, subscription: null };

const accessSchema = z.object({
  enforced: z.boolean(),
  access: z.boolean(),
  reason: z.enum(["trial", "subscribed", "household", "expired"]),
  trialEndsAt: z.string().nullable(),
  trialDays: z.number().int().min(0).max(90),
  subscription: z
    .object({
      source: z.enum(["stripe", "app_store", "play_store", "revenuecat", "grant"]),
      status: z.string().max(40),
      expiresAt: z.string().nullable(),
      willRenew: z.boolean(),
      active: z.boolean(),
    })
    .nullable(),
});

export function parseAccess(raw: unknown): AccessStatus {
  const r = accessSchema.safeParse(raw);
  return r.success ? r.data : OPEN_ACCESS;
}

export async function loadAccess(db: SupabaseLike): Promise<AccessStatus> {
  const { data, error } = await db.rpc("my_access");
  if (error) {
    if (error.code !== "PGRST202") console.error("[billing] my_access failed", { code: error.code });
    return OPEN_ACCESS;
  }
  return parseAccess(data);
}

/** Whole days left in the trial (0 when it's over), for "6 days left". */
export function trialDaysLeft(access: AccessStatus, now = new Date()): number {
  if (!access.trialEndsAt) return 0;
  return Math.max(0, Math.ceil((Date.parse(access.trialEndsAt) - now.getTime()) / 86_400_000));
}

/** "Subscribed through the App Store until 3 Nov 2027" etc. — plain words for Profile. */
export function accessSummary(access: AccessStatus, now = new Date()): string {
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "");
  const where = (s: AccessStatus["subscription"]) =>
    s?.source === "app_store" ? " through the App Store" : s?.source === "play_store" ? " through Google Play" : s?.source === "stripe" ? " on the website" : "";
  switch (access.reason) {
    case "subscribed": {
      const s = access.subscription;
      return s?.willRenew ? `Subscribed${where(s)}. Renews ${fmt(s.expiresAt)}.` : `Subscribed${where(s)} until ${fmt(s?.expiresAt ?? null)}. It won't renew.`;
    }
    case "household":
      return "Covered by your household's subscription.";
    case "trial": {
      const left = trialDaysLeft(access, now);
      return `Free trial: ${left} day${left === 1 ? "" : "s"} left (until ${fmt(access.trialEndsAt)}).`;
    }
    case "expired":
      return access.subscription && !access.subscription.active
        ? `Your subscription ended ${fmt(access.subscription.expiresAt)}.`
        : "Your free trial has ended.";
  }
}
