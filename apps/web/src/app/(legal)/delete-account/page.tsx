import { brand } from "@kitchen-pantry/ui-tokens";
import type { Metadata } from "next";
import Link from "next/link";
import { contactEmail } from "@/lib/legal";
import { Contact, H2, P, UL } from "../prose";

export const metadata: Metadata = { title: "Delete your account" };

/** Public page explaining account deletion (app stores ask for a web link). */
export default function DeleteAccountInfoPage() {
  return (
    <article>
      <h1 className="text-[34px] font-bold leading-tight tracking-tight">Delete your {brand.name} account</h1>

      <P>Want to keep a copy first? Profile → Your data → Download my data.</P>

      <H2>How to delete it</H2>
      <UL>
        <li><strong>On the website:</strong> <Link href="/sign-in?next=/profile%23delete-account" className="underline underline-offset-4">sign in</Link>, open <strong>Profile</strong>, scroll to <strong>Delete account</strong>, type DELETE and confirm.</li>
        <li><strong>In the phone app:</strong> Profile → Delete account → type DELETE and confirm.</li>
        <li>Can&apos;t sign in? Email <Contact email={contactEmail} /> from the address on your account and we&apos;ll delete it for you.</li>
      </UL>

      <H2>If you subscribe</H2>
      <UL>
        <li>A subscription you bought on the website is cancelled automatically when you delete your account on the website.</li>
        <li>An App Store or Google Play subscription isn&apos;t: cancel it in your store account (iPhone Settings → your name → Subscriptions, or Play Store → Payments &amp; subscriptions).</li>
      </UL>

      <H2>What&apos;s deleted</H2>
      <UL>
        <li>Your account and sign-in, your profile, allergies, diet and preferences, ratings and favourites, cooking history, notifications and phone registrations, and any connected store account.</li>
        <li>If your household is only you: the household and everything in it (kitchen, meal plans, grocery lists, saved lists, recipes and menus).</li>
      </UL>

      <H2>What stays</H2>
      <UL>
        <li>If you share a household, it stays for the other members, with what&apos;s in it. Things you added stay without your name on them. If you were the owner, the member who joined earliest becomes the owner.</li>
        <li>Our providers may keep backups and logs for a limited time before they&apos;re overwritten.</li>
      </UL>
      <P>Deleting is immediate and can&apos;t be undone. See the <Link href="/privacy" className="underline underline-offset-4">privacy policy</Link> for more.</P>
    </article>
  );
}
