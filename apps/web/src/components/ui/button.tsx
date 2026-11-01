import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[background-color,transform,opacity,border-color] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 select-none";

const variants: Record<Variant, string> = {
  primary: "bg-foreground text-background hover:opacity-90",
  secondary: "border border-border bg-background text-foreground hover:bg-surface",
  ghost: "text-foreground hover:bg-surface",
  danger: "border border-danger/30 bg-background text-danger hover:bg-danger/5",
};

const sizes: Record<Size, string> = {
  md: "min-h-11 px-5 text-[15px]",
  lg: "min-h-14 px-7 text-[17px]",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends ComponentProps<"button"> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function Button({ variant = "primary", size = "md", icon, className, children, ...props }: ButtonProps) {
  return (
    <button type="button" className={buttonClasses(variant, size, className)} {...props}>
      {icon}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function ButtonLink({ variant = "primary", size = "md", icon, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}
