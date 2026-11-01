import type { UrgencyResult } from "@kitchen-pantry/inventory-engine";
import { cn } from "@/lib/cn";

/** Use-by status pill. Text always carries the meaning; colour only reinforces it. */
export function UrgencyBadge({ urgency, className }: { urgency: UrgencyResult; className?: string }) {
  const { urgency: level, daysLeft } = urgency;
  let label: string | null = null;
  let tone = "";
  switch (level) {
    case "past_date":
      label = "Past date";
      tone = "bg-danger/10 text-danger";
      break;
    case "today":
      label = "Use today";
      tone = "bg-warning/15 text-warning";
      break;
    case "soon":
      label = daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;
      tone = "bg-warning/15 text-warning";
      break;
    case "this_week":
      label = `${daysLeft} days left`;
      tone = "bg-surface-strong text-muted";
      break;
    default:
      return null;
  }
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold", tone, className)}>
      {label}
    </span>
  );
}
