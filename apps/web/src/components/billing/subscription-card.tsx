"use client";

import { accessSummary, trialDaysLeft } from "@kitchen-pantry/database";
import { useState, useTransition } from "react";
import { openBillingPortalAction } from "@/lib/billing/actions";
import { useProfile } from "@/components/profile/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, Hint } from "@/components/ui/card";
import { yearlyPrice } from "@/lib/billing/price";
import { SubscribeButton } from "./subscribe-button";

/** Profile → Subscription: trial / subscribed / household / ended, and what to do next. */
export function SubscriptionCard({ justSubscribed = false }: { justSubscribed?: boolean }) {
  const { access } = useProfile();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!access.enforced) return null;
  const sub = access.subscription;
  const website = sub?.source === "stripe";
  const store = sub?.source === "app_store" ? "the App Store (iPhone Settings → your name → Subscriptions)" : sub?.source === "play_store" ? "Google Play (Play Store → Payments & subscriptions)" : null;
  return (
    <Card id="subscription" className="lg:col-span-2">
      <Eyebrow>Subscription</Eyebrow>
      <p className="mt-2 text-xl font-bold">{accessSummary(access)}</p>
      {justSubscribed && access.reason !== "subscribed" ? (
        <Hint role="status">Thanks! Your payment is being confirmed — this updates within a minute.</Hint>
      ) : null}
      {access.reason === "trial" ? (
        <Hint>
          Everything is included during the trial. After it, Kitchen Pantry is {yearlyPrice} a year. Subscribe now and billing
          still starts when the trial ends{trialDaysLeft(access) <= 2 ? " (or today, with under 2 days left)" : ""}.
        </Hint>
      ) : null}
      {access.reason === "household" ? <Hint>Someone in your household subscribes, so you&apos;re covered too.</Hint> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {access.reason === "trial" || access.reason === "expired" ? <SubscribeButton /> : null}
        {website && access.reason === "subscribed" ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await openBillingPortalAction();
                if (r && !r.ok) setError(r.message);
              })
            }
          >
            {pending ? "Opening…" : "Manage or cancel"}
          </Button>
        ) : null}
      </div>
      {store && access.reason === "subscribed" ? <Hint>Manage or cancel it in {store}.</Hint> : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
