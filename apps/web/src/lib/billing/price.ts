/**
 * The price shown on the website (NEXT_PUBLIC_SUBSCRIPTION_PRICE, default
 * "$24.99"). It must match the Stripe price — Stripe Checkout always shows
 * the real amount before anyone pays. The phone app shows the store's own price.
 */
export const yearlyPrice = (process.env.NEXT_PUBLIC_SUBSCRIPTION_PRICE ?? "").trim() || "$24.99";

/** "about 48¢ a week" from "$24.99" (only for a plain dollar amount). */
export function perWeek(price = yearlyPrice): string | null {
  const m = /^\$(\d+(?:\.\d{1,2})?)$/.exec(price);
  if (!m) return null;
  const cents = Math.round((Number(m[1]) * 100) / 52);
  return cents < 100 ? `${cents}¢` : `$${(cents / 100).toFixed(2)}`;
}
