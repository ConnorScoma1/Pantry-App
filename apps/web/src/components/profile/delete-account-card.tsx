"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteAccountAction } from "@/app/(app)/profile/actions";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, Hint } from "@/components/ui/card";
import { TextInput } from "@/components/ui/controls";

/** Profile → Delete account. Two steps: open, then type DELETE. */
export function DeleteAccountCard({ shared }: { shared: boolean }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const r = await deleteAccountAction(typed.trim());
      if (r.ok) window.location.assign("/sign-in?deleted=1");
      else setError(r.message);
    });
  }

  return (
    <Card id="delete-account" className="lg:col-span-2">
      <Eyebrow>Delete account</Eyebrow>
      <Hint>
        Permanently deletes your account, your allergies and preferences, ratings, cooking history and notifications.{" "}
        {shared
          ? "Your shared household stays with the other members, along with what's in it (kitchen, plans, lists). If you're the owner, the longest-standing member becomes the owner."
          : "Your household and everything in it (kitchen, meal plans, grocery lists, saved recipes) are deleted too."}{" "}
        This can&apos;t be undone. <Link href="/privacy" className="underline underline-offset-4">Privacy policy</Link>
      </Hint>
      {!open ? (
        <Button variant="danger" className="mt-4" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
          Delete my account…
        </Button>
      ) : (
        <div className="mt-4 space-y-3">
          <label htmlFor="confirm-delete" className="block text-[15px] font-semibold">
            Type DELETE to confirm
          </label>
          <TextInput
            id="confirm-delete"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            invalid={Boolean(error)}
            aria-describedby={error ? "delete-error" : undefined}
          />
          {error ? (
            <p id="delete-error" role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={confirm} disabled={pending || typed.trim() !== "DELETE"}>
              {pending ? "Deleting…" : "Permanently delete my account"}
            </Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setTyped(""); setError(null); }} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
