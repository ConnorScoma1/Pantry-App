"use client";

import type { OnboardingProfile } from "@kitchen-pantry/shared-types";
import {
  defaultOnboardingProfile,
  issuesToFieldErrors,
  onboardingProfileSchema,
  onboardingSteps,
  type OnboardingStepId,
} from "@kitchen-pantry/validation";
import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ComponentType } from "react";
import { BrandLockup } from "@/components/shell/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { loadDraft, loadPreviewProfile, saveDraft, savePreviewProfile } from "@/lib/preview-store";
import { saveOnboardingAction } from "./actions";
import { BudgetStep } from "./steps/budget";
import { DietStep } from "./steps/diet";
import { GoalsStep } from "./steps/goals";
import { HouseholdStep } from "./steps/household";
import { ReviewStep } from "./steps/review";
import { EquipmentStep, SkillStep, StoreStep } from "./steps/skill-equipment-store";
import type { StepProps } from "./steps/types";

const STEP_COMPONENTS: Record<OnboardingStepId, ComponentType<StepProps>> = {
  household: HouseholdStep,
  budget: BudgetStep,
  goals: GoalsStep,
  diet: DietStep,
  skill: SkillStep,
  equipment: EquipmentStep,
  store: StoreStep,
};

const STEP_COPY: Record<OnboardingStepId, string> = {
  household: "Tell us who you're cooking for.",
  budget: "We plan the whole basket against this — not just each recipe.",
  goals: "So every week is planned around what matters to you.",
  diet: "Allergies are strict. Everything else shapes what we suggest.",
  skill: "We match techniques to your level — and never dumb down advanced cooking.",
  equipment: "Tick everything you own.",
  store: "Last one.",
};

/** The slice of the profile each step validates. */
function stepValue(id: OnboardingStepId, p: OnboardingProfile): unknown {
  switch (id) {
    case "household":
      return p.household;
    case "budget":
      return p.budget;
    case "goals":
      return p.goals;
    case "diet":
      return p.diet;
    case "skill":
      return { skillLevel: p.skillLevel };
    case "equipment":
      return { equipment: p.equipment };
    case "store":
      return p.store;
  }
}

const REVIEW_INDEX = onboardingSteps.length;

