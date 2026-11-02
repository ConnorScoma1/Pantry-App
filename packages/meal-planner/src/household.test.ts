import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { ActivityEvent, AttendanceData } from "@kitchen-pantry/shared-types";
import { dayAttendance, summarizeActivity } from "./index";

const data: AttendanceData = {
  members: [
    { userId: "a", name: "Alex", isYou: true, portion: 1 },
    { userId: "s", name: "Sam", isYou: false, portion: 1.5 },
  ],
  answers: [
    { day: "2026-11-03", userId: "s", eating: false },
    { day: "2026-11-04", userId: "a", eating: true },
    { day: "2026-11-05", userId: "a", eating: false },
    { day: "2026-11-05", userId: "s", eating: false },
  ],
  guests: [{ day: "2026-11-03", guests: 2 }],
};

test("who's eating: no answer means eating; portions, others without accounts and guests add up", () => {
  const normal = dayAttendance(data, "2026-11-02", 3);
  assert.deepEqual([normal.servings, normal.others, normal.you, normal.summary], [4, 1, null, "Everyone's in"], "1 + 1.5 + 1 other = 3.5 → 4");
  const tue = dayAttendance(data, "2026-11-03", 3);
  assert.deepEqual([tue.servings, tue.summary, tue.out.map((m) => m.name)], [4, "Sam is out · 2 guests", ["Sam"]], "1 + 1 other + 2 guests");
  assert.equal(dayAttendance(data, "2026-11-04", 3).you, true);
  const thu = dayAttendance(data, "2026-11-05", 2);
  assert.deepEqual([thu.servings, thu.summary], [0, "Nobody's in"]);
  const kids = dayAttendance(data, "2026-11-05", 4);
  assert.deepEqual([kids.servings, kids.summary], [2, "You and Sam are out"], "two people without accounts still eat");
  const solo = dayAttendance({ members: [], answers: [], guests: [{ day: "2026-11-02", guests: 1 }] }, "2026-11-02", 2);
  assert.deepEqual([solo.servings, solo.summary], [3, "1 guest"], "preview mode: household size plus guests");
});

const ev = (kind: ActivityEvent["kind"], actorName: string | null, at: string, subject: string, detail: string | null = null, isYou = false): ActivityEvent => ({ kind, actorName, isYou, at, subject, detail });

test("activity: plain sentences, bursts grouped, newest first", () => {
  const items = summarizeActivity([
    ev("pantry_added", "Sam", "2026-11-01T10:00:00Z", "Rice"),
    ev("pantry_added", "Sam", "2026-11-01T10:01:00Z", "Olive oil"),
    ev("pantry_added", "Sam", "2026-11-01T10:02:00Z", "Garlic"),
    ev("grocery_added", "You", "2026-11-01T11:00:00Z", "Milk", "plan", true),
    ev("grocery_added", "You", "2026-11-01T11:00:01Z", "Eggs", "plan", true),
    ev("grocery_added", "You", "2026-11-01T11:00:02Z", "Spinach", "plan", true),
    ev("pantry_consumed", "Sam", "2026-11-01T12:00:00Z", "Baby spinach"),
    ev("pantry_expired", null, "2026-11-01T12:30:00Z", "Greek yogurt"),
    ev("rated", "Alex", "2026-11-01T13:00:00Z", "Honey Garlic Chicken", "5"),
    ev("rated", "Alex", "2026-11-01T13:01:00Z", "Fried Rice", "4"),
    ev("shop_logged", "Alex", "2026-11-01T14:00:00Z", "Kroger", "8642"),
    ev("plan_drafted", null, "2026-11-01T15:00:00Z", "2026-11-09"),
    ev("grocery_checked", "Sam", "2026-11-01T16:00:00Z", "Milk"),
    ev("grocery_checked", "Sam", "2026-11-01T16:01:00Z", "Eggs"),
  ]);
  assert.deepEqual(items.map((i) => i.text), [
    "Sam picked up milk and eggs",
    "Kitchen Pantry drafted the week of Nov 9",
    "Alex logged a $86.42 shop at Kroger",
    "Alex rated Fried Rice 4★",
    "Alex rated Honey Garlic Chicken 5★",
    "Someone threw out greek yogurt",
    "Sam used up baby spinach",
    "You added 3 items from the meal plan to the grocery list",
    "Sam added 3 items to the kitchen",
  ]);
  assert.equal(items[7]!.isYou, true);
  assert.equal(summarizeActivity([ev("pantry_added", "Sam", "2026-11-01T10:00:00Z", "Rice"), ev("pantry_added", "Sam", "2026-11-01T11:00:00Z", "Garlic")]).length, 2, "an hour apart isn't one burst");
});
