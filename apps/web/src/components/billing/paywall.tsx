"use client";

import Link from "next/link";
import { brand } from "@kitchen-pantry/ui-tokens";
import { useProfile } from "@/components/profile/profile-provider";
import { perWeek, yearlyPrice } from "@/lib/billing/price";
import { SubscribeButton } from "./subscribe-button";

/**
 * Shown instead of the app once a free trial (or subscription) has ended and
 * billing is switched on. Profile stays open so people can still subscribe,
 * download their data or delete their account; nothing they saved is lost.
 */
export function Paywall() {
  const { access } = useProfile();
  const lapsed = Boolean(access.subscription && !access.subscription.active);
  return (
    <div className="mx-auto max-w-xl py-6 animate-enter">
      <h1 className="text-[32px] font-bold leading-tight tracking-tight">
        {lapsed ? "Your subscription has ended" : "Your free trial has ended"}
      </h1>
      <p className="mt-3 text-[17px] text-muted">
        Keep planning with {brand.name} for {yearlyPrice} a year{perWeek() ? ` — about ${perWeek()} a week` : ""}. Everything you&apos;ve saved is still here:
        your kitchen, plans, lists and recipes.
      </p>
      <ul className="mt-6 space-y-2 text-[16px]">
        <li>• Weekly meal plans that fit your household, allergies and budget</li>
        <li>• My Kitchen with use-by reminders, and recipes that use it up</li>
        <li>• A shared grocery list, store prices and Smart Cart</li>
        <li>• Cooking mode and the AI cooking assistant</li>
        <li>• One subscription covers everyone in your household</li>
      </ul>
      <SubscribeButton className="mt-8" />
      <p className="mt-4 text-[14px] text-muted">
        Subscribed in the iPhone or Android app? It&apos;s already linked to your account — give it a minute and reload.
        Cancel any time.
      </p>
      <p className="mt-6 text-[15px]">
        <Link href="/profile" className="underline underline-offset-4">Profile</Link> (download your data or delete your account)
        {" · "}
        <Link href="/terms" className="underline underline-offset-4">Terms</Link>
        {" · "}
        <Link href="/privacy" className="underline underline-offset-4">Privacy</Link>
      </p>
    </div>
  );
}
