"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Modal sheet: slides up from the bottom on phones, centred dialog on larger
 * screens. Traps focus, closes on Escape / backdrop, restores focus on close.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    // Focus the first form field if there is one, otherwise the panel.
    const first = panelRef.current?.querySelector<HTMLElement>("input, select, textarea") ?? panelRef.current;
    first?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === "Tab") {
        const list = focusables();
        if (list.length === 0) return;
        const firstEl = list[0]!;
        const lastEl = list[list.length - 1]!;
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/40 animate-[fade_200ms_ease-out]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-background shadow-2xl outline-none animate-enter sm:max-w-lg sm:rounded-[28px]"
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 sm:px-6">
          <div>
            <h2 id={titleId} className="text-2xl font-bold tracking-tight">
              {title}
            </h2>
            {description ? <p className="mt-1 text-[15px] text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-muted hover:text-foreground"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
        {footer ? (
          <div className="border-t border-border px-5 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] sm:px-6 sm:pb-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
