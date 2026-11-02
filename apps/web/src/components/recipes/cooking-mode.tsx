"use client";

import {
  clockTime,
  cookingSteps,
  formatIngredientLine,
  formatMinutes,
  formatTemperature,
  groupByComponent,
  isChefRecipe,
  miseEnPlace,
  serviceTimeline,
  servingsFactor,
  substitutionsFor,
} from "@kitchen-pantry/recipe-engine";
import type { Recipe } from "@kitchen-pantry/shared-types";
import { ArrowLeft, ArrowRight, Check, ChefHat, MessageCircleQuestion, Minus, Plus, ShieldAlert, Thermometer, Timer, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cookingHelpAction } from "@/app/(app)/recipes/actions";
import { useProfile } from "@/components/profile/profile-provider";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { cn } from "@/lib/cn";

type Tab = "steps" | "ingredients" | "plan";

interface RunningTimer {
  id: number;
  label: string;
  endsAt: number;
  seconds: number;
  done: boolean;
}

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** A short beep (no audio files) plus a vibration where supported. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      [0, 0.35, 0.7].forEach((t) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.2, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.3);
      });
    }
  } catch {
    // no audio: the timer still shows "Done"
  }
  try {
    navigator.vibrate?.([300, 150, 300]);
  } catch {
    // ignore
  }
}

