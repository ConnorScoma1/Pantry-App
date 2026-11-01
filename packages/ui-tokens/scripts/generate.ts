/**
 * Writes the generated stylesheets consumed by the apps:
 *   packages/ui-tokens/generated/tokens.css  (web, imported by apps/web globals.css)
 *   apps/mobile/global.css                   (NativeWind entry stylesheet)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMobileCss, buildWebCss } from "../src/css";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const repoRoot = resolve(pkgRoot, "../..");

const outputs: Array<[string, string]> = [
  [resolve(pkgRoot, "generated/tokens.css"), buildWebCss()],
  [resolve(repoRoot, "apps/mobile/global.css"), buildMobileCss()],
];

for (const [path, contents] of outputs) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
  console.log(`wrote ${path}`);
}
