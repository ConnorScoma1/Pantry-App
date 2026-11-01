import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildMobileCss, buildWebCss, hexToRgbChannels } from "./css";
import { colorRoles, darkColors, lightColors } from "./tokens";

const here = dirname(fileURLToPath(import.meta.url));

test("hexToRgbChannels converts hex to space-separated channels", () => {
  assert.equal(hexToRgbChannels("#2F6B4F"), "47 107 79");
  assert.equal(hexToRgbChannels("ffffff"), "255 255 255");
  assert.throws(() => hexToRgbChannels("#fff"));
});

test("every colour role is defined in both themes", () => {
  for (const role of colorRoles) {
    assert.ok(lightColors[role], `light theme missing ${role}`);
    assert.ok(darkColors[role], `dark theme missing ${role}`);
  }
});

test("generated stylesheets are in sync with tokens.ts (run `npm run tokens`)", () => {
  const web = readFileSync(resolve(here, "../generated/tokens.css"), "utf8");
  assert.equal(web, buildWebCss());
  const mobile = readFileSync(resolve(here, "../../../apps/mobile/global.css"), "utf8");
  assert.equal(mobile, buildMobileCss());
});
