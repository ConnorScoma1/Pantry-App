/**
 * Compare AI models on the quality test set (eval/cases.ts).
 *
 *   npm run ai:eval                         # the provider and model in apps/web/.env.local
 *   npm run ai:eval -- --only budget        # one category (budget, international, advanced, dietary, everyday)
 *   npm run ai:eval -- --baseline           # built-in planner only (no AI, no cost)
 *   npm run ai:eval -- --pause 0            # seconds between weeks (default 5: free tiers limit requests per minute)
 *
 * Each case plans one week with the model and, on the same input, with the
 * built-in planner. Every week is scored by plain code: validated JSON,
 * all 7 nights filled, every pick passes the household's hard filters again
 * (allergies, diet, equipment, skill), no repeats, variety, no price talk,
 * plus the case's own checks. Writes a Markdown report to
 * packages/ai/eval/results/ and prints the totals: pass rate, tokens,
 * estimated cost, time. Run it for each model you're considering and
 * compare the reports.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { planWeek, type PlanWeekInput } from "@kitchen-pantry/meal-planner";
import { rankRecipe, rankRecipes, recipeProteins } from "@kitchen-pantry/recipe-engine";
import type { PantryItem, Recipe } from "@kitchen-pantry/shared-types";
import { PLAN_CASES, type PlanCase } from "../eval/cases";
import { estimateCostMicros, planWeekWithAi, readAiSetup, type AiConfig } from "../src/index";
import { arg, flag, loadRecipes, loadWebEnv, nextWeek, ROOT, sampleProfile, usd } from "./lib";

const PRICE_TALK = /[$€£]\s?\d|\b\d+(\.\d+)?\s?(dollars?|cents?|usd)\b/i;

interface Scored {
  checks: Array<{ name: string; pass: boolean }>;
  titles: string[];
}

function score(c: PlanCase, picks: Array<{ date: string; recipeId: string; note: string }>, summary: string, recipes: Map<string, Recipe>, ctx: Parameters<typeof rankRecipe>[1], days: string[]): Scored {
  const chosen = days.map((d) => picks.find((p) => p.date === d)).map((p) => (p ? recipes.get(p.recipeId) : undefined));
  const rs = chosen.filter((r): r is Recipe => Boolean(r));
  const proteins = rs.map((r) => recipeProteins(r)[0] ?? "none");
  const sameInARow = proteins.filter((p, i) => i > 0 && p !== "none" && p === proteins[i - 1]).length;
  const checks = [
    { name: "all 7 nights filled", pass: rs.length === days.length },
    { name: "every pick passes the hard filters (allergies, diet, equipment, skill)", pass: rs.every((r) => { const k = rankRecipe(r, ctx); return k.allowed && !k.aboveSkill; }) },
    { name: "no recipe twice", pass: new Set(rs.map((r) => r.id)).size === rs.length },
    { name: "same main protein on consecutive nights at most once", pass: sameInARow <= 1 },
    { name: "no prices invented", pass: !PRICE_TALK.test(`${summary} ${picks.map((p) => p.note).join(" ")}`) },
    ...Object.entries(c.checks).map(([name, fn]) => ({ name, pass: rs.length > 0 && fn(rs) })),
  ];
  return { checks, titles: chosen.map((r) => r?.title ?? "—") };
}

async function main() {
  loadWebEnv();
  const baselineOnly = flag("baseline");
  const setup = readAiSetup();
  if ("problem" in setup && !baselineOnly) {
    console.error(`AI isn't set up: ${setup.problem} (or run with --baseline).`);
    process.exit(1);
  }
  const config: AiConfig | null = "problem" in setup || baselineOnly ? null : setup;
  const only = arg("only");
  const { recipes, source } = await loadRecipes();
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const today = new Date().toISOString().slice(0, 10);
  const days = nextWeek();
  const cases = PLAN_CASES.filter((c) => !only || c.category === only || c.id === only);

  const lines: string[] = [
    `# AI quality test — ${config ? `${config.provider} / ${config.model}` : "built-in planner only"}`,
    "",
    `Run ${new Date().toISOString()} · recipes: ${source} · week of ${days[0]}`,
    "",
  ];
  let aiPass = 0, basePass = 0, total = 0, tokensIn = 0, tokensOut = 0, cost = 0, ms = 0, fallbacks = 0;

  const pause = Math.max(0, Number(arg("pause") ?? 5)) * 1000;
  let first = true;
  for (const c of cases) {
    if (config && !first && pause) await new Promise((r) => setTimeout(r, pause));
    first = false;
    const profile = sampleProfile(c.profile);
    const pantry: PantryItem[] = (c.pantry ?? []).map((p, i) => ({
      id: `p${i}`, ingredientId: null, name: p.name, category: "other", quantity: null, unit: null, storageLocation: "fridge", purchasedOn: null,
      useBy: p.useBy, openedOn: null, estimatedRemainingPct: null, pricePaidCents: null, isStaple: false, createdAt: today, updatedAt: today,
    }));
    const ctx = { profile, pantry, today, favorites: new Set<string>(), ratings: new Map(), myRatings: new Map(), seasonal: null, taste: null };
    const candidates = rankRecipes(recipes, ctx).recipes;
    const input: PlanWeekInput = { days, candidates, mode: c.mode, goals: profile.goals.ranked, servings: profile.household.cookingFor };

    const base = planWeek(input);
    const b = score(c, base.picks, base.summary, byId, ctx, days);
    lines.push(`## ${c.title} (${c.category}, ${c.mode})`, "", `${candidates.length} suitable recipes after code filters.`, "");

    let a: Scored | null = null;
    let note = "";
    if (config) {
      const t = Date.now();
      const r = await planWeekWithAi({ config, input, skillLevel: profile.skillLevel, householdSize: profile.household.cookingFor, cacheScope: `eval:${c.id}` });
      const took = Date.now() - t;
      ms += took;
      if (r.source !== "ai") fallbacks++;
      if (r.usage) {
        tokensIn += r.usage.inputTokens;
        tokensOut += r.usage.outputTokens;
        cost += estimateCostMicros(config.price, r.usage) ?? 0;
      }
      a = score(c, r.source === "ai" ? r.picks : [], r.summary, byId, ctx, days);
      a.checks.unshift({ name: "valid AI answer (no fallback)", pass: r.source === "ai" });
      note = `${(took / 1000).toFixed(1)} s · ${r.usage ? `${r.usage.inputTokens}/${r.usage.outputTokens} tokens` : "no usage"}${r.notice ? ` · ${r.notice}` : ""}`;
    }

    lines.push(`| Check | ${config ? "AI | " : ""}Built-in |`, `|---|${config ? "---|" : ""}---|`);
    for (const chk of [...(a?.checks ?? []), ...b.checks.filter((x) => !a?.checks.some((y) => y.name === x.name))]) {
      const ai = a?.checks.find((x) => x.name === chk.name);
      const bc = b.checks.find((x) => x.name === chk.name);
      lines.push(`| ${chk.name} | ${config ? `${ai ? (ai.pass ? "✅" : "❌") : "—"} | ` : ""}${bc ? (bc.pass ? "✅" : "❌") : "—"} |`);
    }
    if (a) {
      aiPass += a.checks.filter((x) => x.pass).length;
      total += a.checks.length;
    }
    basePass += b.checks.filter((x) => x.pass).length;
    lines.push("", config ? `AI week: ${a!.titles.join(" · ")}` : "", `Built-in week: ${b.titles.join(" · ")}`, note ? `\n${note}` : "", "");
    console.log(`${c.id}: ${a ? `AI ${a.checks.filter((x) => x.pass).length}/${a.checks.length}` : ""} built-in ${b.checks.filter((x) => x.pass).length}/${b.checks.length}`);
  }

  const baseTotal = cases.reduce((n, c) => n + 5 + Object.keys(c.checks).length, 0);
  const summary = [
    "## Totals",
    "",
    config ? `- AI: ${aiPass}/${total} checks passed, ${fallbacks} fallback(s), ${tokensIn.toLocaleString()} input + ${tokensOut.toLocaleString()} output tokens, estimated ${usd(cost)} for ${cases.length} weeks, ${(ms / 1000 / Math.max(cases.length, 1)).toFixed(1)} s per week` : "",
    `- Built-in planner: ${basePass}/${baseTotal} checks passed (no AI, no cost)`,
    "",
  ];
  lines.splice(4, 0, ...summary);
  const dir = resolve(ROOT, "packages/ai/eval/results");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${today}-${config ? `${config.provider}-${config.model}` : "baseline"}.md`.replace(/[^\w.-]+/g, "-"));
  writeFileSync(file, lines.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n"));
  console.log(summary.filter(Boolean).join("\n"));
  console.log(`Report: ${file}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
