import { priceStatuses, type PriceStatus } from "@kitchen-pantry/shared-types";
import { cn } from "@/lib/cn";

const tone: Record<PriceStatus, string> = {
  verified: "bg-price-verified/12 text-price-verified",
  cached: "bg-price-cached/12 text-price-cached",
  estimated: "bg-price-estimated/12 text-price-estimated",
  unavailable: "bg-price-unavailable/15 text-muted",
};

const glyph: Record<PriceStatus, string> = {
  verified: "✓",
  cached: "↻",
  estimated: "≈",
  unavailable: "–",
};

/** Every displayed price carries one of these — an estimate is never shown as verified. */
export function PriceStatusBadge({ status, className }: { status: PriceStatus; className?: string }) {
  const meta = priceStatuses.find((p) => p.code === status)!;
  return (
    <span
      title={meta.description}
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-semibold", tone[status], className)}
    >
      <span aria-hidden>{glyph[status]}</span>
      {meta.label}
    </span>
  );
}
