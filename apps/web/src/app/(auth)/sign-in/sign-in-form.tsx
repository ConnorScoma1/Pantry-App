"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Segmented, TextInput } from "@/components/ui/controls";
import { magicLinkAction, signInAction, signUpAction, type AuthFormState } from "./actions";

type Mode = "sign-in" | "sign-up" | "magic-link";

const initial: AuthFormState = { status: "idle" };

export function SignInForm({ next, linkError }: { next: string; linkError: boolean }) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [signInState, signIn, signingIn] = useActionState(signInAction, initial);
  const [signUpState, signUp, signingUp] = useActionState(signUpAction, initial);
  const [linkState, sendLink, sendingLink] = useActionState(magicLinkAction, initial);

  const state = mode === "sign-in" ? signInState : mode === "sign-up" ? signUpState : linkState;
  const action = mode === "sign-in" ? signIn : mode === "sign-up" ? signUp : sendLink;
  const pending = signingIn || signingUp || sendingLink;

  return (
    <div className="mt-8">
      <Segmented
        label="How do you want to sign in?"
        value={mode}
        onChange={setMode}
        options={[
          { value: "sign-in", label: "Sign in" },
          { value: "sign-up", label: "Create account" },
          { value: "magic-link", label: "Email link" },
        ]}
      />

      {linkError ? (
        <p role="alert" className="mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">
          That sign-in link has expired or was already used. Request a new one.
        </p>
      ) : null}

      <form key={mode} action={action} className="mt-6 space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
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
              Password
            </label>
            <TextInput
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              required
              invalid={Boolean(state.fieldErrors?.password)}
              aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
            />
            <FieldError id="password-error" message={state.fieldErrors?.password} />
            {mode === "sign-up" ? <p className="mt-1.5 text-[14px] text-muted">At least 10 characters.</p> : null}
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
    </div>
  );
}
