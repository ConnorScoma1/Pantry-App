"use client";

import { CalendarCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { useNotifications } from "@/lib/planning/use-weekly-planning";

/** Home: the newest unread "plan is ready" notice, with one button to review it. */
export function PlanReadyCard() {
  const n = useNotifications();
  const notice = n.items.find((x) => x.kind === "plan_ready" && !x.readAt);
  if (!notice) return null;
  return (
    <div role="status" className="mb-4 flex flex-col gap-3 rounded-card bg-accent-soft p-5 sm:flex-row sm:items-center">
      <CalendarCheck className="size-7 shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-semibold">{notice.title}</p>
        {notice.body ? <p className="mt-0.5 text-[15px] leading-snug">{notice.body}</p> : null}
      </div>
      <div className="flex shrink-0 gap-2">
        <ButtonLink href={notice.link ?? "/plan"} onClick={() => void n.markRead([notice.id])}>
          Review the plan
        </ButtonLink>
        <button type="button" className="min-h-11 rounded-full px-4 text-[15px] font-semibold text-muted hover:text-foreground" onClick={() => void n.markRead([notice.id])}>
          Later
        </button>
      </div>
    </div>
  );
}
