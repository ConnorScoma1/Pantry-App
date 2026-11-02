"use client";

import { formatCents } from "@kitchen-pantry/grocery-pricing";
import { pantryCategories } from "@kitchen-pantry/shared-types";
import { receiptDraftSchema, receiptLineToInput, type PantryItemInput, type ReceiptDraftData } from "@kitchen-pantry/validation";
import { Check, ReceiptText } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

/** Shrink a photo in the browser (longest side ≤ 1600 px, JPEG) so it uploads quickly and stays under the limit. */
async function shrink(file: File): Promise<{ mediaType: "image/jpeg"; base64: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("unreadable"));
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    return { mediaType: "image/jpeg", base64: dataUrl.slice(dataUrl.indexOf(",") + 1) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Row = ReceiptDraftData["lines"][number] & { keep: boolean };

/**
 * Add from a receipt: the photo is read on the server (Claude) and comes
 * back as a list to review. Food lines start ticked, everything else
 * unticked; names can be fixed; nothing is added until "Add".
 */
export function ReceiptSheet({ open, onClose, today, onAdd }: { open: boolean; onClose: () => void; today: string; onAdd: (inputs: PantryItemInput[]) => Promise<{ ok: boolean; message?: string }> }) {
  const fileId = useId();
  const [busy, setBusy] = useState<null | "reading" | "adding">(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ store: string | null; date: string | null; rows: Row[] } | null>(null);

  useEffect(() => {
    if (!open) {
      setDraft(null);
      setError(null);
      setBusy(null);
    }
  }, [open]);

  async function read(file: File) {
    setError(null);
    setBusy("reading");
    try {
      const image = await shrink(file);
      const res = await fetch("/api/kitchen/receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(image) });
      const r = (await res.json()) as { ok: boolean; data?: unknown; message?: string };
      if (!r.ok) return setError(r.message ?? "Couldn't read that receipt.");
      const parsed = receiptDraftSchema.safeParse(r.data);
      if (!parsed.success) return setError("The receipt came back in an unexpected shape.");
      setDraft({ store: parsed.data.store, date: parsed.data.date, rows: parsed.data.lines.map((l) => ({ ...l, keep: l.isFood })) });
    } catch {
      setError("That photo couldn't be opened. Try a JPEG or PNG.");
    } finally {
      setBusy(null);
    }
  }

  const kept = draft?.rows.filter((r) => r.keep && r.name.trim()) ?? [];
  const label = (code: string) => pantryCategories.find((c) => c.code === code)?.label ?? "Other";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add from a receipt"
      description="Take or choose a photo of a grocery receipt. It's read once by the AI assistant and not kept; you choose what goes into your kitchen."
      footer={
        draft ? (
          <div className="space-y-2">
            {error ? (
              <p role="alert" className="text-center text-[15px] font-medium text-danger">
                {error}
              </p>
            ) : null}
            <Button
              size="lg"
              className="w-full"
              disabled={busy !== null || kept.length === 0}
              onClick={async () => {
                setBusy("adding");
                const purchasedOn = draft.date && draft.date <= today ? draft.date : today;
                const r = await onAdd(kept.map((row) => receiptLineToInput(row, purchasedOn)));
                setBusy(null);
                if (!r.ok) setError(r.message ?? "Couldn't add those items.");
              }}
            >
              {busy === "adding" ? "Adding…" : `Add ${kept.length} item${kept.length === 1 ? "" : "s"} to My Kitchen`}
            </Button>
          </div>
        ) : undefined
      }
    >
      {!draft ? (
        <div className="space-y-3">
          <label
            htmlFor={fileId}
            className={cn("flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-background p-6 text-center", busy && "pointer-events-none opacity-60")}
          >
            <ReceiptText className="size-8 text-muted" aria-hidden />
            <span className="font-semibold">{busy === "reading" ? "Reading your receipt…" : "Take or choose a photo"}</span>
            <span className="text-[14px] text-muted">Flat, in good light, the whole receipt in view.</span>
          </label>
          <input
            id={fileId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            disabled={busy !== null}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void read(f);
            }}
          />
          {error ? (
            <p role="alert" className="text-[15px] text-danger">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[15px] text-muted">
            {draft.store ? <span className="font-semibold text-foreground">{draft.store}</span> : "Receipt"}
            {draft.date ? ` · ${new Date(`${draft.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : ""} · read by AI — check the names before adding.
          </p>
          <ul className="space-y-2">
            {draft.rows.map((row, i) => (
              <li key={i} className={cn("flex items-start gap-3 rounded-2xl bg-background px-3 py-2.5", !row.keep && "opacity-60")}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={row.keep}
                  aria-label={`Add ${row.name}`}
                  onClick={() => setDraft({ ...draft, rows: draft.rows.map((r, j) => (j === i ? { ...r, keep: !r.keep } : r)) })}
                  className={cn("mt-2 grid size-6 shrink-0 place-items-center rounded-md border-2", row.keep ? "border-foreground bg-foreground text-background" : "border-border")}
                >
                  {row.keep ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : null}
                </button>
                <div className="min-w-0 flex-1">
                  <TextInput
                    aria-label="Item name"
                    value={row.name}
                    maxLength={120}
                    className="h-11 text-[16px]"
                    onChange={(e) => setDraft({ ...draft, rows: draft.rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)) })}
                  />
                  <p className="mt-1 text-[13px] text-muted">
                    {row.text ? <span className="font-mono">{row.text}</span> : null}
                    {row.quantity !== null ? ` · ${row.quantity} ${row.unit ?? ""}` : ""} · {label(row.category)}
                    {!row.isFood ? " · not food" : ""}
                  </p>
                </div>
                <span className="mt-2.5 shrink-0 text-[15px] tabular-nums">{row.priceCents !== null ? formatCents(row.priceCents) : "—"}</span>
              </li>
            ))}
          </ul>
          <Button variant="ghost" className="-ml-3" onClick={() => setDraft(null)}>
            Use a different photo
          </Button>
        </div>
      )}
    </Sheet>
  );
}
