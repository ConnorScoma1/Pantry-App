"use client";

import { socialProviderLabels, type SocialProvider } from "@kitchen-pantry/validation";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Segmented, TextInput } from "@/components/ui/controls";
import { magicLinkAction, signInAction, signUpAction, socialSignInAction, type AuthFormState } from "./actions";

type Mode = "sign-in" | "sign-up" | "magic-link";

const initial: AuthFormState = { status: "idle" };

export function SignInForm({
  next,
  linkError,
  socialError,
  providers,
  startMode = "sign-in",
}: {
  next: string;
  linkError: boolean;
  socialError: boolean;
  /** Social sign-in options switched on in Supabase (none → no buttons). */
  providers: SocialProvider[];
  startMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(startMode);
  const [signInState, signIn, signingIn] = useActionState(signInAction, initial);
  const [signUpState, signUp, signingUp] = useActionState(signUpAction, initial);
  const [linkState, sendLink, sendingLink] = useActionState(magicLinkAction, initial);
  const [socialState, social, goingSocial] = useActionState(socialSignInAction, initial);

  const state = mode === "sign-in" ? signInState : mode === "sign-up" ? signUpState : linkState;
  const action = mode === "sign-in" ? signIn : mode === "sign-up" ? signUp : sendLink;
  const pending = signingIn || signingUp || sendingLink || goingSocial;
  const sent = state.status === "sent";

  const switchTo = (m: Mode) => setMode(m);

  return (
    <div className="mt-8">
      <Segmented
        label="Sign in or create an account"
        value={mode === "magic-link" ? "sign-in" : mode}
        onChange={switchTo}
        options={[
          { value: "sign-in", label: "Sign in" },
          { value: "sign-up", label: "Create account" },
        ]}
      />

      {linkError ? (
        <p role="alert" className="mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">
          That sign-in link has expired or was already used. Request a new one.
        </p>
      ) : null}
      {socialError || socialState.status === "error" ? (
        <p role="alert" className="mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">
          {socialState.message ?? "That sign-in was cancelled or didn't finish. Please try again."}
        </p>
      ) : null}

      {providers.length > 0 ? (
        <>
          <form action={social} className="mt-6 space-y-3">
            <input type="hidden" name="next" value={next} />
            {providers.map((p) => (
              <Button key={p} type="submit" name="provider" value={p} variant="secondary" size="lg" className="w-full" disabled={pending}>
                {mode === "sign-up" ? `Sign up with ${socialProviderLabels[p]}` : `Continue with ${socialProviderLabels[p]}`}
              </Button>
            ))}
          </form>
          <div className="mt-6 flex items-center gap-3 text-[14px] text-muted" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            or with your email
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <form key={mode} action={action} className="mt-6 space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        {mode === "sign-up" ? (
          <p className="text-[15px] text-muted">Create a free account with your email and a password. We&apos;ll email you a link to confirm it.</p>
        ) : mode === "magic-link" ? (
          <p className="text-[15px] text-muted">No password needed — we&apos;ll email you a link that signs you in. It also creates your account if you&apos;re new.</p>
        ) : null}
        <div>
          <label htmlFor="email" className="mb-1.5 block text-[15px] font-semibold">
            Email
          </label>
          <TextInput
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={state.email}
            invalid={Boolean(state.fieldErrors?.email)}
            aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
          />
          <FieldError id="email-error" message={state.fieldErrors?.email} />
        </div>

        {mode !== "magic-link" ? (
          <div>
            <label htmlFor="password" className="mb-1.5 block text-[15px] font-semibold">
              {mode === "sign-up" ? "Choose a password" : "Password"}
            </label>
            <TextInput
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              required
              invalid={Boolean(state.fieldErrors?.password)}
              aria-describedby={state.fieldErrors?.password ? "password-error" : mode === "sign-up" ? "password-hint" : undefined}
            />
            <FieldError id="password-error" message={state.fieldErrors?.password} />
            {mode === "sign-up" ? (
              <p id="password-hint" className="mt-1.5 text-[14px] text-muted">
                At least 10 characters. Mixing letters, numbers and symbols is safest.
              </p>
            ) : null}
          </div>
        ) : null}

        {state.message ? (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={
              state.status === "error"
                ? "rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger"
                : "rounded-2xl bg-accent-soft px-4 py-3 text-[15px]"
            }
          >
            {state.message}
            {sent && state.email ? (
              <>
                {" "}
                We sent it to <strong>{state.email}</strong>. Open the link on this device; it may take a minute, so check spam too.
              </>
            ) : null}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending
            ? "One moment…"
            : mode === "sign-in"
              ? "Sign in"
              : mode === "sign-up"
                ? "Create account"
                : "Email me a sign-in link"}
        </Button>
      </form>

      <div className="mt-5 space-y-2 text-center text-[15px]">
        {mode === "sign-up" ? (
          <p className="text-muted">
            Already have an account?{" "}
            <button type="button" className="font-semibold text-foreground underline underline-offset-4" onClick={() => switchTo("sign-in")}>
              Sign in
            </button>
          </p>
        ) : (
          <p className="text-muted">
            New to Kitchen Pantry?{" "}
            <button type="button" className="font-semibold text-foreground underline underline-offset-4" onClick={() => switchTo("sign-up")}>
              Create an account
            </button>
          </p>
        )}
        {mode !== "magic-link" ? (
          <p>
            <button type="button" className="text-muted underline underline-offset-4" onClick={() => switchTo("magic-link")}>
              Email me a sign-in link instead
            </button>
          </p>
        ) : (
          <p>
            <button type="button" className="text-muted underline underline-offset-4" onClick={() => switchTo("sign-in")}>
              Use a password instead
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
