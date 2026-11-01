import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-card bg-surface p-5 sm:p-6", className)} {...props} />;
}

/** Small uppercase label used at the top of cards ("SHOPPING DAY"). */
export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("text-[13px] font-semibold uppercase tracking-[0.12em] text-muted", className)}
      {...props}
    />
  );
}

export function CardHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        {title ? <h2 className="mt-1.5 text-2xl font-bold tracking-tight">{title}</h2> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Muted helper text under a control. */
export function Hint({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("mt-3 text-[15px] leading-snug text-muted", className)} {...props} />;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4 pt-2 lg:mb-8">
      <div>
        <h1 className="text-[34px] font-bold leading-tight tracking-tight lg:text-[40px]">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-xl text-[17px] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}
