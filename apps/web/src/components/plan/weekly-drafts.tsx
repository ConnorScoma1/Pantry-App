"use client";

import { hourLabel, WEEKDAYS } from "@kitchen-pantry/meal-planner";
import { planningModes, type MealPlan, type PlanningMode } from "@kitchen-pantry/shared-types";
import { CalendarClock, ChevronDown, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Card, Eyebrow, Hint } from "@/components/ui/card";
import { Switch } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import { useWeeklyJob, useWeeklyPlanning } from "@/lib/planning/use-weekly-planning";

function shortDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Select<T extends string | number>({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[15px] font-semibold">{label}</span>
      <span className="relative block">
        <select
          value={String(value)}
          disabled={disabled}
          onChange={(e) => {
            const found = options.find((o) => String(o.value) === e.target.value);
            if (found) onChange(found.value);
          }}
          className="min-h-11 w-full appearance-none rounded-full border border-border bg-background pr-9 pl-4 text-[16px] font-medium outline-none focus:border-foreground disabled:opacity-60"
        >
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
      </span>
    </label>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: hourLabel(h) }));
const MODES = planningModes.filter((m) => m.available).map((m) => ({ value: m.code as PlanningMode, label: m.label }));

function Note({ tone = "info", children }: { tone?: "info" | "warning"; children: ReactNode }) {
  return (
    <p className={cn("flex gap-2.5 rounded-2xl px-4 py-3 text-[15px]", tone === "warning" ? "bg-warning/10" : "bg-surface")}>
      {tone === "warning" ? <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />}
      <span>{children}</span>
    </p>
  );
}

/** Planning settings → Weekly drafts. Off by default; one switch to turn on. */
export function WeeklyDraftsCard() {
  const w = useWeeklyPlanning();
  const s = w.settings;
  return (
    <Card className="lg:col-span-2" id="weekly-drafts">
      <Eyebrow>Weekly drafts</Eyebrow>
      <p className="mt-1.5 text-[16px] text-muted">
        Once a week, Kitchen Pantry drafts next week&apos;s dinners from your kitchen, what needs using up and your preferences — ready for you to review. It never buys anything and never changes a week you&apos;ve confirmed or started.
      </p>
      <div className="mt-4 space-y-5" aria-busy={w.loading}>
        <Switch
          label="Draft next week for me"
          description={s.enabled ? `Every ${w.schedule.label}${s.timeZone ? ` (${s.timeZone.replace(/_/g, " ")})` : ""}.` : "Off — you plan each week yourself."}
          checked={s.enabled}
          onChange={(enabled) => void w.save({ enabled })}
        />
        {s.enabled ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Select label="Day" value={s.runDay} options={WEEKDAYS.map((d) => ({ value: d.day, label: d.label }))} onChange={(runDay) => void w.save({ runDay })} disabled={w.saving} />
              <Select label="Time" value={s.runHour} options={HOURS} onChange={(runHour) => void w.save({ runHour })} disabled={w.saving} />
              <Select label="Plan it as" value={s.mode} options={MODES} onChange={(mode) => void w.save({ mode })} disabled={w.saving} />
            </div>
            <p className="flex items-start gap-2 text-[15px]">
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <span>
                {w.latest && w.latest.weekStart === w.schedule.weekStart && w.latest.status !== "running"
                  ? `The week of ${shortDay(w.schedule.weekStart)} is done: ${w.latest.message ?? (w.latest.status === "drafted" ? "a draft is ready." : "no draft this time.")}`
                  : w.schedule.due
                    ? `Next week (from ${shortDay(w.schedule.weekStart)}) will be drafted within the hour.`
                    : `Next draft: ${w.schedule.label}, for the week of ${shortDay(w.schedule.weekStart)}.`}
              </span>
            </p>
            <Hint>
              {s.enabledByYou
                ? "Planned with your cooking skill and tastes, and everyone's allergies and diets."
                : s.enabledByName
                  ? `Turned on by ${s.enabledByName} — planned with their cooking skill and tastes, and everyone's allergies and diets.`
                  : "Planned with everyone's allergies and diets."}
              {s.mode === "cook_the_specials" ? " Cook the Specials uses your store's real sale prices; without a store or prices it plans like Balanced and says so." : ""}
            </Hint>
            {!w.server.running && w.server.reason ? <Note tone="warning">{w.server.reason}</Note> : null}
          </>
        ) : null}

        <div className="border-t border-border pt-5">
          <p className="mb-3 text-[15px] font-semibold">Tell me when a plan is ready (just you)</p>
          <div className="space-y-4">
            <Switch label="In the app" description="A notice on Home and the bell." checked={w.prefs.planReadyInApp} onChange={(planReadyInApp) => void w.savePrefs({ planReadyInApp })} />
            {w.prefs.planReadyPush ? (
              <Switch label="On my phone" description="On — turned on in the phone app." checked onChange={() => void w.savePrefs({ planReadyPush: false })} />
            ) : (
              // A phone has to register itself, so this one is switched on in the phone app.
              <div>
                <p className="text-[17px] font-medium">On my phone</p>
                <p className="text-[15px] text-muted">Turn this on in the Kitchen Pantry phone app (Plan → Weekly drafts).</p>
              </div>
            )}
          </div>
        </div>
        {w.error ? (
          <p role="alert" className="text-[15px] text-danger">
            {w.error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/** Above a week the job drafted: say so plainly, and that it still needs the household's OK. */
export function WeeklyDraftBanner({ weekStart, plan }: { weekStart: string; plan: MealPlan | null }) {
  const job = useWeeklyJob(weekStart);
  if (!job || job.status === "running") return null;
  if (job.status === "drafted") {
    if (!plan || plan.id !== job.mealPlanId || plan.confirmedAt) return null;
    return (
      <div role="status" className="rounded-2xl bg-accent-soft px-4 py-3 text-[15px]">
        <p className="font-semibold">Drafted for you{job.finishedAt ? ` on ${new Date(job.finishedAt).toLocaleDateString("en-US", { weekday: "long" })}` : ""}</p>
        <p className="mt-0.5">
          {job.message ?? "Next week's dinners are ready."} Swap or lock anything, then confirm the week.
          {job.details.notes && job.details.notes.length > 0 ? ` ${job.details.notes.join(" ")}` : ""}
        </p>
      </div>
    );
  }
  if (plan && plan.meals.length > 0) return null; // the household planned it themselves
  return <Note tone={job.status === "failed" ? "warning" : "info"}>{job.message ?? "There's no draft for this week."}</Note>;
}
