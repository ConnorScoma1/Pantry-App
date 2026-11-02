import type { CountryCode, HolidayCode, OnboardingProfile, Recipe, Season, SeasonalSettings } from "@kitchen-pantry/shared-types";
import { upcomingHolidays, type HolidayDate } from "./holidays";
import { matchProduce, signatureProduce, type ProduceItem } from "./produce";
import { regionFor, seasonOn, type SeasonalRegion } from "./region";

export * from "./holidays";
export * from "./produce";
export * from "./region";

/**
 * Seasonal cooking (spec 06). Works out the season from the household's
 * place and today's date — no setting to update as the year turns — and
 * gives recipes a bounded nudge. It never filters anything out and never
 * says anything about price (in-season isn't assumed to be cheaper).
 */
export interface SeasonalContext {
  season: Season;
  region: SeasonalRegion;
  /** In season now and not a year-round staple. */
  produce: ProduceItem[];
  /** Opted-in holidays in the next two weeks. */
  holidays: HolidayDate[];
  settings: SeasonalSettings;
}

const DEFAULTS: SeasonalSettings = {
  enabled: true,
  produce: true,
  meals: true,
  desserts: true,
  holidays: true,
  deals: false,
  holidayOptIns: [],
  region: null,
};

/** Null when the person switched seasonal recipes off. */
export function seasonalContext(profile: OnboardingProfile, today: string): SeasonalContext | null {
  const settings = profile.seasonal ?? DEFAULTS;
  if (!settings.enabled) return null;
  const region = regionFor(profile.household.country as CountryCode, profile.household.postalCode, settings.region);
  const season = seasonOn(today, region);
  return {
    season,
    region,
    produce: signatureProduce(season),
    holidays: settings.holidays ? upcomingHolidays(settings.holidayOptIns as HolidayCode[], today, 14, profile.household.country as CountryCode) : [],
    settings,
  };
}

export interface SeasonalFit {
  /** In-season produce this recipe uses (USDA names). */
  produce: string[];
  /** The recipe is tagged for this season (e.g. "fall"). */
  seasonTag: boolean;
  holiday: HolidayDate | null;
}

export function seasonalFit(recipe: Recipe, ctx: SeasonalContext): SeasonalFit {
  const produce = !ctx.settings.produce ? [] : [
    ...new Set(
      recipe.ingredients
        .filter((i) => !i.optional)
        .map((i) => matchProduce(i.item, ctx.produce)?.name)
        .filter((n): n is string => Boolean(n)),
    ),
  ];
  const holiday = ctx.holidays.find((h) => recipe.tags.includes(h.code)) ?? null;
  return { produce, seasonTag: recipe.tags.includes(ctx.season), holiday };
}

/** Does this recipe's course get seasonal nudges for this person? */
export function seasonalApplies(recipe: Recipe, ctx: SeasonalContext): boolean {
  return recipe.course === "dessert" ? ctx.settings.desserts : ctx.settings.meals;
}

export function friendlyDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Sun, Nov 8", "Sat, Dec 5 – Sat, Dec 12", "around Tue, Mar 9 – Wed, Mar 10". */
export function holidayWhen(h: HolidayDate): string {
  const span = h.end && h.end !== h.start ? `${friendlyDate(h.start)} – ${friendlyDate(h.end)}` : friendlyDate(h.start);
  return h.approximate ? `around ${span}` : span;
}

/** A produce name as a shopper would search it ("Sweet Potatoes & Yams" → "sweet potatoes"). */
export function produceSearchName(name: string): string {
  return name.replace(/\s*&.*$/, "").replace(/\s*\(.*\)$/, "").trim().toLowerCase();
}
