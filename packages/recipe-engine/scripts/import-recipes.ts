/**
 * Controlled bulk import for the recipe library (spec 08 §7, §10).
 *
 *   npm run recipes:import -- --file data/partner.json            # dry run: validate and report only
 *   npm run recipes:import -- --file data/partner.json --sql out.sql   # write a SQL file to review and apply with psql
 *   npm run recipes:import -- --file data/partner.json --apply    # send to Supabase (service role), 200 per batch
 *
 * Input: JSON `{ "source": { name, kind, url?, license, attribution? }, "recipes": [ ... ] }`
 * where recipes are in the library's import format, or `--format schema-org` for an array of
 * schema.org/Recipe objects (then `--cuisine` and `--skill` give defaults schema.org lacks).
 *
 * Every record goes through prepareRecipe() (validation, units, USDA safe temperatures,
 * allergens, licence and status rules) and the duplicate check against the bundled
 * catalogue and, with --apply, the live library. A report is always written next to
 * the input (<file>.report.json). Nothing is fetched from the web, and nothing runs on
 * app start-up. New sources are created unapproved: their recipes stay hidden until
 * you approve the source after checking its licence.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import {
  buildImportSql,
  catalogRecipes,
  createDuplicateIndex,
  fromSchemaOrg,
  prepareRecipe,
  toImportPayload,
  type ImportIssue,
  type LibraryRecipe,
  type LibraryRecipeInput,
  type LibrarySourceInput,
} from "../src/index";

type Args = Record<string, string | boolean>;
function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[a.slice(2)] = next;
      i++;
    } else out[a.slice(2)] = true;
  }
  return out;
}

const MAX_RECORDS = 50_000;
const BATCH = 200;

async function existingFromDatabase(url: string, key: string) {
  // Only what the duplicate check needs, paged.
  const out: Array<{ id: string; slug: string; title: string; cuisine: string | null; dish_key: string | null; variant: string; core_ingredients: string[] }> = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/recipes?select=id,slug,title,cuisine,dish_key,variant,core_ingredients&visibility=eq.public&order=id`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`Couldn't read the current library (HTTP ${res.status}).`);
    const rows = (await res.json()) as typeof out;
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = typeof args.file === "string" ? args.file : null;
  if (!file) {
    console.error("Usage: npm run recipes:import -- --file <feed.json> [--format schema-org --cuisine <code> --skill <1-5>] [--sql out.sql] [--apply]");
    process.exit(2);
  }
  const raw = JSON.parse(readFileSync(file, "utf8")) as { source?: LibrarySourceInput; recipes?: unknown[] } | unknown[];
  const source = (!Array.isArray(raw) && raw.source) || (typeof args.source === "string" ? (JSON.parse(readFileSync(args.source, "utf8")) as LibrarySourceInput) : null);
  if (!source) throw new Error("The feed needs a \"source\" (name, kind, licence), or pass --source source.json.");
  const records = (Array.isArray(raw) ? raw : (raw.recipes ?? [])) as unknown[];
  if (records.length > MAX_RECORDS) throw new Error(`At most ${MAX_RECORDS} records per run.`);

  const inputs: LibraryRecipeInput[] =
    args.format === "schema-org"
      ? records.map((r) => fromSchemaOrg(r as Record<string, unknown>, { cuisine: String(args.cuisine ?? ""), skillLevel: Number(args.skill ?? 2) }))
      : (records as LibraryRecipeInput[]);

  const index = createDuplicateIndex(catalogRecipes);
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (args.apply) {
    if (!url || !key) throw new Error("--apply needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
    for (const r of await existingFromDatabase(url, key)) {
      index.add({ ...(catalogRecipes[0]!), id: r.id, slug: r.slug, title: r.title, cuisine: r.cuisine as never, ingredients: r.core_ingredients.map((c, n) => ({ position: n + 1, component: null, quantity: null, unit: null, item: c, preparation: null, optional: false })), library: { ...catalogRecipes[0]!.library!, dishKey: r.dish_key ?? r.slug, variant: r.variant as never } });
    }
  }

  const accepted: LibraryRecipe[] = [];
  const report = {
    file: basename(file),
    source: source.name,
    received: inputs.length,
    accepted: 0,
    updates: 0,
    rejected: [] as Array<{ externalId: string; title: string; errors: ImportIssue[] }>,
    duplicates: [] as Array<{ externalId: string; title: string; kind: string; existing: string }>,
    warnings: [] as Array<{ externalId: string; warnings: ImportIssue[] }>,
  };
  for (const input of inputs) {
    const r = prepareRecipe(input, source);
    if (!r.ok) {
      report.rejected.push({ externalId: String(input.externalId ?? ""), title: String(input.title ?? ""), errors: r.errors });
      continue;
    }
    const matches = index.check(r.recipe);
    const blocking = matches.find((m) => m.kind === "near_duplicate" || m.kind === "renamed_duplicate");
    if (blocking) {
      report.duplicates.push({ externalId: r.recipe.externalId, title: r.recipe.title, kind: blocking.kind, existing: blocking.existing.title });
      continue;
    }
    if (matches.some((m) => m.kind === "same_record")) report.updates += 1;
    if (r.warnings.length) report.warnings.push({ externalId: r.recipe.externalId, warnings: r.warnings });
    index.add(r.recipe);
    accepted.push(r.recipe);
  }
  report.accepted = accepted.length;

  const reportPath = `${file}.report.json`;
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`${report.received} received · ${report.accepted} accepted (${report.updates} updates) · ${report.rejected.length} rejected · ${report.duplicates.length} duplicates · ${report.warnings.length} with warnings`);
  console.log(`Report: ${reportPath}`);

  if (typeof args.sql === "string") {
    writeFileSync(args.sql, buildImportSql(accepted, source, `Source: ${source.name} (${source.license})\nFile: ${basename(file)} — ${accepted.length} recipes`));
    console.log(`SQL for review: ${args.sql}`);
  }
  if (args.apply) {
    const rejected = report.rejected.length + report.duplicates.length;
    for (let i = 0; i < accepted.length; i += BATCH) {
      const chunk = accepted.slice(i, i + BATCH);
      const res = await fetch(`${url}/rest/v1/rpc/import_recipe_batch`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          batch: {
            file: basename(file),
            received: i === 0 ? report.received : 0,
            rejected: i === 0 ? rejected : 0,
            report: i === 0 ? { rejected: report.rejected.slice(0, 200), duplicates: report.duplicates.slice(0, 200) } : {},
            source: { ...source, attributionRequired: /^cc-by|^licensed:/i.test(source.license) },
            recipes: chunk.map((r) => toImportPayload(r)),
          },
        }),
      });
      if (!res.ok) throw new Error(`Batch ${i / BATCH + 1} failed (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
      console.log(`Batch ${i / BATCH + 1}: ${JSON.stringify(await res.json())}`);
    }
    console.log(`Done. If "${source.name}" is new, approve it in Supabase once its licence is confirmed — until then its recipes stay hidden.`);
  } else if (typeof args.sql !== "string") {
    console.log("Dry run — nothing was written to the database. Add --sql out.sql or --apply.");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
