"use client";

import { Check, Minus, Plus } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Toggleable pill. Selected state uses a strong outline + check, never colour alone. */
export function Chip({
  selected,
  onToggle,
  children,
  disabled,
}: {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[16px] font-medium transition-[background-color,border-color,color] duration-150 disabled:opacity-45",
        selected
          ? "border-foreground bg-background text-foreground shadow-[inset_0_0_0_1px_rgb(var(--kp-foreground))]"
          : "border-border bg-background text-foreground hover:border-subtle",
      )}
    >
      {selected ? <Check aria-hidden className="size-4" strokeWidth={2.75} /> : null}
      {children}
    </button>
  );
}

export function ChipGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2.5">
      {children}
    </div>
  );
}

/** − value + counter with an accessible label. */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 20,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <span id={id} className="text-[17px]">
        {label}
      </span>
      <div className="flex items-center gap-3" role="group" aria-labelledby={id}>
        <RoundIconButton label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
          <Minus className="size-5" strokeWidth={2.5} aria-hidden />
        </RoundIconButton>
        <output aria-live="polite" className="min-w-[2.5ch] text-center text-2xl font-bold tabular-nums">
          {value}
        </output>
        <RoundIconButton label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
          <Plus className="size-5" strokeWidth={2.5} aria-hidden />
        </RoundIconButton>
        {suffix ? <span className="w-[4.5rem] text-[15px] text-muted">{suffix}</span> : null}
      </div>
    </div>
  );
}

function RoundIconButton({ label, children, ...props }: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="grid size-11 place-items-center rounded-full border border-border bg-background transition-colors hover:bg-surface-strong disabled:opacity-35"
      {...props}
    >
      {children}
    </button>
  );
}

/** Single-choice segmented control (radio group). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "bg-surface-strong p-1",
        // Four or more options become a 2×2 grid on narrow phones instead of truncating.
        options.length > 3 ? "grid grid-cols-2 gap-1 rounded-[22px] sm:flex sm:gap-0 sm:rounded-full" : "flex rounded-full",
      )}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-10 min-w-0 flex-1 truncate rounded-full px-1.5 text-[14px] font-medium transition-[background-color,box-shadow] duration-150 sm:px-3 sm:text-[15px]",
              checked ? "bg-background font-semibold shadow-sm" : "text-muted hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Large selectable card (radio) with title and description. */
export function ChoiceCard({
  selected,
  onSelect,
  title,
  description,
  leading,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description?: string;
  leading?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-4 rounded-control border bg-background p-4 text-left transition-[border-color,box-shadow] duration-150",
        selected
          ? "border-foreground shadow-[inset_0_0_0_1px_rgb(var(--kp-foreground))]"
          : "border-border hover:border-subtle",
      )}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold">{title}</span>
        {description ? <span className="mt-0.5 block text-[15px] leading-snug text-muted">{description}</span> : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2",
          selected ? "border-foreground bg-foreground text-background" : "border-border",
        )}
      >
        {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

/** Toggle switch. */
export function Switch({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-[17px] font-medium">
          {label}
        </label>
        {description ? <p className="text-[15px] text-muted">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-8 w-[52px] shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-accent" : "bg-surface-strong ring-1 ring-inset ring-border",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform duration-200",
            checked && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}

export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-2 text-[15px] font-medium text-danger">
      {message}
    </p>
  );
}

export function TextInput({ className, invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "h-13 w-full rounded-control border bg-background px-4 text-[17px] outline-none transition-colors placeholder:text-subtle focus:border-foreground",
        invalid ? "border-danger" : "border-border",
        className,
      )}
      {...props}
    />
  );
}
