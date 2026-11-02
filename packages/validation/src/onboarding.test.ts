import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  defaultOnboardingProfile,
  householdStepSchema,
  isValidPostalCode,
  issuesToFieldErrors,
  onboardingProfileSchema,
  signUpSchema,
} from "./index";

function validProfile() {
  const p = defaultOnboardingProfile();
  p.household.postalCode = "53132";
  p.goals.ranked = ["save_money", "reduce_waste"];
  return p;
}

test("a completed default profile validates", () => {
  const result = onboardingProfileSchema.safeParse(validProfile());
  assert.ok(result.success, JSON.stringify(result.error?.issues));
});

test("US ZIP codes must be 5 digits (ZIP+4 allowed)", () => {
  assert.ok(isValidPostalCode("US", "53132"));
  assert.ok(isValidPostalCode("US", "53132-1234"));
  assert.ok(!isValidPostalCode("US", "5313"));
  assert.ok(isValidPostalCode("CA", "K1A 0B1"));
  assert.ok(isValidPostalCode("OTHER", "75008"));
});

test("household step reports field-level errors", () => {
  const p = validProfile();
  const result = householdStepSchema.safeParse({ ...p.household, postalCode: "12", adults: 0 });
  assert.ok(!result.success);
  const errors = issuesToFieldErrors(result.error);
  assert.match(errors.postalCode ?? "", /ZIP/);
  assert.ok(errors.adults);
});

test("dinner selected with zero dinners per week is rejected", () => {
  const p = validProfile();
  const result = householdStepSchema.safeParse({ ...p.household, dinnersPerWeek: 0 });
  assert.ok(!result.success);
});

test("goals must be non-empty and unique", () => {
  const p = validProfile();
  assert.ok(!onboardingProfileSchema.safeParse({ ...p, goals: { ranked: [] } }).success);
  assert.ok(
    !onboardingProfileSchema.safeParse({ ...p, goals: { ranked: ["save_money", "save_money"] } })
      .success,
  );
});

test("free-text tags are trimmed and de-duplicated case-insensitively", () => {
  const p = validProfile();
  p.diet.dislikes = ["  Olives ", "olives", "Mushrooms"];
  const parsed = onboardingProfileSchema.parse(p);
  assert.deepEqual(parsed.diet.dislikes, ["Olives", "Mushrooms"]);
});

test("unknown allergen codes are rejected", () => {
  const p = validProfile();
  const bad = { ...p, diet: { ...p.diet, allergies: ["peanut", "kryptonite"] } };
  assert.ok(!onboardingProfileSchema.safeParse(bad).success);
});

test("no strict budget is represented as null", () => {
  const p = validProfile();
  p.budget.amountCents = null;
  assert.ok(onboardingProfileSchema.safeParse(p).success);
});

test("sign-up requires a 10+ character password", () => {
  assert.ok(!signUpSchema.safeParse({ email: "a@b.co", password: "short" }).success);
  assert.ok(signUpSchema.safeParse({ email: " A@B.co ", password: "long-enough-pw" }).success);
});

test("validateOnboardingStep checks only that step", async () => {
  const { validateOnboardingStep } = await import("./index");
  const p = defaultOnboardingProfile();
  assert.ok(validateOnboardingStep("household", p).postalCode);
  assert.deepEqual(validateOnboardingStep("budget", p), {});
  assert.ok(validateOnboardingStep("goals", p).ranked);
});

test("social providers: only the ones Supabase reports as on", async () => {
  const { enabledSocialProviders, authErrorMessage } = await import("./auth");
  assert.deepEqual(enabledSocialProviders({ external: { google: true, apple: false, facebook: true, github: true, email: true } }), ["google", "facebook"]);
  assert.deepEqual(enabledSocialProviders({ external: { google: "yes" } }), []);
  assert.deepEqual(enabledSocialProviders(null), []);
  assert.deepEqual(enabledSocialProviders({}), []);
  // Sign-in never says whether an account exists.
  assert.equal(authErrorMessage("invalid_credentials", "sign-in"), authErrorMessage("user_not_found", "sign-in"));
  assert.match(authErrorMessage("over_email_send_rate_limit", "sign-up"), /Too many emails/);
  assert.match(authErrorMessage(undefined, "sign-up"), /couldn't create/);
});
