/**
 * Offline drafting of full recipes for the library's dish ideas, with the
 * Claude Message Batches API (half price; results within 24 hours). This is
 * how the catalogue grows toward 10,000+ without generating anything when
 * the app starts or when someone opens a page.
 *
 *   npm run recipes:draft -- --count 100 [--cuisine thai]   # submit a batch, prints its id
 *   npm run recipes:draft -- --collect <batch_id>           # when it's ended: writes drafts/<id>.json
 *   npm run recipes:import -- --file drafts/<id>.json --sql drafts/<id>.sql
 *
 * Drafts arrive as "pending_review". The import tool validates every one
 * (units, USDA temperatures, safety notes, duplicates); a person should read
 * them before the source "Kitchen Pantry AI drafts" is approved. Cost is
 * printed after collecting. Needs ANTHROPIC_API_KEY.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { catalogRecipes } from "@kitchen-pantry/recipe-engine";
import { ANTHROPIC_VERSION, answerToInput, batchDraftRequests, readAiConfig, recipeDraftAnswerSchema } from "../src/index";

const API = "https://api.anthropic.com/v1/messages/batches";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const config = readAiConfig();
  if (!config) throw new Error("Set ANTHROPIC_API_KEY first.");
  const headers = { "x-api-key": config.apiKey, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" };
  const collect = arg("collect");

  if (!collect) {
    const count = Math.min(Number(arg("count") ?? 50), 10_000);
    const cuisine = arg("cuisine");
    const complete = new Set(catalogRecipes.filter((r) => r.library?.status !== "idea").map((r) => `${r.cuisine}:${r.library?.dishKey}`));
    const ideas = catalogRecipes.filter((r) => r.library?.status === "idea" && (!cuisine || r.cuisine === cuisine) && !complete.has(`${r.cuisine}:${r.library?.dishKey}`)).slice(0, count);
    if (ideas.length === 0) throw new Error("No dish ideas left to draft for that filter.");
    const res = await fetch(API, { method: "POST", headers, body: JSON.stringify({ requests: batchDraftRequests(ideas, config) }) });
    if (!res.ok) throw new Error(`Batch submit failed (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
    const batch = (await res.json()) as { id: string };
    console.log(`Submitted ${ideas.length} drafts as batch ${batch.id}. Collect with: npm run recipes:draft -- --collect ${batch.id}`);
    return;
  }

  const status = (await (await fetch(`${API}/${collect}`, { headers })).json()) as { processing_status: string; results_url: string | null };
  if (status.processing_status !== "ended" || !status.results_url) {
    console.log(`Batch ${collect} is ${status.processing_status}; try again later.`);
    return;
  }
  const text = await (await fetch(status.results_url, { headers })).text();
  const byId = new Map(catalogRecipes.map((r) => [r.id, r]));
  const recipes: unknown[] = [];
  let failed = 0;
  let inTok = 0;
  let outTok = 0;
  for (const line of text.split("\n").filter(Boolean)) {
    const row = JSON.parse(line) as { custom_id: string; result: { type: string; message?: { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } } } };
    const idea = byId.get(row.custom_id);
    inTok += row.result.message?.usage?.input_tokens ?? 0;
    outTok += row.result.message?.usage?.output_tokens ?? 0;
    const body = row.result.message?.content?.find((c) => c.type === "text")?.text;
    const parsed = row.result.type === "succeeded" && body && idea ? recipeDraftAnswerSchema.safeParse(JSON.parse(body)) : null;
    if (!idea || !parsed?.success) {
      failed += 1;
      continue;
    }
    recipes.push(answerToInput(parsed.data, { kind: "idea", idea }, `draft:${idea.cuisine}:${idea.library?.dishKey ?? idea.slug}`));
  }
  mkdirSync("drafts", { recursive: true });
  const out = `drafts/${collect}.json`;
  writeFileSync(out, JSON.stringify({ source: { name: "Kitchen Pantry AI drafts", kind: "ai_generated", license: "owned" }, recipes }, null, 2));
  // Batch prices are half the standard per-token prices; see https://platform.claude.com/docs/en/about-claude/pricing.
  console.log(`${recipes.length} drafts written to ${out} (${failed} unusable). Tokens: ${inTok} in, ${outTok} out.`);
  console.log(`Next: npm run recipes:import -- --file ${out} --sql drafts/${collect}.sql`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
