import { strict as assert } from "node:assert";
import { test } from "node:test";
import { defaultOnboardingProfile } from "@kitchen-pantry/validation";
import { parseStoredProfile, toSaveProfilePayload } from "./index";

test("toSaveProfilePayload rejects incomplete profiles", () => {
  assert.throws(() => toSaveProfilePayload(defaultOnboardingProfile())); // no ZIP, no goals
});

test("round-trips a valid profile", () => {
  const p = defaultOnboardingProfile();
  p.household.postalCode = "53132";
  p.goals.ranked = ["save_time"];
  const { profile } = toSaveProfilePayload(p);
  assert.deepEqual(parseStoredProfile(JSON.parse(JSON.stringify(profile))), profile);
});

test("parseStoredProfile returns null for missing or stale data", () => {
  assert.equal(parseStoredProfile(null), null);
  assert.equal(parseStoredProfile({ household: {} }), null);
});
