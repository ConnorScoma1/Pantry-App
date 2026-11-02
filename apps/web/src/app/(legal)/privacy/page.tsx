import { brand } from "@kitchen-pantry/ui-tokens";
import type { Metadata } from "next";
import Link from "next/link";
import { contactEmail, privacyUpdated } from "@/lib/legal";
import { Contact, H2, P, UL } from "../prose";

export const metadata: Metadata = { title: "Privacy policy" };

/**
 * Plain-language privacy policy describing what the app actually does
 * (see docs/SECURITY.md). Have it reviewed before launch, and keep it in
 * step with any new feature or service.
 */
export default function PrivacyPage() {
  return (
    <article>
      <h1 className="text-[34px] font-bold leading-tight tracking-tight">Privacy policy</h1>
      <p className="mt-2 text-[15px] text-muted">Last updated {privacyUpdated}</p>

      <P>
        {brand.name} helps you plan meals, keep track of what&apos;s in your kitchen, and shop for groceries. This page
        explains what we collect, why, who helps us run the service, and the choices you have. We don&apos;t sell your
        information and we don&apos;t show ads.
      </P>

      <H2>What we collect</H2>
      <UL>
        <li><strong>Your account:</strong> your email address and, if you sign in with Google, Apple or Facebook, the name they share with us. Apple may give us a private relay address instead of your real one.</li>
        <li><strong>Your household and preferences:</strong> postal code and country, how many people you cook for, budget, goals, cooking skill, kitchen equipment, cuisines and foods you like or avoid, your diet and dietary restrictions, and any <strong>food allergies</strong> you tell us about. Allergy and diet information is health-related; we use it only to keep unsuitable recipes out of your plans.</li>
        <li><strong>What you add:</strong> the items in your kitchen and their use-by dates, meal plans, grocery lists and saved lists, recipes you save or create, ratings, favourites, cooking history, and who&apos;s eating on which night.</li>
        <li><strong>Shared households:</strong> if you join a household, the other members can see the shared kitchen, plans and lists, your name or email, and what you add. Your own allergies and diet are combined with theirs for planning, but the others don&apos;t see which allergy is whose.</li>
        <li><strong>Your phone:</strong> if you turn on notifications, a push token so we can send reminders to that phone.</li>
        <li><strong>Store connection (optional):</strong> if you connect a Kroger-family store account, an access token (stored encrypted) so we can show prices and add items to your cart. We never place orders or pay for anything.</li>
        <li><strong>Technical logs:</strong> errors and request logs kept by our hosting providers for security and debugging, and for each AI request: which feature, which model, how many tokens and the estimated cost. We don&apos;t store the text of AI requests or answers.</li>
      </UL>
      <P>
        Barcode scans and receipt photos are used once to read the items and are not stored. If you use Best Deals with
        an address, it&apos;s used to work out distances for that comparison and not saved.
      </P>

      <H2>How we use it</H2>
      <UL>
        <li>To run the service: recommend recipes, plan your week, build grocery lists, track what&apos;s in your kitchen, and send the reminders you ask for.</li>
        <li>To keep you safe: allergies, diet and restrictions are applied as hard filters to every recommendation and AI suggestion.</li>
        <li>To keep the service secure, working and affordable (for example, limits on AI use).</li>
      </UL>

      <H2>AI features</H2>
      <P>
        Some optional features use an AI model run by an outside provider (currently Google&apos;s Gemini): planning
        your week, adapting a recipe, a new dinner from what&apos;s in your kitchen, cooking questions, explaining a
        shopping comparison, and reading a receipt photo. We send only what that request needs: for a meal plan, short
        summaries of recipes that already passed your filters, your household size, skill level and the names of
        ingredients you have. We don&apos;t send your name, email address or postal code. The provider processes the
        request to return an answer under its terms for paid business use. AI suggestions are checked by our own code
        before you see them, and prices, allergens and food-safety information are never taken from the AI.
      </P>

      <H2>Who helps us run the service</H2>
      <UL>
        <li><strong>Supabase</strong>: database, sign-in and account emails.</li>
        <li><strong>Our web host</strong>: runs the website and server.</li>
        <li><strong>Google (Gemini API)</strong>: the optional AI features above.</li>
        <li><strong>Google, Apple, Facebook</strong>: only if you choose to sign in with them.</li>
        <li><strong>Kroger</strong>: store prices and your cart, only if you connect a store account.</li>
        <li><strong>Mapbox</strong>: distances and routes for Best Deals, only when you use it.</li>
        <li><strong>Resend</strong>: emails such as household invites.</li>
        <li><strong>Expo</strong>: delivers push notifications to your phone, if you turn them on.</li>
      </UL>
      <P>They process information on our behalf to provide these parts of the service. We may also share information if the law requires it.</P>

      <H2>How long we keep it</H2>
      <P>
        We keep your information while you have an account. Saved AI meal-plan answers are kept for 48 hours. When you
        delete your account, your personal information is deleted straight away, except where something you added
        belongs to a household that other people still use (see below), and except for routine backups and logs kept by
        our providers for a limited time.
      </P>

      <H2>Your choices</H2>
      <UL>
        <li><strong>See and change</strong> your information at any time in the app (Profile, Kitchen, Plan, Grocery).</li>
        <li><strong>Turn off</strong> reminders and notifications in Profile, and disconnect a store account in Grocery → Smart Cart.</li>
        <li><strong>Delete your account</strong> in Profile → Delete account (<Link href="/delete-account" className="underline underline-offset-4">how it works</Link>).</li>
        <li>Ask us for a copy of your information, or about anything on this page: <Contact email={contactEmail} />.</li>
      </UL>
      <P>Depending on where you live, you may have further rights (for example to object or to complain to your data-protection authority).</P>

      <H2>Children</H2>
      <P>{brand.name} is meant for adults managing a household. It isn&apos;t directed at children under 13, and we don&apos;t knowingly collect their information.</P>

      <H2>Security</H2>
      <P>
        Data travels over encrypted connections, each household&apos;s data is separated by row-level security in the
        database, secret keys stay on our servers, and store tokens are encrypted. No system is perfectly secure; tell us
        if you find a problem.
      </P>

      <H2>Changes</H2>
      <P>If we change this policy in a way that matters, we&apos;ll update the date above and tell you in the app.</P>

      <H2>Contact</H2>
      <P>Questions or requests: <Contact email={contactEmail} />.</P>
    </article>
  );
}
