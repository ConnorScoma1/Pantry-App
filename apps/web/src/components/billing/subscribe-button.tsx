"use client";

import { useState, useTransition } from "react";
import { startCheckoutAction } from "@/lib/billing/actions";
import { Button } from "@/components/ui/button";
import { yearlyPrice } from "@/lib/billing/price";

/** Opens Stripe Checkout (payment happens on Stripe's page, never here). */
export function SubscribeButton({ label = `Subscribe — ${yearlyPrice} a year`, className }: { label?: string; className?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={className}>
      <Button
        size="lg"
        className="w-full sm:w-auto"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await startCheckoutAction();
            if (r && !r.ok) setError(r.message);
          })
        }
      >
        {pending ? "Opening checkout…" : label}
      </Button>
      {error ? (
        <p role="alert" className="mt-3 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
