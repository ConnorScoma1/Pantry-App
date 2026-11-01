import { strict as assert } from "node:assert";
import { test } from "node:test";
import { z } from "zod";
import { AiOutputValidationError, parseStructuredOutput, readAiConfig } from "./index";

const substitution = z.object({
  ingredient: z.string(),
  substitute: z.string(),
  ratio: z.number().positive(),
});

test("valid JSON output passes validation", () => {
  const out = parseStructuredOutput(
    substitution,
    '{"ingredient":"shallot","substitute":"red onion","ratio":1}',
  );
  assert.equal(out.substitute, "red onion");
});

test("malformed or off-schema output is rejected", () => {
  assert.throws(() => parseStructuredOutput(substitution, "not json"), AiOutputValidationError);
  assert.throws(
    () => parseStructuredOutput(substitution, { ingredient: "x", substitute: "y", ratio: -1 }),
    AiOutputValidationError,
  );
});

test("AI is disabled (null config) when no key is set", () => {
  assert.equal(readAiConfig({}), null);
  const config = readAiConfig({ ANTHROPIC_API_KEY: "test-key" });
  assert.equal(config?.maxOutputTokens, 2048);
});
