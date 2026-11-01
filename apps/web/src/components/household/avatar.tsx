import { cn } from "@/lib/cn";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

/** Initials in a circle. Decorative: the name is always shown or announced beside it. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-[14px] font-bold text-foreground ring-2 ring-surface",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
