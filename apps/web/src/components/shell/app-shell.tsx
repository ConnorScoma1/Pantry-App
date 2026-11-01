"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useProfile } from "@/components/profile/profile-provider";
import { cn } from "@/lib/cn";
import { BrandLockup, BrandMark } from "./brand";
import { isActive, navItems } from "./nav-items";

/**
 * Responsive shell: a sidebar on desktop (lg+) and a floating bottom tab
 * bar on phones/tablets. Content is centred with a comfortable max width.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { mode } = useProfile();

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-border px-4 py-6 lg:flex">
        <Link href="/" className="mb-8 px-3" aria-label="Kitchen Pantry home">
          <BrandLockup />
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-2xl px-3 text-[16px] font-medium transition-colors",
                  active ? "bg-surface-strong text-foreground" : "text-muted hover:bg-surface hover:text-foreground",
                )}
              >
                <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {mode === "preview" ? <PreviewNote className="mt-auto" /> : null}
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)] pb-2 sm:px-6 lg:hidden">
          <Link href="/" aria-label="Kitchen Pantry home" className="inline-flex items-center gap-2">
            <BrandMark className="size-7" />
            <span className="text-[17px] font-bold tracking-tight">Kitchen Pantry</span>
          </Link>
          {mode === "preview" ? (
            <span className="rounded-full bg-warning/12 px-3 py-1 text-[13px] font-semibold text-warning">Preview</span>
          ) : null}
        </header>

        <main id="main" className="mx-auto w-full max-w-[1080px] px-4 pb-32 sm:px-6 lg:px-10 lg:pt-8 lg:pb-16">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-3 bottom-[max(env(safe-area-inset-bottom),12px)] z-40 mx-auto max-w-lg rounded-[28px] border border-border bg-background/90 px-2 py-1.5 shadow-[0_8px_30px_rgb(0_0_0/0.08)] backdrop-blur-xl lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[22px] text-[12px] font-medium transition-colors",
                    active ? "bg-surface-strong text-foreground" : "text-muted",
                  )}
                >
                  <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  {item.shortLabel}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function PreviewNote({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl bg-warning/10 p-4 text-[14px] leading-snug", className)}>
      <p className="font-semibold text-warning">Preview mode</p>
      <p className="mt-1 text-muted">
        Supabase isn&apos;t connected, so your answers are saved in this browser only.
      </p>
    </div>
  );
}
