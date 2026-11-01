import { brand } from "@kitchen-pantry/ui-tokens";
import { cn } from "@/lib/cn";

/** Kitchen Pantry mark: a pantry jar with a leaf — original artwork. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <rect x="2" y="2" width="28" height="28" rx="9" fill="rgb(var(--kp-accent))" />
      <rect x="10" y="7.5" width="12" height="3" rx="1.5" fill="rgb(var(--kp-accent-foreground))" />
      <path
        d="M9.5 12.5h13a1 1 0 0 1 1 1V22a3.5 3.5 0 0 1-3.5 3.5h-8A3.5 3.5 0 0 1 8.5 22v-8.5a1 1 0 0 1 1-1Z"
        fill="none"
        stroke="rgb(var(--kp-accent-foreground))"
        strokeWidth="2"
      />
      <path
        d="M16 22.5c-2.6-.3-3.8-2.3-3.5-5 2.7-.2 4.4 1.2 4.6 3.6M16.6 21c.3-2.2 1.8-3.4 3.9-3.4.2 2.2-1.1 3.8-3.9 3.9"
        fill="rgb(var(--kp-accent-foreground))"
      />
    </svg>
  );
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="text-[19px] font-bold tracking-tight">{brand.name}</span>
    </span>
  );
}
