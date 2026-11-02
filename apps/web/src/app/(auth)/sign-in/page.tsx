import { brand } from "@kitchen-pantry/ui-tokens";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { BrandLockup } from "@/components/shell/brand";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { socialSignInOptions } from "@/lib/supabase/providers";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; mode?: string; deleted?: string }>;
}) {
  const { next, error, mode, deleted } = await searchParams;
  const providers = await socialSignInOptions();

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <BrandLockup />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 animate-enter">
          <h1 className="text-[34px] font-bold leading-tight tracking-tight">Welcome to {brand.name}</h1>
          <p className="mt-2 text-[17px] text-muted">{brand.tagline}</p>

          {deleted ? (
            <p role="status" className="mt-6 rounded-2xl bg-accent-soft px-4 py-3 text-[15px]">
              Your account has been deleted. Thanks for cooking with us.
            </p>
          ) : null}

          {isSupabaseConfigured ? (
            <SignInForm
              next={next ?? "/"}
              linkError={error === "link"}
              socialError={error === "social"}
              providers={providers}
              startMode={mode === "sign-up" ? "sign-up" : "sign-in"}
            />
          ) : (
            <div className="mt-8 rounded-card bg-surface p-6">
              <p className="font-semibold">Running in preview mode</p>
              <p className="mt-1 text-[15px] text-muted">
                Supabase isn&apos;t connected yet, so there are no accounts. You can try the full onboarding — answers
                are kept in this browser only.
              </p>
              <ButtonLink href="/onboarding" size="lg" className="mt-5 w-full">
                Try it in preview
              </ButtonLink>
            </div>
          )}
          <p className="mt-8 text-center text-[14px] text-muted">
            By continuing you agree to the{" "}
            <Link href="/terms" className="underline underline-offset-4">terms of use</Link> and{" "}
            <Link href="/privacy" className="underline underline-offset-4">privacy policy</Link>.
          </p>
        </div>
      </div>
      <aside className="relative hidden overflow-hidden bg-accent lg:block" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgb(255_255_255/0.18),transparent_55%)]" />
        <div className="absolute bottom-12 left-12 right-12 text-accent-foreground">
          <p className="text-[40px] font-bold leading-[1.1] tracking-tight">
            Plan the week.
            <br />
            Shop once.
            <br />
            Use everything.
          </p>
          <p className="mt-4 max-w-sm text-[17px] opacity-80">
            Meals you&apos;ll want to cook again, a grocery list that knows what&apos;s already in your kitchen, and
            prices you can trust.
          </p>
        </div>
      </aside>
    </div>
  );
}
