import { strict as assert } from "node:assert";
import { test } from "node:test";
import { addDays, startOfWeek, summarizeBasket, weekDates, weeklyBudgetCents } from "./index";

test("weeks start on Monday", () => {
  assert.equal(startOfWeek("2026-11-01"), "2026-10-26"); // Sunday -> previous Monday
  assert.equal(startOfWeek("2026-11-09"), "2026-11-09"); // Monday
  assert.equal(startOfWeek("2026-11-15"), "2026-11-09"); // Sunday
});

test("weekDates spans seven days across month boundaries", () => {
  const days = weekDates("2026-11-30");
  assert.equal(days.length, 7);
  assert.equal(days[6], "2026-12-06");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("budget periods convert to weekly", () => {
  assert.equal(weeklyBudgetCents(12_000, "week"), 12_000);
  assert.equal(weeklyBudgetCents(24_000, "two_weeks"), 12_000);
  assert.equal(weeklyBudgetCents(52_000, "month"), 12_000);
  assert.equal(weeklyBudgetCents(null, "week"), null);
});

test("a basket of estimates can never be declared within budget", () => {
  const lines = [
    { totalCents: 500, status: "verified" as const },
    { totalCents: 300, status: "estimated" as const },
  ];
  assert.equal(summarizeBasket(lines, 1000).verdict, "estimate_within_budget");
});

test("verified + cached basket can be declared within/over budget", () => {
  const lines = [
    { totalCents: 500, status: "verified" as const },
    { totalCents: 300, status: "cached" as const },
  ];
  assert.equal(summarizeBasket(lines, 1000).verdict, "within_budget");
  assert.equal(summarizeBasket(lines, 700).verdict, "over_budget");
});

test("missing prices make the verdict incomplete", () => {
  const lines = [
    { totalCents: 500, status: "verified" as const },
    { totalCents: null, status: "unavailable" as const },
  ];
  const summary = summarizeBasket(lines, 10_000);
  assert.equal(summary.verdict, "incomplete");
  assert.equal(summary.unpricedLines, 1);
});
