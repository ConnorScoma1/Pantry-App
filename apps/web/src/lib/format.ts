import {
  budgetPeriods,
  dietStyles,
  labelFor,
  skillLevels,
  type OnboardingProfile,
} from "@kitchen-pantry/shared-types";

export function formatMoney(cents: number, currency = "USD"): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function budgetSummary(profile: OnboardingProfile): string {
  const { amountCents, period } = profile.budget;
  if (amountCents === null) return "No strict budget";
  return `${formatMoney(amountCents)} ${labelFor(budgetPeriods, period)}`;
}

export function skillLabel(level: number): string {
  return skillLevels.find((s) => s.level === level)?.label ?? `Level ${level}`;
}

export function dietLabel(profile: OnboardingProfile): string {
  return labelFor(dietStyles, profile.diet.style);
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "Good morning" etc. based on the viewer's local clock. */
export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