function useTimers() {
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const next = useRef(1);
  useEffect(() => {
    if (timers.every((t) => t.done)) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      setTimers((list) => {
        let rang = false;
        const updated = list.map((x) => {
          if (!x.done && x.endsAt <= t) {
            rang = true;
            return { ...x, done: true };
          }
          return x;
        });
        if (rang) chime();
        return rang ? updated : list;
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [timers]);
  const start = useCallback((label: string, seconds: number) => {
    const t = Date.now();
    setNow(t);
    setTimers((list) => [...list, { id: next.current++, label, endsAt: t + seconds * 1000, seconds, done: false }]);
  }, []);
  const stop = useCallback((id: number) => setTimers((list) => list.filter((x) => x.id !== id)), []);
  return { timers, now, start, stop };
}

/** Keeps the screen awake while cooking, where the browser allows it. */
function useWakeLock(on: boolean) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: { release(): Promise<void> } | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        lock = await (navigator as unknown as { wakeLock: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock.request("screen");
        if (!cancelled) setHeld(true);
      } catch {
        setHeld(false);
      }
    };
    void request();
    const onVisible = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [on]);
  return held;
}

const QUICK = ["My sauce broke — how do I fix it?", "It's browning too quickly.", "How do I make this look restaurant-style?"];

/**
 * Hands-free-friendly cooking mode (spec 01 §11): big text, one step at a
 * time, amounts inside each step, timers, temperatures, a ticking
 * ingredient checklist, curated swaps, and the cooking assistant. Chef
 * mode (§12) adds mise en place and a running order back from service.
 */
export function CookingMode({ recipe, initialServings, onClose, onDone }: { recipe: Recipe; initialServings: number; onClose: () => void; onDone: () => void }) {
  const { profile, mode } = useProfile();
  const chef = isChefRecipe(recipe);
  const [tab, setTab] = useState<Tab>("steps");
  const [servings, setServings] = useState(initialServings);
  const factor = servingsFactor(recipe, servings);
  const steps = useMemo(() => cookingSteps(recipe, factor), [recipe, factor]);
  const [index, setIndex] = useState(0);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [askOpen, setAskOpen] = useState(false);
  const timers = useTimers();
  const awake = useWakeLock(true);
  const titleId = useId();
  const step = steps[index]!;
  const last = index === steps.length - 1;
  const allergies = useMemo(() => [...new Set([...profile.diet.allergies, ...(profile.householdDiet?.allergies ?? [])])], [profile]);
  const avoid = useMemo(() => [...profile.diet.neverRecommend, ...(profile.householdDiet?.neverRecommend ?? [])], [profile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (askOpen || (e.target as HTMLElement | null)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(steps.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps.length, onClose, askOpen]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const tabs: ReadonlyArray<{ value: Tab; label: string }> = chef
    ? [
        { value: "steps", label: "Steps" },
        { value: "ingredients", label: "Ingredients" },
        { value: "plan", label: "Chef plan" },
      ]
    : [
        { value: "steps", label: "Steps" },
        { value: "ingredients", label: "Ingredients" },
      ];

  // Portal to <body>: animated page wrappers create their own containing block for fixed elements.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-[60] flex flex-col bg-background">
      <header className="border-b border-border px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button type="button" onClick={onClose} aria-label="Leave cooking mode" className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface">
            <X className="size-6" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
              {chef ? <ChefHat className="size-4" aria-hidden /> : null}
              {chef ? "Chef mode" : "Cooking mode"}
              {awake ? <span className="normal-case tracking-normal font-medium">· screen stays on</span> : null}
            </p>
            <h2 id={titleId} className="truncate text-[18px] font-bold">
              {recipe.title}
            </h2>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Servings">
            <button type="button" aria-label="Fewer servings" disabled={servings <= 1} onClick={() => setServings((s) => s - 1)} className="grid size-10 place-items-center rounded-full border border-border disabled:opacity-35">
              <Minus className="size-4" aria-hidden />
            </button>
            <span className="min-w-[3.5rem] text-center text-[14px] font-semibold tabular-nums" aria-live="polite">
              {servings} serv.
            </span>
            <button type="button" aria-label="More servings" disabled={servings >= 24} onClick={() => setServings((s) => s + 1)} className="grid size-10 place-items-center rounded-full border border-border disabled:opacity-35">
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        <div className="mx-auto mt-3 max-w-3xl">
          <Segmented label="Cooking view" options={tabs} value={tab} onChange={setTab} />
        </div>
      </header>

      {timers.timers.length > 0 ? (
        <div className="border-b border-border bg-surface px-4 py-2 sm:px-6" aria-live="polite">
          <ul className="mx-auto flex max-w-3xl flex-wrap gap-2">
            {timers.timers.map((t) => (
              <li key={t.id} className={cn("flex items-center gap-2 rounded-full py-1 pr-1 pl-3 text-[15px] font-semibold tabular-nums", t.done ? "animate-pulse bg-warning text-white" : "bg-background")}>
                <Timer className="size-4" aria-hidden />
                <span>
                  {t.label}: {t.done ? "Done!" : fmtClock(t.endsAt - timers.now)}
                </span>
                <button type="button" aria-label={`Stop the ${t.label} timer`} onClick={() => timers.stop(t.id)} className="grid size-8 place-items-center rounded-full hover:bg-surface-strong/60">
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {tab === "steps" ? (
            <section aria-label={`Step ${step.number} of ${steps.length}`}>
              <p className="text-[15px] font-semibold text-muted">
                Step {step.number} of {steps.length}
                {step.component ? <span className="ml-2 rounded-full bg-accent-soft px-2.5 py-0.5 text-[13px] text-foreground">{step.component}</span> : null}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-strong" aria-hidden>
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
              </div>
              <p className="mt-6 text-[26px] font-medium leading-snug sm:text-[32px]">{step.body}</p>

              {step.uses.length > 0 ? (
                <ul className="mt-6 flex flex-wrap gap-2" aria-label="Uses">
                  {step.uses.map((u) => (
                    <li key={u} className="rounded-full bg-surface px-3.5 py-1.5 text-[16px]">
                      {u}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-6 flex flex-wrap gap-3">
                {step.temperatureC !== null ? (
                  <p className="inline-flex items-center gap-2 rounded-2xl bg-surface px-4 py-3 text-[18px] font-semibold">
                    <Thermometer className="size-5" aria-hidden /> {formatTemperature(step.temperatureC)}
                  </p>
                ) : null}
                {step.safeInternalTempC !== null ? (
                  <p className="inline-flex items-center gap-2 rounded-2xl bg-warning/10 px-4 py-3 text-[18px] font-semibold">
                    <ShieldAlert className="size-5" aria-hidden /> Safe at {formatTemperature(step.safeInternalTempC)} inside — check with a thermometer
                  </p>
                ) : null}
                {step.timerSeconds ? (
                  <Button size="lg" variant="secondary" icon={<Timer className="size-5" aria-hidden />} onClick={() => timers.start(step.component ?? `Step ${step.number}`, step.timerSeconds!)}>
                    Start {formatMinutes(Math.round(step.timerSeconds / 60))} timer
                  </Button>
                ) : null}
              </div>

              {last && recipe.tips.length > 0 ? (
                <div className="mt-8 rounded-2xl bg-surface p-4">
                  <p className="text-[15px] font-semibold">Chef&apos;s tips</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[16px]">
                    {recipe.tips.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : tab === "ingredients" ? (
            <IngredientChecklist recipe={recipe} factor={factor} checked={checked} setChecked={setChecked} allergies={allergies} avoid={avoid} />
          ) : (
            <ChefPlan recipe={recipe} factor={factor} />
          )}
        </div>
      </main>

      <footer className="border-t border-border px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <Button size="lg" variant="secondary" disabled={index === 0 || tab !== "steps"} onClick={() => setIndex((i) => i - 1)} icon={<ArrowLeft className="size-5" aria-hidden />} aria-label="Previous step">
            <span className="hidden sm:inline">Back</span>
          </Button>
          <Button size="lg" variant="ghost" onClick={() => setAskOpen(true)} icon={<MessageCircleQuestion className="size-5" aria-hidden />}>
            Ask
          </Button>
          <div className="flex-1" />
          {tab !== "steps" ? (
            <Button size="lg" onClick={() => setTab("steps")}>
              Step {step.number}
            </Button>
          ) : last ? (
            <Button size="lg" onClick={onDone} icon={<Check className="size-5" aria-hidden />}>
              <span className="sm:hidden">Done</span>
              <span className="hidden sm:inline">Done — I cooked it</span>
            </Button>
          ) : (
            <Button size="lg" onClick={() => setIndex((i) => i + 1)} icon={<ArrowRight className="size-5" aria-hidden />}>
              <span className="sm:hidden">Next</span>
              <span className="hidden sm:inline">Next step</span>
            </Button>
          )}
        </div>
      </footer>

      {askOpen ? <AskPanel recipe={recipe} step={index} servings={servings} chef={chef} preview={mode === "preview"} allergies={allergies} onClose={() => setAskOpen(false)} /> : null}
    </div>,
    document.body,
  );
}

function IngredientChecklist({
  recipe,
  factor,
  checked,
  setChecked,
  allergies,
  avoid,
}: {
  recipe: Recipe;
  factor: number;
  checked: Set<number>;
  setChecked: (s: Set<number>) => void;
  allergies: Parameters<typeof substitutionsFor>[1]["allergies"];
  avoid: string[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const groups = groupByComponent([...recipe.ingredients].sort((a, b) => a.position - b.position));
  return (
    <section aria-label="Ingredients">
      <p className="text-[15px] text-muted">
        Tick things off as you set them out. {checked.size} of {recipe.ingredients.length} ready.
      </p>
      {groups.map((g) => (
        <div key={g.component ?? "main"} className="mt-5">
          {g.component ? <h3 className="mb-2 text-[17px] font-bold">{g.component}</h3> : null}
          <ul className="divide-y divide-border rounded-card bg-surface">
            {g.items.map((i) => {
              const done = checked.has(i.position);
              const subs = substitutionsFor(i.item, { allergies, avoid });
              return (
                <li key={i.position} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={done}
                      onClick={() => {
                        const next = new Set(checked);
                        if (done) next.delete(i.position);
                        else next.add(i.position);
                        setChecked(next);
                      }}
                      className="flex min-h-11 flex-1 items-center gap-3 text-left"
                    >
                      <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg border-2", done ? "border-accent bg-accent text-white" : "border-border")}>
                        {done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : null}
                      </span>
                      <span className={cn("text-[18px]", done && "text-muted line-through")}>
                        {formatIngredientLine(i, factor)}
                        {i.optional ? <span className="text-muted"> (optional)</span> : null}
                      </span>
                    </button>
                    {subs.length > 0 ? (
                      <button type="button" aria-expanded={open === i.position} onClick={() => setOpen(open === i.position ? null : i.position)} className="shrink-0 rounded-full px-3 py-1.5 text-[14px] font-semibold text-accent hover:bg-background">
                        Swap?
                      </button>
                    ) : null}
                  </div>
                  {open === i.position ? (
                    <ul className="mt-2 ml-10 list-disc space-y-1 pl-4 text-[15px] text-muted">
                      {subs.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {recipe.requiredEquipment.length > 0 ? <p className="mt-5 text-[15px] text-muted">You&apos;ll need: {recipe.requiredEquipment.map((e) => e.replace(/_/g, " ")).join(", ")}.</p> : null}
    </section>
  );
}

function defaultServeTime(totalMinutes: number): string {
  const d = new Date(Date.now() + (totalMinutes + 10) * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function ChefPlan({ recipe, factor }: { recipe: Recipe; factor: number }) {
  const timeline = useMemo(() => serviceTimeline(recipe), [recipe]);
  const mise = useMemo(() => miseEnPlace(recipe, factor), [recipe, factor]);
  const [serve, setServe] = useState(() => defaultServeTime(timeline.totalMinutes));
  const id = useId();
  const serveAt = useMemo(() => {
    const [h, m] = serve.split(":").map(Number);
    const d = new Date();
    d.setHours(h ?? 19, m ?? 0, 0, 0);
    if (d.getTime() < Date.now() - 60 * 60_000) d.setDate(d.getDate() + 1); // an earlier time means tomorrow
    return d;
  }, [serve]);
  return (
    <section aria-label="Chef plan" className="space-y-8">
      <div>
        <h3 className="text-[20px] font-bold">Running order</h3>
        <p className="mt-1 text-[15px] text-muted">
          About {formatMinutes(timeline.totalMinutes)} of work in recipe order, from timers and estimates. Overlap components where you can — this tells you when to start.
        </p>
        <label htmlFor={id} className="mt-3 flex items-center gap-3 text-[16px] font-semibold">
          Serve at
          <input id={id} type="time" value={serve} onChange={(e) => setServe(e.target.value || serve)} className="min-h-11 rounded-full border border-border bg-background px-4 text-[16px] font-medium" />
        </label>
        <ol className="mt-4 space-y-2">
          {timeline.entries.map((e) => (
            <li key={e.step} className="flex gap-3 rounded-2xl bg-surface px-4 py-3">
              <span className="w-[4.5rem] shrink-0 text-[15px] font-bold tabular-nums">{clockTime(serveAt, e.startsBefore)}</span>
              <span className="min-w-0 flex-1 text-[15px]">
                {e.component ? <span className="font-semibold">{e.component}: </span> : null}
                {e.summary}
                <span className="text-muted"> · {e.minutes} min</span>
              </span>
            </li>
          ))}
          <li className="flex gap-3 rounded-2xl bg-accent-soft px-4 py-3 font-semibold">
            <span className="w-[4.5rem] shrink-0 tabular-nums">{clockTime(serveAt, 0)}</span>
            <span>Serve</span>
          </li>
        </ol>
      </div>
      <div>
        <h3 className="text-[20px] font-bold">Mise en place</h3>
        <p className="mt-1 text-[15px] text-muted">Measure, cut and set out everything before the heat goes on.</p>
        {mise.map((m) => (
          <div key={m.component ?? "main"} className="mt-4">
            {m.component ? <p className="mb-1 text-[16px] font-semibold">{m.component}</p> : null}
            <ul className="list-disc space-y-1 pl-5 text-[16px]">
              {m.tasks.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function AskPanel({
  recipe,
  step,
  servings,
  chef,
  preview,
  allergies,
  onClose,
}: {
  recipe: Recipe;
  step: number;
  servings: number;
  chef: boolean;
  preview: boolean;
  allergies: string[];
  onClose: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Awaited<ReturnType<typeof cookingHelpAction>> | null>(null);
  const inputId = useId();
  const quick = [...QUICK, ...(chef ? ["What wine goes with this?"] : [])];

  async function ask(q: string) {
    const text = q.trim();
    if (text.length < 3) return;
    setQuestion(text);
    setBusy(true);
    setReply(null);
    const r = await cookingHelpAction({ recipeId: recipe.id, step, question: text, servings }, preview ? allergies : undefined);
    setBusy(false);
    setReply(r);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ask the cooking assistant"
        className="max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-t-[28px] bg-background p-5 pb-[max(env(safe-area-inset-bottom),20px)] sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[20px] font-bold">Ask about step {step + 1}</h3>
            <p className="text-[14px] text-muted">The assistant sees this recipe, your step and your household&apos;s allergies — nothing else.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-surface">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {quick.map((q) => (
            <button key={q} type="button" disabled={busy} onClick={() => void ask(q)} className="rounded-full border border-border px-3.5 py-2 text-left text-[14px] font-medium hover:bg-surface disabled:opacity-50">
              {q}
            </button>
          ))}
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Your question
          </label>
          <input
            id={inputId}
            value={question}
            maxLength={300}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. I don't have shallots"
            className="min-h-12 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-[16px] outline-none focus:border-foreground"
          />
          <Button type="submit" disabled={busy || question.trim().length < 3}>
            {busy ? "Asking…" : "Ask"}
          </Button>
        </form>
        <div aria-live="polite" className="mt-4 space-y-3">
          {reply && !reply.ok ? <p className="text-[15px] text-danger">{reply.message}</p> : null}
          {reply && reply.ok ? (
            <>
              {reply.data.answer ? <p className="whitespace-pre-line rounded-2xl bg-surface px-4 py-3 text-[17px] leading-relaxed">{reply.data.answer}</p> : null}
              {reply.data.safetyNote ? (
                <p className="flex gap-2 rounded-2xl bg-warning/10 px-4 py-3 text-[15px]">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {reply.data.safetyNote}
                </p>
              ) : null}
              {reply.data.notice ? <p className="text-[14px] text-muted">{reply.data.notice}</p> : null}
              {reply.data.tips.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-[15px]">
                  {reply.data.tips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              ) : !reply.data.answer ? (
                <p className="text-[15px] text-muted">No built-in tips for this step.</p>
              ) : null}
              {reply.data.source === "ai" ? <p className="text-[12px] text-muted">Answered by Claude. Check food-safety temperatures with a thermometer.</p> : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
