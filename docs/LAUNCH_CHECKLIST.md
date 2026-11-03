# Launch checklist

Everything between today and Kitchen Pantry being live, in a sensible order.
Every feature is built and tested. What's left is setting up accounts,
keys and content, and making the decisions only you can make. 💲 marks a
step that costs money or takes a cut of payments. Nothing on this list has
been bought or signed up for on your behalf. The README has click-by-click
steps for each section (the section is named after each item).

Status as of 2 November 2026. The prices are the providers' published prices as of that date ([Supabase](https://supabase.com/pricing), [RevenueCat](https://www.revenuecat.com/pricing), [Gemini](https://ai.google.dev/gemini-api/docs/pricing)). Check them again before you sign up.

## 1. Database (Supabase)
- [x] Project created and linked (`yeealrwiquxjeyhwbnlx`)
- [x] Migrations up to `…2700_export_my_data` applied; recipes seeded
- [ ] Apply `…2800_subscriptions`, `…2900_billing_fixes` and `…3000_trial_reminders`: `npx.cmd supabase db push --remote`
- [ ] Re-run the seed after recipe updates: `npx.cmd supabase db push --remote --include-seed`
- [ ] Before launch, decide on the Supabase plan 💲. The free plan pauses after a week of inactivity and has no backups; Pro is about $25/month.

## 2. Security
- [ ] Rotate the Gemini key that was pasted into chat. Delete the old one in Google AI Studio.
- [ ] Confirm `git ls-files | findstr .env` shows only `.env.example` files.
- [ ] Never put the service-role key, Gemini key, Stripe secret or webhook secrets in a `NEXT_PUBLIC_` / `EXPO_PUBLIC_` variable.

## 3. Hosting the website 💲
- [ ] Choose a host (Vercel is the natural fit; Render or Fly also work). *README → Going to production*
- [ ] Set every server variable from `apps/web/.env.example` on the host.
- [ ] Set `NEXT_PUBLIC_SITE_URL` to the real https address.
- [ ] Supabase → Authentication → URL Configuration:
  - Set the Site URL to the real address.
  - Add `https://your-site/**` to the redirect URLs.
- [ ] Buy a domain 💲, if you want your own address (also needed for email, section 4).

## 4. Email
- [ ] Get a domain and verify a sending subdomain in Resend. The free plan covers 3,000 emails a month. *README → Sign-in and accounts*
- [ ] Supabase → Emails → SMTP Settings: connect Resend.
- [ ] Turn **Confirm email** back on.
- [ ] Optional: reword the confirmation and sign-in-link email templates.
- [ ] Set `RESEND_API_KEY` and `INVITE_EMAIL_FROM` for household invite emails.

