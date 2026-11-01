import { formatQuantity, remainingLabel, type KitchenItemView } from "@kitchen-pantry/inventory-engine";
import { labelFor, storageLocations } from "@kitchen-pantry/shared-types";
import { ChevronRight } from "lucide-react";
import { UrgencyBadge } from "./urgency-badge";

export function ItemRow({
  view,
  onOpen,
  showLocation = true,
}: {
  view: KitchenItemView;
  onOpen: () => void;
  showLocation?: boolean;
}) {
  const { item, urgency } = view;
  const details = [
    formatQuantity(item.quantity, item.unit),
    remainingLabel(item.estimatedRemainingPct),
    showLocation ? labelFor(storageLocations, item.storageLocation) : null,
    item.isStaple && item.quantity === null ? "In stock" : null,
  ].filter(Boolean);

  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-strong/60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-medium">{item.name}</span>
          {details.length > 0 ? <span className="block truncate text-[15px] text-muted">{details.join(" · ")}</span> : null}
        </span>
        <UrgencyBadge urgency={urgency} />
        <ChevronRight className="size-5 shrink-0 text-subtle" aria-hidden />
        <span className="sr-only">Edit {item.name}</span>
      </button>
    </li>
  );
}
