import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A titled group of questions inside a step. */
export function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-card bg-surface p-5 sm:p-6", className)}>
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</h2>
      {description ? <p className="mt-1.5 text-[15px] leading-snug text-muted">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
