# Security

How Kitchen Pantry protects household data, and what to check before launch.

## How data is protected

| Area | Control |
| --- | --- |
| **Who can read what** | Every table has row-level security. Household data (kitchen, plans, grocery list, carts, logged shops, who's eating) is readable only by members (`is_household_member`). Personal data (skill, goals, diet, portion, notification choices, phone push addresses, ratings) is readable only by its owner — or, for ratings, the household. |
| **Writes** | Sensitive writes go through `security definer` functions that check membership and validate input: invites, carts, weekly settings, attendance, portions and push tokens. Clients get only the column grants they need; for example, a notification's `read_at` is the only column a member can update. |
| **Invitations** | Random tokens (two random UUIDs, about 244 bits); only a hash is stored. They expire (7 days by default, 14 at most), work once and require sign-in. They can be limited to one email address, and seats are capped at 6 people including open invites. |
| **Server secrets** | The Anthropic, Kroger, Mapbox, Resend and service-role keys, the cron secret and the shopping-advice signing secret are read only in server files marked `server-only`. None use a `NEXT_PUBLIC_` / `EXPO_PUBLIC_` prefix. |
| **Service role** | It's used for three things only: real-retailer cart sends, sealed retailer tokens, and the weekly drafts job. In each case the database still checks `cart_is_server()` and re-checks the member being acted for. |
| **Retailer sign-in** | Kroger tokens are sealed with AES-256-GCM, bound to the user (associated data), and stored where only the server can read them. The OAuth flow uses PKCE and a sealed, expiring state. No payment details are ever collected. |
| **AI limits** | Each request reserves its slot in the database before Claude is called. Members can't see reservations still in progress, so they can't hand a slot back while the server waits. Limits count per household **and** per person, so creating another household doesn't reset them. Members can only read and add usage rows. |
| **AI** | Claude sees only what a feature needs: candidate recipes for planning, or the recipe, step and allergen codes for the cooking assistant. It never sees names, emails or addresses. Outputs are schema-validated, and picks are re-checked against the household's safe recipes. Recipe text and the question are marked as untrusted data in the prompt. Assistant answers that mention a household allergen, or a temperature below the recipe's safe minimum, are discarded. Each household has daily limits per feature: a request reserves its slot in the database (under a per-household lock) *before* Claude is called, so parallel requests can't overshoot, and the checks fail closed. Without Supabase (preview mode) AI is off in production unless `AI_IN_PREVIEW=on`, with a small in-memory allowance. |
| **Scheduled job** | `/api/jobs/weekly-drafts` needs `Authorization: Bearer <CRON_SECRET>` (32+ characters, compared in constant time) and is off unless `WEEKLY_DRAFTS=on`. Drafts only ever go into an empty week. |
| **Recipe library** | Library search is one database function that returns only the ids a person may read (public recipes from approved sources, plus their own household's); the rows themselves are then loaded under row-level security. Every search input is bounded inside the database (text cut to 200 characters, lists and terms capped, no user text used as a LIKE pattern), so a direct API call can't make it slow. Bulk import is server-only (service role); it never overwrites a household's or another source's recipe, can't use a built-in source name or borrow an existing source with a different licence, can't mark anything tested or reviewed, and every new source starts unapproved. Members writing their household's own recipes can't mark them tested or reviewed, use another source, take a public recipe's slug, or make a version of a recipe they can't read (a database trigger). AI recipe drafts are validated like any import, screened again for the household's allergens, saved only for that household and always "not yet reviewed"; prompts are capped at 20,000 characters and household text can't open or close the prompt's data sections. The app re-checks every recipe's ingredients against the household's allergies and diet before showing it, so a household recipe with wrong stored allergen tags is still caught. |
| **Barcodes & receipts** | Barcode lookups go through the server to Open Food Facts (no key, an identifying User-Agent), with only five fields read, markup stripped, answers cached and calls rationed per server and per person. Receipt photos are checked (real JPEG/PNG/WebP bytes, ≤ 3.5 MB), sent to Claude once and never stored; the answer is cleaned of long digit runs (card, account, phone numbers) and payment/total lines before it reaches the device, and nothing is added without the household's review. The receipt route accepts a session cookie only for same-origin JSON requests (so another site can't post a photo as the user), or a bearer token from the phone; it has its own daily AI limit. Saved barcodes must be 8–14 digits. |
| **Use-soon reminders** | Run only by the server's hourly job (`CRON_SECRET`, constant-time check) through `use_soon_reminders()`, which refuses anyone but the service role. Each person gets only their own notice, about their own active household (current members only), at most once a day; notices give dates and expire at the end of the day; the bookkeeping table has no access for signed-in users. Notice text is built in the database from item names (control characters removed, lengths capped) and links only to `/kitchen`; the phone opens only whitelisted in-app paths. Choices and time zone are per person (row-level security), and time zones are checked against the database's list. |
| **Store comparison** | Kroger and Mapbox keys stay on the server. A comparison takes item names and amounts, store ids and a starting point — never a price, distance or store location: every store is looked up with Kroger again. Comparisons count against the person's hourly price checks (one per store for every 40 items), and store lookups (including unknown ids) are cached for a day. The starting address is geocoded per comparison (Mapbox "temporary" geocoding) and neither the result nor coordinates are stored; "Use my current location" is rounded to about 100 m and not saved. Shopping settings (including the starting address and value of time) are readable only by their owner. A chosen trip can only list items on the household's own current list, real store ids (each store's name and address re-read from Kroger by the server), 1–4 different stores with at least one item each, and 30 trips a day per person; members can read trips but not write them directly. The AI advisor only accepts an HMAC-signed, user-bound, 30-minute copy of the server's own numbers, and an answer containing any number not in them — including number words, fractions, multipliers, percentages or non-ASCII digits — is discarded. Item names lose their digits before they reach the facts, so household text can't add an allowed number. In production the advisor is off unless `SHOPPING_ADVICE_SECRET` (32+ characters) is set. |
| **Request size** | API bodies are read as a stream with a hard size cap, so a request without a `Content-Length` header can't make the server buffer an unbounded body. |
| **Push addresses** | A phone's push address can't be taken over by another account while its owner is using it (only after sign-out, or 30 days unused). |
| **Invite emails** | Names people typed never go in the subject, and names that look like links, domains or email addresses are replaced with a neutral phrase. At most 5 invite emails an hour and 10 a day per person (the daily cap is counted in the database). |
| **Untrusted links** | Notification and push links must be in-app paths (`/plan?week=…`). Emails are built from `NEXT_PUBLIC_SITE_URL`, never from the request. |
| **Headers** | `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, a permissions policy (no microphone; camera and location only for this site — the barcode scanner and "Use my current location") and HSTS. |
| **Logging** | Server errors are logged as JSON lines with masked paths. No request bodies, cookies or tokens are logged. |

## Before launch

1. Review and apply the migrations in order with `supabase db push`. Then run `npm run test:sql` (CI does this on every push).
2. In Supabase, enable leaked-password protection, email confirmation and rate limits, and set the Site URL and redirect URLs to your domain.
3. Set the server environment variables from `apps/web/.env.example`. Use `openssl rand` for `CRON_SECRET` and `RETAILER_TOKEN_KEY`.
4. Leave `AI_IN_PREVIEW` unset in production; preview mode has no accounts.
5. Store secrets only in your host's secret manager. Rotate any key that has ever been pasted into chat, email or a ticket.
6. Consider a Content-Security-Policy with nonces. The app needs `connect-src` for your Supabase URL, and `img-src` for the recipe photo hosts in `packages/recipe-engine/src/catalog/photos.ts`.
7. Turn on uptime monitoring for `/api/health` and an alert on `"level":"error"` log lines.
8. Test on real devices before you publish the phone app: push notifications, the cooking timers, and sign-out (which removes that phone's push address).

## Review log

- **Milestone 16 review.** No problems were found in the database permissions for weekly drafts, savings or who's eating: the server-only functions can't be called by app users, and every function is limited to the current household. These were fixed:
  - The AI daily limits could be overshot by many requests sent at once. Requests now reserve a slot first.
  - Preview mode could spend the AI key without sign-in on a deployed server. It's now off in production unless `AI_IN_PREVIEW=on`.
  - Invite emails could carry misleading text written by a household. Names are now kept out of the subject and screened, and there's a daily cap.
  - Another account could take over a push address. Takeover is now blocked while the address is in use.
  - Recipe text could try to steer the cooking assistant. The prompt now marks it as untrusted data, and unsafe temperatures are rejected.
  - Request size checks trusted `Content-Length`. Bodies are now capped while they're read.

- **Milestone 18 review (recipe library).** Fixed:
  - Search could be made very slow with oversized input sent to the API directly. Inputs are now bounded in the database.
  - The AI draft limit could be bypassed three ways: by handing slots back mid-request, by creating new households, and by sending huge recipes as prompts. Reservations are now hidden, limits also count per person, and prompts are capped.
  - Members could mark their own household recipes "tested", reuse a public slug or claim another source. A database trigger now stops this.
  - A feed could reuse an approved source's name and mark recipes tested. That's now refused.
  - Smaller fixes: missing lists now fail validation, list sizes and text lengths are capped, the cached-draft lookup is limited to the current household, the prompt tag-stripping can no longer be bypassed, image links must be https, and members' unused rights on AI usage rows were removed.
  - In preview mode, AI is now on only in development or test unless `AI_IN_PREVIEW=on` is set.

- **Milestone 9 review (One Store vs. Best Deals).** Database permissions, the signed advice token, the Mapbox adapter and search bounds were found sound. Fixed:
  - Item names (household text) could add numbers to the advisor's allowed list, and number words, "half", percentages or full-width digits slipped past the check. Item names now lose their digits, numbers are only taken from the computed facts, and those forms are refused.
  - One comparison could make far more Kroger calls than the hourly limit suggested. It now counts per store and per 40 items, and store lookups are cached (unknown ids too).
  - When the best trip covered more items but cost more on the shared ones, the sentence could read "$0.00 cheaper". It now says "covers N more items, but costs $X more on the items both price", with the partial-data caveat whenever either trip misses items.
  - `save_shopping_trip` accepted a payload with no stops or a stop with no items; it now refuses them, and duplicate stores get a clear error.
  - Saved trips showed the store name the client sent. The server now re-reads each store's name and address from Kroger (web and phone).
  - Smaller fixes: the daily trip cap is per person, duplicate list items are refused, the radius still applies when routing fails, and the advice secret is required in production.

- **Milestone 19 review (barcodes and receipts).** The receipt route's cookie path, AI limits, body caps, image checks and row-level security were found sound. Fixed:
  - Card numbers written with dots or slashes, emails, phone numbers and street addresses could survive the receipt clean-up. They're now removed from every field (item text, name and store), and a line with no letters left is dropped.
  - After a failed lookup, the phone kept re-scanning the same barcode in a loop, using up the server's Open Food Facts allowance. A failed code is now ignored for 15 seconds, and the whole server pauses for a minute when Open Food Facts says "slow down".
  - UPC-E barcodes (small packs) were checked as 8-digit EAN codes. They're now expanded to their full UPC-A first.
  - Smaller fixes: impossible receipt dates like Feb 30 are rejected on the server too, odd or oversized product fields are trimmed rather than making the product "not found" for a week, invisible and right-to-left characters are stripped, lookups are off until `OPEN_FOOD_FACTS_USER_AGENT` includes a contact, idle per-person counters are cleared, and preview mode no longer says the barcode is saved.
  - Known limit: the lookup allowance is counted per server process. If you run several instances behind one outbound IP address, lower their share or put a shared cache in front.

- **Use-soon reminders review.** Permissions (server-only job, private bookkeeping, own-row preferences), the household boundary (stale active households are ignored), duplicate protection and text handling were found sound. Fixed:
  - Saving a notification switch wrote every switch, so a screen with old values could undo a choice made elsewhere — and on the phone, forget the phone's push address while another notification still needed it. Saves now send only the changed switch, the app takes the server's answer, and the phone is forgotten only when the server says no phone notifications are left on. Switches wait until settings have loaded.
  - An unread reminder saying "Chicken thighs (today)" could still be shown days later. Reminders now give the date ("by Nov 2") and expire at the end of the person's day; expired notices are hidden by the database.
  - The hourly job looked at every person one by one. It now picks only the people due a reminder in one query, with a limit.
  - One account could register endless phone addresses and slow the push send. Each person now keeps at most 10 (the oldest is dropped), and addresses are read in pages that fit the API's row limit.
  - A time zone the browser accepts but the database doesn't could block saving switches; the switch is now saved without the zone.
  - Someone who left a household could still read its reminder for the rest of the day; leaving now removes their notices about it.
  - A second phone on the same account showed "On this phone" without receiving anything. The switch now reflects this phone, and turning it on registers it.
  - Known limit: phone notifications that can't be sent within one run (Expo down, the run times out) aren't retried; the in-app notice is still there.

## Reporting a problem

Email the maintainers privately rather than opening a public issue. Include steps to reproduce.
