"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useNotifications } from "@/lib/planning/use-weekly-planning";

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Next week's plan is ready" and future notices. Only this person's own. */
export function NotificationBell({ align = "right" }: { align?: "left" | "right" }) {
  const n = useNotifications();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={n.unread > 0 ? `Notifications, ${n.unread} new` : "Notifications"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={cn("relative grid size-11 place-items-center rounded-full transition-colors", open ? "bg-surface-strong text-foreground" : "text-muted hover:bg-surface")}
      >
        <Bell className="size-[22px]" strokeWidth={1.75} aria-hidden />
        {n.unread > 0 ? (
          <span aria-hidden className="absolute top-1.5 right-1.5 grid min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[11px] leading-[18px] font-bold text-white">
            {n.unread > 9 ? "9+" : n.unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className={cn(
            "absolute top-12 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-card border border-border bg-background p-2 shadow-[0_12px_40px_rgb(0_0_0/0.12)]",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-[15px] font-semibold">Notifications</p>
            {n.unread > 0 ? (
              <button type="button" className="text-[14px] font-semibold text-muted hover:text-foreground" onClick={() => void n.markRead(n.items.filter((x) => !x.readAt).map((x) => x.id))}>
                Mark all read
              </button>
            ) : null}
          </div>
          {n.items.length === 0 ? (
            <p className="px-3 pt-1 pb-3 text-[15px] text-muted">Nothing yet. With weekly drafts on, you&apos;ll hear here when next week&apos;s plan is ready.</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {n.items.map((item) => {
                const body = (
                  <>
                    <span className="flex items-start justify-between gap-3">
                      <span className={cn("text-[15px]", item.readAt ? "font-medium" : "font-semibold")}>{item.title}</span>
                      <span className="shrink-0 text-[13px] text-muted">{when(item.createdAt)}</span>
                    </span>
                    {item.body ? <span className="mt-0.5 block text-[14px] leading-snug text-muted">{item.body}</span> : null}
                  </>
                );
                const cls = cn("block rounded-2xl px-3 py-2.5 hover:bg-surface", !item.readAt && "bg-accent-soft/60");
                return (
                  <li key={item.id}>
                    {item.link ? (
                      <Link
                        href={item.link}
                        className={cls}
                        onClick={() => {
                          void n.markRead([item.id]);
                          setOpen(false);
                        }}
                      >
                        {body}
                      </Link>
                    ) : (
                      <button type="button" className={cn(cls, "w-full text-left")} onClick={() => void n.markRead([item.id])}>
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
