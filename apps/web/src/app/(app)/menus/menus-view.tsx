"use client";

import { formatAmount, formatMinutes } from "@kitchen-pantry/recipe-engine";
import { skillLevels, worldCuisines } from "@kitchen-pantry/shared-types";
import { ArrowLeft, CalendarClock, ChevronDown, Lightbulb, ListChecks, Save, ShoppingCart, Trash2, TriangleAlert, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/recipes/library-badges";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { Stepper, Switch } from "@/components/ui/controls";
import { formatMoney as formatCents } from "@/lib/format";
import { useMenus } from "@/lib/library/use-menus";
import { useRecipes } from "@/lib/recipes/use-recipes";

export function MenusView() {
  const data = useRecipes();
  const m = useMenus(data);
  const router = useRouter();
  const params = useSearchParams();
  const [cuisine, setCuisine] = useState("");
  const [showShopping, setShowShopping] = useState(false);

  // Deep links from search: /menus?template=thai-dinner&guests=4&budget=5000
  const code = params.get("template");
  const { choose, setSettings } = m;
  useEffect(() => {
    choose(code);
    const guests = Number(params.get("guests"));
    const budget = Number(params.get("budget"));
    setSettings((s) => ({ ...s, ...(guests >= 1 && guests <= 50 ? { guests } : {}), ...(budget > 0 ? { budgetCents: budget } : {}) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  const go = (c: string | null) => router.replace(c ? `/menus?template=${encodeURIComponent(c)}` : "/menus", { scroll: false });

  const menu = m.menu;
  return (
    <div className="animate-enter pb-8">
      <PageHeader title="Menus" subtitle="Whole meals, course by course — scaled to your guests, your skill, your time and your budget." />

      {!m.template ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {m.templates.map((t) => (
              <button key={t.code} type="button" onClick={() => go(t.code)} className="rounded-card bg-surface p-5 text-left transition-shadow hover:shadow-[0_6px_24px_rgb(0_0_0/0.06)]">
                <p className="text-[18px] font-semibold">{t.title}</p>
                <p className="mt-1 text-[15px] text-muted">{t.description}</p>
                <p className="mt-3 text-[13px] text-muted">
                  {t.courses.length} courses · suits {skillLevels.find((s) => s.level === t.suggestedSkill)?.label.toLowerCase()}
                </p>
              </button>
            ))}
          </div>
          <Card className="mt-6 flex flex-wrap items-end gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-[15px] font-semibold">Or a dinner from any cuisine</span>
              <select value={cuisine} onChange={(e) => setCuisine(e.target.value)} className="min-h-11 w-full rounded-full border border-border bg-background px-4 text-[16px]">
                <option value="">Choose a cuisine</option>
                {worldCuisines.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <Button disabled={!cuisine} onClick={() => go(`cuisine:${cuisine}`)}>
              Build it
            </Button>
          </Card>
        </>
      ) : (
        <>
          <button type="button" onClick={() => go(null)} className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-[15px] font-semibold text-muted hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden /> All menus
          </button>
          <h2 className="text-[26px] font-bold tracking-tight">{m.template.title}</h2>
          <p className="mt-1 text-[16px] text-muted">{m.template.description}</p>

          <Card className="mt-5 grid gap-5 sm:grid-cols-2">
            <Stepper label="Guests" value={m.settings.guests} min={1} max={50} onChange={(guests) => m.setSettings({ ...m.settings, guests })} />
            <label>
              <span className="mb-1 block text-[16px] font-semibold">Budget (optional)</span>
              <span className="flex items-center gap-2">
                <span className="text-muted">$</span>
                <input
                  inputMode="decimal"
                  value={m.settings.budgetCents ? String(m.settings.budgetCents / 100) : ""}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                    m.setSettings({ ...m.settings, budgetCents: n > 0 ? Math.round(n * 100) : null });
                  }}
                  placeholder="No limit"
                  aria-label="Budget in dollars"
                  className="min-h-11 w-32 rounded-full border border-border bg-background px-4 text-[16px]"
                />
              </span>
            </label>
            <label>
              <span className="mb-1 block text-[16px] font-semibold">Hands-on time</span>
              <select
                value={m.settings.maxActiveMinutes ?? ""}
                onChange={(e) => m.setSettings({ ...m.settings, maxActiveMinutes: e.target.value ? Number(e.target.value) : null })}
                className="min-h-11 rounded-full border border-border bg-background px-4 text-[16px]"
              >
                <option value="">Any</option>
                <option value="45">Up to 45 minutes</option>
                <option value="90">Up to 1½ hours</option>
                <option value="180">Up to 3 hours</option>
              </select>
            </label>
            <Switch label="Allow harder recipes" description="Pick recipes above your skill level too." checked={m.settings.stretch} onChange={(stretch) => m.setSettings({ ...m.settings, stretch })} />
          </Card>

          {m.loading && !menu?.ready ? <p className="mt-4 text-[15px] text-muted">Finding recipes for each course…</p> : null}

          {menu ? (
            <>
              <ol className="mt-6 space-y-3">
                {menu.courses.map((c, index) => (
                  <li key={`${c.label}-${index}`} className="rounded-card bg-surface p-4 sm:p-5">
                    <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
                      {c.label}
                      {c.optional ? " · optional" : ""}
                    </p>
                    {c.recipe ? (
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <Link href={`/recipes/${c.recipe.slug}`} className="text-[18px] font-semibold underline-offset-4 hover:underline">
                          {c.recipe.title}
                        </Link>
                        <StatusBadge recipe={c.recipe} />
                        {!c.idea ? (
                          <span className="text-[14px] text-muted">
                            {formatMinutes(c.recipe.totalMinutes)} · serves {c.recipe.servings}
                            {c.factor !== 1 ? `, made ×${formatAmount(c.factor)} for ${menu.guests}` : ""}
                            {c.perServingCents !== null ? ` · ${formatCents(c.perServingCents)}/serving` : ""}
                          </span>
                        ) : null}
                        {c.aboveSkill ? <span className="text-[14px] font-medium text-warning">Above your skill</span> : null}
                      </div>
                    ) : (
                      <p className="mt-1 text-[16px] text-muted">{c.note}</p>
                    )}
                    {c.recipe && c.note ? (
                      <p className="mt-1 flex items-center gap-1.5 text-[14px] text-muted">
                        <Lightbulb className="size-4" aria-hidden /> {c.note}
                      </p>
                    ) : null}
                    {c.alternatives.length > 0 ? (
                      <label className="relative mt-3 inline-block">
                        <span className="sr-only">Swap {c.label}</span>
                        <select
                          value=""
                          onChange={(e) => e.target.value && m.pin(index, e.target.value)}
                          className="min-h-10 appearance-none rounded-full border border-border bg-background pr-9 pl-4 text-[15px] font-medium"
                        >
                          <option value="">Swap for…</option>
                          {c.alternatives.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.title}
                              {a.library?.status === "idea" ? " (idea)" : ""}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
                      </label>
                    ) : null}
                  </li>
                ))}
              </ol>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <Card>
                  <Eyebrow>At a glance</Eyebrow>
                  <ul className="mt-2 space-y-1.5 text-[16px]">
                    <li>
                      {menu.ready} of {menu.courses.length} courses have a full recipe
                    </li>
                    {menu.ready > 0 ? <li>About {formatMinutes(menu.activeMinutes)} hands-on · start {formatMinutes(menu.startBefore)} before dinner</li> : null}
                    <li>
                      {m.store
                        ? menu.cost.cents > 0
                          ? `${formatCents(menu.cost.cents)} for ${menu.guests} at ${m.store.name}${menu.cost.unpriced > 0 ? ` — plus ${menu.cost.unpriced} ${menu.cost.unpriced === 1 ? "course" : "courses"} we couldn't fully price` : ""}`
                          : `We couldn't fully price these recipes at ${m.store.name} yet.`
                        : "Add your store on the Grocery page to see real prices. We never estimate prices."}
                    </li>
                    {m.settings.budgetCents ? (
                      <li>
                        Budget {formatCents(m.settings.budgetCents)}
                        {menu.cost.overBudget === null ? " — we'll compare once every course has a real price." : menu.cost.overBudget ? " — over budget." : " — within budget."}
                      </li>
                    ) : null}
                  </ul>
                  {menu.warnings.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-[15px]">
                      {menu.warnings.map((w) => (
                        <li key={w} className="flex gap-2 text-warning">
                          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                          {w}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Card>
                {menu.schedule.length > 0 ? (
                  <Card>
                    <Eyebrow>
                      <CalendarClock className="mr-1 inline size-4" aria-hidden /> What to start when
                    </Eyebrow>
                    <ol className="mt-2 space-y-1.5 text-[16px]">
                      {menu.schedule.map((s) => (
                        <li key={s.recipeTitle}>
                          <span className="font-semibold tabular-nums">{formatMinutes(s.startsBefore)} before</span> — {s.recipeTitle}
                        </li>
                      ))}
                    </ol>
                  </Card>
                ) : null}
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <Button onClick={() => void m.save()} icon={<Save className="size-5" aria-hidden />}>
                  Save menu
                </Button>
                <Button variant="secondary" disabled={!m.groceryReady || menu.shopping.length === 0} onClick={() => void m.addToGrocery()} icon={<ShoppingCart className="size-5" aria-hidden />}>
                  Add {menu.shopping.length} items to grocery list
                </Button>
                <Button variant="ghost" onClick={() => setShowShopping((v) => !v)} aria-expanded={showShopping} icon={<ListChecks className="size-5" aria-hidden />}>
                  {showShopping ? "Hide" : "Show"} shopping list
                </Button>
              </div>
              {m.notice ? (
                <p role="status" className="mt-3 rounded-2xl bg-accent-soft px-4 py-3 text-[15px]">
                  {m.notice}
                </p>
              ) : null}
              {showShopping ? (
                <ul className="mt-4 columns-1 gap-6 rounded-card bg-surface p-5 text-[15px] sm:columns-2">
                  {menu.shopping.map((s) => (
                    <li key={`${s.item}-${s.unit}`} className="mb-1.5 break-inside-avoid">
                      {s.quantity !== null ? `${formatAmount(s.quantity)}${s.unit ? ` ${s.unit}` : ""} ` : ""}
                      {s.item}
                      <span className="text-muted"> · {s.courses.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </>
      )}

      {m.saved.length > 0 ? (
        <section className="mt-10" aria-labelledby="saved-menus">
          <h2 id="saved-menus" className="mb-3 flex items-center gap-2 text-xl font-bold">
            <UtensilsCrossed className="size-5" aria-hidden /> Saved menus
          </h2>
          <ul className="space-y-2">
            {m.saved.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    go(s.templateCode);
                    m.open(s);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block font-semibold">{s.title}</span>
                  <span className="block text-[14px] text-muted">
                    {s.courses.length} courses · for {s.guests}
                  </span>
                </button>
                <button type="button" onClick={() => void m.remove(s.id)} aria-label={`Delete ${s.title}`} className="grid size-10 place-items-center rounded-full hover:bg-surface-strong">
                  <Trash2 className="size-4 text-muted" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