## 5. Sign-in with Google, Apple and Facebook
- [ ] Google: OAuth client in Google Cloud, then switch it on in Supabase (free).
- [ ] Facebook: Meta developer app, then switch it on in Supabase, then switch the Meta app to Live (free).
- [ ] Apple 💲: needs the Apple Developer Program ($99/year, which you'll need anyway to publish the iPhone app). Apple requires "Sign in with Apple" in the iPhone app if Google or Facebook sign-in is offered there. Its secret key expires every 6 months, so set a calendar reminder.
- [ ] Replace the text-only buttons with each provider's official button artwork (their brand rules expect it).
- [ ] Phone app: `npx.cmd expo install expo-web-browser`.

## 6. AI (Gemini)
- [ ] Switch to a **paid** Gemini key 💲 (about $21/month per 1,000 active users). Free-tier prompts may be used by Google, and the free tier is slow and often busy.
- [ ] Keep `AI_MONTHLY_BUDGET_USD` set as a hard cap, and raise it as users grow.
- [ ] Optional: rerun `npm.cmd run ai:eval` on the paid key to confirm there are no more fallbacks.

## 7. Subscriptions ($24.99/year after a 14-day trial) 💲
- [ ] Stripe 💲 (about 2.9% + 30¢ per payment):
  - Create the $24.99 yearly price.
  - Add the webhook (`/api/billing/stripe/webhook`, three `customer.subscription.*` events).
  - Turn on the customer portal.
  - Test the whole flow in test mode first.
- [ ] App Store Connect and Google Play Console: create a yearly auto-renewing subscription. The stores take 15% (small business programmes) 💲.
- [ ] RevenueCat (free under $2.5k/month revenue, then 1%) 💲:
  - Create a project, a `premium` entitlement and an offering with an Annual package.
  - Add the webhook with an Authorization value.
- [ ] Phone app:
  - `npx.cmd expo install react-native-purchases`.
  - Set the RevenueCat keys.
  - Test in a development build.
- [ ] Make sure one of the hourly jobs is scheduled (section 10), so trial-ending reminders go out.
- [ ] Switch billing on: `update public.billing_settings set enforced = true;` Existing users start their trial at that moment.

## 8. Legal
- [ ] Set `NEXT_PUBLIC_CONTACT_EMAIL` (shown on `/privacy`, `/terms`, `/delete-account`).
- [ ] Have a lawyer review `/privacy` and `/terms` 💲, add a governing-law section to the terms, and keep both up to date when features or services change.
- [ ] Use `https://your-site/privacy` and `https://your-site/terms` in Google, Facebook, Apple, Google Play and RevenueCat.
- [ ] Use `https://your-site/delete-account` as Google Play's account-deletion link.

## 9. Recipes
- [ ] Have a person cook and review the 476 library recipes (all "Not yet reviewed"), and mark them reviewed or tested.
- [ ] Decide how to grow the library beyond your own recipes (licence quotes in `docs/RECIPE_LIBRARY.md` §4 💲).
- [ ] 137 recipes have no photo yet (339 of 476 do). Add your own photos for these, and replace "Similar dish" photos with your own over time.

## 10. Optional features (each needs its own keys)
- [ ] Kroger prices and Smart Cart: Kroger developer account (free), `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET`.
- [ ] Best Deals routes: Mapbox token (free tier) 💲 beyond it.
- [ ] Weekly drafts and use-soon reminders:
  - Set `CRON_SECRET`.
  - Schedule the two hourly jobs with Supabase `pg_cron` (any plan) or Vercel Cron (Pro 💲).
- [ ] A second store chain's prices: needs a permitted price source (not built; research needed).

## 11. Phone apps 💲
- [ ] Apple Developer Program ($99/year) and Google Play Console ($25 once).
- [ ] Change the bundle id `com.kitchenpantry.app` in `apps/mobile/app.json` if you want a different one (it's permanent once published).
- [ ] `npx.cmd eas init`, then build: `npx.cmd eas build --profile preview` for testing, `--profile production` for the stores.
- [ ] Store listings: screenshots, description, the privacy "nutrition label" (Apple) and data safety form (Google). Answer them from `/privacy`.
- [ ] Set `EXPO_PUBLIC_API_URL` to the live website so AI, Smart Cart and links work from the phone.

## 12. Test on real devices before launch
- [ ] Sign up, onboard and plan a week on a real iPhone and Android phone.
- [ ] Push notifications (weekly drafts, use-soon reminders).
- [ ] Cooking mode: timers and keeping the screen awake.
- [ ] Location and Best Deals routes.
- [ ] Barcode scan and receipt photo.
- [ ] Sign in with Google, Apple and Facebook on each phone.
- [ ] A sandbox purchase, restore purchases and cancelling.
- [ ] VoiceOver (iPhone) and TalkBack (Android) through the main screens.

## 13. After launch
- [ ] Uptime monitor on `/api/health`, and alerts on the host's error logs (optionally Sentry).
- [ ] Watch AI costs (`ai_usage`, `ai_spend_months`) against the estimate in `docs/AI_COSTS.md`.
- [ ] Watch trial-to-paid conversion in Stripe and RevenueCat.
