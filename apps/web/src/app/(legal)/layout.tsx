import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/shell/brand";

/** Public pages anyone can read without an account (privacy policy, account deletion). */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background px-5 py-8 sm:px-10">
      <BrandLockup />
      <main className="mx-auto w-full max-w-2xl py-10">{children}</main>
      <footer className="mx-auto flex max-w-2xl flex-wrap gap-x-5 gap-y-2 border-t border-border pt-5 text-[14px] text-muted">
        <Link href="/privacy" className="underline underline-offset-4">Privacy policy</Link>
        <Link href="/delete-account" className="underline underline-offset-4">Delete your account</Link>
        <Link href="/sign-in" className="underline underline-offset-4">Sign in</Link>
      </footer>
    </div>
  );
}
