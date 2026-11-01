"use client";

import { hasStoreLookup } from "@kitchen-pantry/integrations";
import { knownRetailers, priceStatuses } from "@kitchen-pantry/shared-types";
import { ShoppingBasket, Store } from "lucide-react";
import { useProfile } from "@/components/profile/profile-provider";
import { Card, Eyebrow, Hint, PageHeader } from "@/components/ui/card";
import { PriceStatusBadge } from "@/components/ui/price-status";
import { WeekTabs } from "@/components/ui/week-tabs";

export function GroceryView() {
  const { profile } = useProfile();
  const usual = profile.store.usualRetailer;
  const usualName = knownRetailers.find((r) => r.slug === usual)?.name ?? usual;
  const storeLookup = hasStoreLookup(profile.household.country);

  return (
    <div className="animate-enter">
      <PageHeader title="Grocery List" />
      <WeekTabs />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="flex flex-col items-center py-12 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-background text-muted">
            <ShoppingBasket className="size-7" aria-hidden />
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight">Your list is empty</h2>
          <p className="mt-2 max-w-sm text-[16px] text-muted">
            Once you plan a week, every ingredient is combined into one list, grouped by aisle, with what you already
            own taken off.
          </p>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex items-center gap-2">
              <Store className="size-5 text-muted" aria-hidden />
              <Eyebrow>Where you shop</Eyebrow>
            </div>
            <p className="mt-2 text-xl font-bold">{usualName ?? "No store chosen"}</p>
            <Hint className="mt-1">
              {storeLookup
                ? "Live store prices are available for your area."
                : "Live store prices aren't connected yet. Until they are, every price will be clearly marked as an estimate."}
            </Hint>
          </Card>

          <Card>
            <Eyebrow>How prices are labelled</Eyebrow>
            <ul className="mt-3 space-y-3">
              {priceStatuses.map((status) => (
                <li key={status.code} className="flex items-start gap-3">
                  <PriceStatusBadge status={status.code} className="mt-0.5 w-[92px] shrink-0 justify-center" />
                  <span className="text-[15px] leading-snug text-muted">{status.description}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
