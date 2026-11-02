"use client";

import { Info } from "lucide-react";
import { Card, Eyebrow, Hint } from "@/components/ui/card";
import { Switch } from "@/components/ui/controls";
import { useReminders } from "@/lib/planning/use-weekly-planning";

/**
 * Profile → Reminders (just this person). Use-soon reminders: once a day,
 * in the daytime, when something in the kitchen is due today or tomorrow.
 */
export function RemindersCard() {
  const r = useReminders();
  return (
    <Card id="reminders">
      <Eyebrow>Reminders</Eyebrow>
      <p className="mt-2 text-[17px] font-semibold">Food to use soon (just you)</p>
      <p className="mt-1 text-[15px] text-muted">
        Once a day, in the daytime, when something in your kitchen is due today or tomorrow — going by the use-by dates you entered.
      </p>
      <div className="mt-4 space-y-4">
        <Switch label="In the app" description="A notice in the bell." checked={r.prefs.useSoonInApp} onChange={(useSoonInApp) => void r.save({ useSoonInApp })} />
        {r.prefs.useSoonPush ? (
          <Switch label="On my phone" description="On — turned on in the phone app." checked onChange={() => void r.save({ useSoonPush: false })} />
        ) : (
          // A phone has to register itself, so this one is switched on in the phone app.
          <div>
            <p className="text-[17px] font-medium">On my phone</p>
            <p className="text-[15px] text-muted">Turn this on in the Kitchen Pantry phone app (Profile → Reminders).</p>
          </div>
        )}
      </div>
      {!r.loading && !r.server.running && r.server.reason ? (
        <p className="mt-4 flex gap-2.5 rounded-2xl bg-background px-4 py-3 text-[15px]">
          <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <span>{r.server.reason}</span>
        </p>
      ) : null}
      <Hint>Dates are a guide, not a safety check — if something looks or smells off, or is past its date, throw it out.</Hint>
      {r.error ? (
        <p role="alert" className="mt-3 text-[15px] text-danger">
          {r.error}
        </p>
      ) : null}
    </Card>
  );
}
