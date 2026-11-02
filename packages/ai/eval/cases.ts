/**
 * Quality test set for comparing AI models (low-cost AI architecture, item 13).
 *
 * Each case is a household + planning mode, plus checks a good week must
 * pass. Checks are plain code — no AI grading — so results are repeatable
 * and comparable across providers. The built-in (non-AI) planner runs on
 * the same input as a baseline: a model is only worth paying for where it
 * beats that.
 *
 * Categories (from the brief): budget meals, authentic international
 * cuisines, advanced cooking, dietary restrictions — plus everyday
 * weeknights and using up the kitchen.
 */
import type { OnboardingProfile, PantryItem, PlanningMode, Recipe } from "@kitchen-pantry/shared-types";

export type Category = "budget" | "international" | "advanced" | "dietary" | "everyday";

export interface PlanCase {
  id: string;
  category: Category;
  title: string;
  mode: PlanningMode;
  profile: (p: OnboardingProfile) => void;
  pantry?: Array<Pick<PantryItem, "name" | "useBy">>;
  /** Extra checks for this case: name → passes? (picked recipes, in date order) */
  checks: Record<string, (picks: Recipe[]) => boolean>;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const cuisines = (rs: Recipe[]) => new Set(rs.map((r) => r.cuisine)).size;
const toBuy = (r: Recipe) => r.ingredients.filter((i) => !i.optional).length;

export const PLAN_CASES: PlanCase[] = [
  {
    id: "budget-family",
    category: "budget",
    title: "Family of four on a tight budget",
    mode: "budget_first",
    profile: (p) => {
      p.household.adults = 2;
      p.household.children = 2;
      p.household.cookingFor = 4;
      p.skillLevel = 2;
      p.budget.priority = "budget_first";
      p.goals.ranked = ["save_money", "reduce_waste"];
    },
    checks: { "few ingredients per dinner (avg ≤ 11)": (rs) => avg(rs.map(toBuy)) <= 11 },
  },
  {
    id: "budget-single",
    category: "budget",
    title: "Cooking for one, cheap and simple",
    mode: "budget_first",
    profile: (p) => {
      p.household.adults = 1;
      p.household.cookingFor = 1;
      p.skillLevel = 2;
    },
    checks: { "few ingredients per dinner (avg ≤ 10)": (rs) => avg(rs.map(toBuy)) <= 10 },
  },
  {
    id: "world-tour",
    category: "international",
    title: "Adventurous eaters: a world tour",
    mode: "chefs_choice",
    profile: (p) => {
      p.skillLevel = 3;
      p.goals.ranked = ["interesting_meals"];
    },
    checks: { "at least 5 different cuisines": (rs) => cuisines(rs) >= 5 },
  },
  {
    id: "authentic",
    category: "international",
    title: "Authentic traditional dishes",
    mode: "chefs_choice",
    profile: (p) => {
      p.skillLevel = 4;
    },
    checks: {
      "mostly traditional recipes (≥ 4 of 7)": (rs) => rs.filter((r) => r.library?.authenticity === "traditional").length >= 4,
      "at least 4 different cuisines": (rs) => cuisines(rs) >= 4,
    },
  },
  {
    id: "advanced",
    category: "advanced",
    title: "Experienced cook who wants a challenge",
    mode: "chefs_choice",
    profile: (p) => {
      p.skillLevel = 5;
      p.equipment = ["stove", "oven", "blender", "food_processor", "dutch_oven", "cast_iron", "stand_mixer", "grill"];
    },
    checks: { "ambitious (average skill ≥ 3)": (rs) => avg(rs.map((r) => r.skillLevel)) >= 3 },
  },
  {
    id: "beginner",
    category: "advanced",
    title: "Brand-new cook",
    mode: "balanced",
    profile: (p) => {
      p.skillLevel = 1;
    },
    checks: { "nothing above skill 2": (rs) => rs.every((r) => r.skillLevel <= 2) },
  },
  {
    id: "vegetarian",
    category: "dietary",
    title: "Vegetarian household",
    mode: "balanced",
    profile: (p) => {
      p.diet.style = "vegetarian";
    },
    checks: {},
  },
  {
    id: "vegan-nuts",
    category: "dietary",
    title: "Vegan with a tree-nut and peanut allergy",
    mode: "balanced",
    profile: (p) => {
      p.diet.style = "vegan";
      p.diet.allergies = ["tree_nut", "peanut"];
    },
    checks: {},
  },
  {
    id: "gf-df",
    category: "dietary",
    title: "Gluten-free and dairy-free",
    mode: "balanced",
    profile: (p) => {
      p.diet.restrictions = ["gluten_free", "dairy_free"];
    },
    checks: {},
  },
  {
    id: "halal-shellfish",
    category: "dietary",
    title: "Halal, shellfish allergy",
    mode: "balanced",
    profile: (p) => {
      p.diet.restrictions = ["halal"];
      p.diet.allergies = ["shellfish"];
    },
    checks: {},
  },
  {
    id: "busy-weeknights",
    category: "everyday",
    title: "Busy weeknights",
    mode: "balanced",
    profile: (p) => {
      p.skillLevel = 2;
    },
    checks: { "Mon–Thu dinners ≤ 45 min": (rs) => rs.slice(0, 4).every((r) => r.totalMinutes <= 45) },
  },
  {
    id: "use-it-up",
    category: "everyday",
    title: "Use what's in the fridge",
    mode: "use_what_i_have",
    profile: () => {},
    pantry: [
      { name: "chicken thighs", useBy: null },
      { name: "baby spinach", useBy: null },
      { name: "heavy cream", useBy: null },
    ],
    checks: { "at least 2 dinners use the kitchen items": (rs) => rs.filter((r) => r.ingredients.some((i) => /chicken thigh|spinach|heavy cream/i.test(i.item))).length >= 2 },
  },
];