export function OnboardingFlow({
  mode,
  initialProfile,
  initialStep,
}: {
  mode: "preview" | "supabase";
  initialProfile: OnboardingProfile | null;
  initialStep: string | null;
}) {
  const router = useRouter();
  const requestedIndex = onboardingSteps.findIndex((s) => s.id === initialStep);
  const [isEditing, setIsEditing] = useState(initialProfile !== null);
  const [profile, setProfileState] = useState<OnboardingProfile>(initialProfile ?? defaultOnboardingProfile());
  const [index, setIndex] = useState(requestedIndex >= 0 ? requestedIndex : 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(mode === "supabase");
  const [saving, startSaving] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Restore preview profile (editing) or an unfinished draft (new user).
  useEffect(() => {
    if (initialProfile) {
      setHydrated(true);
      return;
    }
    const existing = mode === "preview" ? loadPreviewProfile() : null;
    if (existing) {
      setProfileState(existing);
      setIsEditing(true);
    } else {
      const draft = loadDraft();
      if (draft) {
        setProfileState({ ...defaultOnboardingProfile(), ...draft.profile });
        if (requestedIndex < 0) setIndex(Math.min(Math.max(draft.stepIndex, 0), REVIEW_INDEX));
      }
    }
    setHydrated(true);
    // Runs once on mount: restoring state must not re-run when props change.
  }, []);

  // Persist the draft so a refresh doesn't lose answers (new users only).
  useEffect(() => {
    if (hydrated && !isEditing) saveDraft({ profile, stepIndex: index });
  }, [hydrated, isEditing, profile, index]);

  // Move focus to the step heading for screen-reader and keyboard users.
  useEffect(() => {
    if (hydrated) headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [index, hydrated]);

  const setProfile = useCallback((update: (current: OnboardingProfile) => OnboardingProfile) => {
    setProfileState(update);
    setErrors({});
    setFormError(null);
  }, []);

  const isReview = index === REVIEW_INDEX;
  const step = isReview ? null : onboardingSteps[index]!;

  function validateCurrent(): boolean {
    if (!step) return true;
    const result = step.schema.safeParse(stepValue(step.id, profile));
    if (result.success) return true;
    setErrors(issuesToFieldErrors(result.error));
    setFormError("Please check the highlighted answers.");
    return false;
  }

  function goTo(target: number) {
    setErrors({});
    setFormError(null);
    setIndex(target);
  }

  function next() {
    if (!validateCurrent()) return;
    goTo(isEditing ? REVIEW_INDEX : Math.min(index + 1, REVIEW_INDEX));
  }

  function back() {
    if (index > 0) goTo(isEditing && !isReview ? REVIEW_INDEX : index - 1);
  }

  function save() {
    const parsed = onboardingProfileSchema.safeParse(profile);
    if (!parsed.success) {
      // Jump to the first step with a problem.
      const firstBad = onboardingSteps.findIndex((s) => !s.schema.safeParse(stepValue(s.id, profile)).success);
      if (firstBad >= 0) {
        goTo(firstBad);
        const result = onboardingSteps[firstBad]!.schema.safeParse(stepValue(onboardingSteps[firstBad]!.id, profile));
        if (!result.success) setErrors(issuesToFieldErrors(result.error));
      }
      setFormError("Please check the highlighted answers.");
      return;
    }

    startSaving(async () => {
      if (mode === "preview") {
        savePreviewProfile(parsed.data);
      } else {
        const result = await saveOnboardingAction(parsed.data);
        if (!result.ok) {
          setFormError(result.message);
          return;
        }
      }
      saveDraft(null);
      router.replace("/");
      router.refresh();
    });
  }

  const StepComponent = step ? STEP_COMPONENTS[step.id] : null;
  const progress = Math.round(((isReview ? onboardingSteps.length : index) / onboardingSteps.length) * 100);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 sm:px-6">
          <BrandLockup />
          {isEditing ? (
            <Link href="/" className="text-[15px] font-semibold text-muted hover:text-foreground">
              Cancel
            </Link>
          ) : (
            <span className="text-[15px] text-muted tabular-nums">
              {isReview ? "Review" : `Step ${index + 1} of ${onboardingSteps.length}`}
            </span>
          )}
        </div>
        <div className="mx-auto max-w-2xl px-4 pb-3 sm:px-6">
          <ol className="flex gap-1.5" aria-label="Progress">
            {onboardingSteps.map((s, i) => {
              const reachable = isEditing || i < index;
              const state = i < index || isReview ? "done" : i === index ? "current" : "todo";
              return (
                <li key={s.id} className="flex-1">
                  <button
                    type="button"
                    disabled={!reachable || saving}
                    onClick={() => goTo(i)}
                    aria-label={`${s.title}${state === "done" ? " (done)" : state === "current" ? " (current step)" : ""}`}
                    aria-current={state === "current" ? "step" : undefined}
                    className="block w-full py-1.5 disabled:cursor-default"
                  >
                    <span
                      className={cn(
                        "block h-1.5 rounded-full transition-colors duration-300",
                        state === "todo" ? "bg-surface-strong" : state === "current" ? "bg-accent" : "bg-foreground",
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ol>
          <span className="sr-only" aria-live="polite">
            {progress}% complete
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-6 pb-40 sm:px-6 sm:pt-10">
        {!hydrated ? (
          <div className="space-y-4" aria-busy="true">
            <div className="h-10 w-2/3 animate-pulse rounded-full bg-surface" />
            <div className="h-48 animate-pulse rounded-card bg-surface" />
          </div>
        ) : (
          <div key={index} className="animate-enter">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-[32px] font-bold leading-tight tracking-tight outline-none sm:text-[38px]"
            >
              {isReview ? (isEditing ? "Your answers" : "Looks good?") : step!.title}
            </h1>
            <p className="mt-2 mb-6 text-[17px] text-muted">
              {isReview
                ? "Check everything over. You can change any of this later."
                : STEP_COPY[step!.id]}
            </p>

            {StepComponent ? (
              <StepComponent profile={profile} setProfile={setProfile} errors={errors} />
            ) : (
              <ReviewStep profile={profile} onEdit={(id) => goTo(onboardingSteps.findIndex((s) => s.id === id))} />
            )}
          </div>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:px-6">
          {formError ? (
            <p role="alert" className="text-center text-[15px] font-medium text-danger">
              {formError}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            {index > 0 ? (
              <Button
                variant="secondary"
                size="lg"
                onClick={back}
                disabled={saving}
                aria-label={isEditing && !isReview ? "Back to review" : "Back"}
                icon={<ArrowLeft className="size-5" aria-hidden />}
                className="px-5"
              />
            ) : null}
            {isReview ? (
              <Button size="lg" className="flex-1" onClick={save} disabled={saving || !hydrated} icon={<Check className="size-5" aria-hidden />}>
                {saving ? "Saving…" : isEditing ? "Save changes" : "Save and start planning"}
              </Button>
            ) : (
              <Button size="lg" className="flex-1" onClick={next} disabled={!hydrated}>
                {isEditing ? "Done" : "Continue"}
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
