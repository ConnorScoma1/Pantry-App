/**
 * Connection check for the configured AI provider: one tiny request, tried a
 * few ways, with the provider's own error reason when one fails. Use it when
 * the proof of concept or the quality test falls back immediately.
 *
 *   npm run ai:check
 *
 * Prints and saves packages/ai/eval/results/check-<date>.md. The key is never
 * printed: any text that contains it is masked.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { geminiEndpoint, GEMINI_STUDIO_URL, GEMINI_VERTEX_URL, readAiSetup, toGeminiSchema } from "../src/index";
import { loadWebEnv, ROOT } from "./lib";

const out: string[] = [];
const say = (s: string) => {
  out.push(s);
  console.log(s);
};

const schema = { type: "object", additionalProperties: false, required: ["dish"], properties: { dish: { type: "string" }, note: { type: ["string", "null"] } } };

/** Gemini's older response schema format (OpenAPI-style types). */
function toOpenApiSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(toOpenApiSchema);
  if (!s || typeof s !== "object") return s;
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
    if (k === "additionalProperties") continue;
    if (k === "type") {
      const types = Array.isArray(v) ? v : [v];
      const real = types.filter((t) => t !== "null");
      o.type = String(real[0] ?? "string").toUpperCase();
      if (types.includes("null")) o.nullable = true;
    } else if (k === "properties") {
      o.properties = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([p, x]) => [p, toOpenApiSchema(x)]));
    } else o[k] = toOpenApiSchema(v);
  }
  return o;
}

async function main() {
  console.log("Checking the AI connection (up to 8 tiny requests, 20 s each at most)…");
  loadWebEnv();
  const setup = readAiSetup();
  if ("problem" in setup) {
    say(`AI isn't set up: ${setup.problem}`);
    return;
  }
  const key = setup.apiKey;
  const mask = (t: string) => t.split(key).join("[key]");
  say(`Provider: ${setup.provider} · model: ${setup.model} · key looks like: ${key.slice(0, 3)}… (${key.length} characters)`);
  if (setup.provider !== "gemini") {
    say("This check covers Gemini; other providers report their error in the proof of concept.");
    return;
  }
  const ep = geminiEndpoint(setup);
  say(`Endpoint the app uses: ${ep === "vertex" ? "Vertex AI (GEMINI_ENDPOINT=vertex)" : "Google AI Studio"}`);

  const base = (where: "vertex" | "studio") => `${where === "vertex" ? GEMINI_VERTEX_URL : GEMINI_STUDIO_URL}/${encodeURIComponent(setup.model)}:generateContent`;
  const contents = [{ role: "user", parts: [{ text: "Name one easy weeknight dinner." }] }];
  const variants: Array<{ name: string; url: string; headers: Record<string, string>; body: unknown }> = [];
  for (const where of ep === "vertex" ? (["vertex", "studio"] as const) : (["studio", "vertex"] as const)) {
    variants.push(
      { name: `${where} · key in header · JSON schema`, url: base(where), headers: { "x-goog-api-key": key }, body: { contents, generationConfig: { maxOutputTokens: 200, responseMimeType: "application/json", responseJsonSchema: toGeminiSchema(schema) } } },
      { name: `${where} · key in URL · JSON schema`, url: `${base(where)}?key=${encodeURIComponent(key)}`, headers: {}, body: { contents, generationConfig: { maxOutputTokens: 200, responseMimeType: "application/json", responseJsonSchema: toGeminiSchema(schema) } } },
      { name: `${where} · key in URL · older schema format`, url: `${base(where)}?key=${encodeURIComponent(key)}`, headers: {}, body: { contents, generationConfig: { maxOutputTokens: 200, responseMimeType: "application/json", responseSchema: toOpenApiSchema(schema) } } },
      { name: `${where} · key in URL · plain text`, url: `${base(where)}?key=${encodeURIComponent(key)}`, headers: {}, body: { contents, generationConfig: { maxOutputTokens: 200 } } },
    );
  }

  say("");
  for (const v of variants) {
    try {
      const res = await fetch(v.url, { method: "POST", headers: { "content-type": "application/json", ...v.headers }, body: JSON.stringify(v.body), signal: AbortSignal.timeout(20_000) });
      const text = await res.text();
      let detail = "";
      try {
        const j = JSON.parse(text) as { error?: { status?: string; message?: string }; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
        detail = j.error
          ? `${j.error.status ?? ""} — ${(j.error.message ?? "").slice(0, 300)}`
          : `answer: ${(j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "").slice(0, 120)} · finish ${j.candidates?.[0]?.finishReason ?? "?"} · tokens ${j.usageMetadata?.promptTokenCount ?? "?"}/${j.usageMetadata?.candidatesTokenCount ?? "?"}`;
      } catch {
        detail = text.slice(0, 200);
      }
      say(`${res.ok ? "OK  " : "FAIL"} ${res.status}  ${v.name}\n      ${mask(detail)}`);
    } catch (e) {
      say(`FAIL ---  ${v.name}\n      ${mask(e instanceof Error ? e.message : String(e))}`);
    }
  }
}

main()
  .catch((e) => say(`Failed: ${e instanceof Error ? e.message : String(e)}`))
  .finally(() => {
    const dir = resolve(ROOT, "packages/ai/eval/results");
    mkdirSync(dir, { recursive: true });
    const file = resolve(dir, `check-${new Date().toISOString().slice(0, 10)}.md`);
    writeFileSync(file, ["# AI connection check", "", "```", ...out, "```", ""].join("\n"));
    console.log(`\nSaved to ${file}`);
  });
