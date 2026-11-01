/**
 * Writes supabase/seed_recipes.sql from the Test Kitchen catalogue so the
 * database and preview mode always serve identical recipes.
 * Run: npm run seed --workspace=@kitchen-pantry/recipe-engine
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRecipeSeedSql } from "../src/catalog/seed-sql";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../../supabase/seed_recipes.sql");
writeFileSync(out, buildRecipeSeedSql(), "utf8");
console.log(`wrote ${out}`);
