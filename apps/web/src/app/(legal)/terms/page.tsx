import { brand } from "@kitchen-pantry/ui-tokens";
import type { Metadata } from "next";
import Link from "next/link";
import { contactEmail, termsUpdated } from "@/lib/legal";
import { Contact, H2, P, UL } from "../prose";

export const metadata: Metadata = { title: "Terms of use" };

/**
 * Plain-language terms of use. A starting point written from what the app
 * does; have it reviewed before launch (governing law still needs adding).
 */
export default function TermsPage() {
  return (
    <article>
      <h1 className="text-[34px] font-bold leading-tight tracking-tight">Terms of use</h1>
      <p className="mt-2 text-[15px] text-muted">Last updated {termsUpdated}</p>

      <P>
        These terms apply when you use {brand.name} on the web or on your phone. By creating an account or using the
        app, you agree to them. Our <Link href="/privacy" className="underline underline-offset-4">privacy policy</Link>{" "}
        explains how we handle your information.
      </P>

      <H2>What {brand.name} does</H2>
      <P>
        {brand.name} suggests recipes and weekly meal plans, keeps track of what&apos;s in your kitchen, builds grocery
        lists, and, where a store connection is available, shows store prices and can fill a store cart for you to
        review. It never places an order or pays for anything on your behalf.
      </P>

      <H2>Food safety, allergies and health</H2>
      <UL>
        <li>We filter recipes using the allergies, diet and restrictions you give us, and we screen ingredients by name. We can&apos;t guarantee a recipe or product is free of an allergen: brands, ingredients and kitchens differ, and cross-contact happens. <strong>Always read product labels</strong> and use your own judgement, especially for serious allergies.</li>
        <li>Cook meat, poultry, fish and eggs to the safe temperatures shown, and follow food-safety advice for storage and use-by dates. Use-by reminders are based on the dates you enter.</li>
        <li>{brand.name} isn&apos;t medical or nutrition advice. Talk to a doctor or dietitian about medical diets.</li>
        <li>Many library recipes are marked &quot;Not yet reviewed&quot; until a person has tested them. Photos marked &quot;Similar dish&quot; show a similar dish, not the exact recipe.</li>
      </UL>

      <H2>AI suggestions</H2>
      <P>
        Some optional features use AI. Its suggestions are checked by our own rules before you see them, but they can
        still be wrong or unsuitable. Prices, allergens and food-safety information always come from our own data, never
        from the AI. Use AI suggestions as ideas, not instructions.
      </P>

      <H2>Prices and stores</H2>
      <P>
        Prices and sale information come from the store when it&apos;s connected, and can change or differ in store.
        When we don&apos;t have a price, we say so instead of guessing. Savings figures are estimates. Your purchase,
        its price and anything about the store are between you and the store.
      </P>

      <H2>Free trial and subscription</H2>
      <UL>
        <li>New accounts get a free trial with everything included. After it, {brand.name} is a yearly subscription at the price shown before you subscribe. One subscription covers everyone in the subscriber&apos;s household.</li>
        <li>Subscribe on the website (paid through Stripe) or in the iPhone or Android app (paid through the App Store or Google Play). Subscribing during the trial doesn&apos;t cost you the rest of it on the website: billing starts when the trial ends.</li>
        <li>Subscriptions renew automatically each year until you cancel. Cancel any time: on the website in Profile → Subscription, or in your App Store or Google Play account. You keep access until the end of the year you&apos;ve paid for.</li>
        <li>Refunds follow the rules of where you paid (Apple and Google handle refunds for app purchases). If the law where you live gives you more rights, those apply.</li>
        <li>If your subscription ends, everything you&apos;ve saved stays in your account, and you can still download it or delete your account.</li>
      </UL>

      <H2>Your account</H2>
      <UL>
        <li>Keep your sign-in details safe; you&apos;re responsible for what happens in your account.</li>
        <li>If you share a household, the other members can see and change the shared kitchen, plans and lists. Only invite people you trust.</li>
        <li>You can download your data or delete your account at any time in Profile (<Link href="/delete-account" className="underline underline-offset-4">how deletion works</Link>).</li>
      </UL>

      <H2>Fair use</H2>
      <UL>
        <li>Don&apos;t misuse the service: no attempts to break in, overload it, copy recipe content in bulk, or get around limits (for example, the number of AI requests).</li>
        <li>Don&apos;t upload anything you don&apos;t have the right to share, or anything unlawful or harmful.</li>
        <li>We may limit or close accounts that break these terms.</li>
      </UL>

      <H2>Content</H2>
      <P>
        Recipes, text and design in {brand.name} belong to us or the people we license them from; photos are credited to
        their photographers. Recipes your household writes stay yours; you let us store and show them to your household
        so the app works.
      </P>

      <H2>Changes and availability</H2>
      <P>
        We keep improving {brand.name}, so features may change. We try to keep it running, but can&apos;t promise it will
        always be available or error-free. If we change these terms in a way that matters, we&apos;ll update the date
        above and tell you in the app.
      </P>

      <H2>Liability</H2>
      <P>
        To the extent the law allows, {brand.name} is provided &quot;as is&quot;, and we aren&apos;t liable for indirect
        or consequential losses. Nothing in these terms limits rights you have under consumer law that can&apos;t be
        limited.
      </P>

      <H2>Contact</H2>
      <P>Questions about these terms: <Contact email={contactEmail} />.</P>
    </article>
  );
}
