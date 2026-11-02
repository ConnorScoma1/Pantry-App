import type { OnboardingProfile } from "@kitchen-pantry/shared-types";
import {
  defaultOnboardingProfile,
  onboardingProfileSchema,
  onboardingSteps,
  validateOnboardingStep,
  type OnboardingStepId,
} from "@kitchen-pantry/validation";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Notice } from "@/components/controls";
import {
  BudgetStep,
  DietStep,
  EquipmentStep,
  GoalsStep,
  HouseholdStep,
  ReviewStep,
  SkillStep,
  StoreStep,
  type StepProps,
} from "@/components/onboarding/steps";
import { useApp } from "@/lib/app-state";
import { useThemeColors } from "@/lib/theme";

const STEPS: Record<OnboardingStepId, ComponentType<StepProps>> = {
  household: HouseholdStep,
  budget: BudgetStep,
  goals: GoalsStep,
  diet: DietStep,
  skill: SkillStep,
  equipment: EquipmentStep,
  store: StoreStep,
};

const COPY: Record<OnboardingStepId, string> = {
  household: "Tell us who you're cooking for.",
  budget: "We plan the whole basket against this — not just each recipe.",
  goals: "So every week is planned around what matters to you.",
  diet: "Allergies are strict. Everything else shapes what we suggest.",
  skill: "We match techniques to your level — and never dumb down advanced cooking.",
  equipment: "Tick everything you own.",
  store: "Last one.",
};

const REVIEW = onboardingSteps.length;

export default function OnboardingScreen() {
  const c = useThemeColors();
  const { signedIn, profile: saved, saveProfile, joinDraft } = useApp();
  const editing = saved !== null;
  const [profile, setProfileState] = useState<OnboardingProfile>(saved ?? defaultOnboardingProfile());
  const [index, setIndex] = useState(0);
  const [joining, setJoining] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [index]);

  // Joined a household before setting up: start from its shared answers, at "What you eat".
  useEffect(() => {
    if (editing) return;
    let cancelled = false;
    void joinDraft().then((draft) => {
      if (cancelled || !draft) return;
      setProfileState(draft);
      setJoining(true);
      setIndex(onboardingSteps.findIndex((s) => s.id === "diet"));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setProfile = useCallback((update: (p: OnboardingProfile) => OnboardingProfile) => {
    setProfileState(update);
    setErrors({});
    setFormError(null);
  }, []);

  if (!signedIn) return <Redirect href="/sign-in" />;

  const isReview = index === REVIEW;
  const step = isReview ? null : onboardingSteps[index]!;
  const Step = step ? STEPS[step.id] : null;

  function goTo(i: number) {
    setErrors({});
    setFormError(null);
    setIndex(i);
  }

  function next() {
    if (step) {
      const stepErrors = validateOnboardingStep(step.id, profile);
      if (Object.keys(stepErrors).length > 0) {
        setErrors(stepErrors);
        setFormError("Please check the highlighted answers.");
        return;
      }
    }
    goTo(editing ? REVIEW : Math.min(index + 1, REVIEW));
  }

  async function save() {
    const parsed = onboardingProfileSchema.safeParse(profile);
    if (!parsed.success) {
      const firstBad = onboardingSteps.findIndex((s) => Object.keys(validateOnboardingStep(s.id, profile)).length > 0);
      if (firstBad >= 0) {
        goTo(firstBad);
        setErrors(validateOnboardingStep(onboardingSteps[firstBad]!.id, profile));
      }
      setFormError("Please check the highlighted answers.");
      return;
    }
    setSaving(true);
    const result = await saveProfile(parsed.data);
    setSaving(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    router.replace("/");
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <View className="border-b border-border px-5 pb-3 pt-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-[15px] text-muted">
            {isReview ? "Review" : `Step ${index + 1} of ${onboardingSteps.length}`}
          </Text>
          {editing ? (
            <Pressable accessibilityRole="button" onPress={() => router.back()} className="min-h-10 justify-center">
              <Text className="text-[15px] font-semibold text-muted">Cancel</Text>
            </Pressable>
          ) : null}
        </View>
        <View className="mt-2 flex-row gap-1.5" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: REVIEW, now: index }}>
          {onboardingSteps.map((s, i) => (
            <Pressable
              key={s.id}
              accessibilityLabel={s.title}
              disabled={!(editing || i < index)}
              onPress={() => goTo(i)}
              className="flex-1 py-1.5"
            >
              <View className={`h-1.5 rounded-full ${i < index || isReview ? "bg-foreground" : i === index ? "bg-accent" : "bg-surface-strong"}`} />
            </Pressable>
          ))}
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView ref={scroll} contentContainerClassName="px-5 pb-10 pt-6" keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" className="text-[32px] font-bold leading-tight tracking-tight text-foreground">
            {isReview ? (editing ? "Your answers" : "Looks good?") : step!.title}
          </Text>
          {joining && step?.id === "diet" ? (
            <View className="mt-4">
              <Notice>You&apos;ve joined a household, so its size, budget, equipment and store are already filled in. These next answers are just yours.</Notice>
            </View>
          ) : null}
          <Text className="mb-6 mt-2 text-[17px] text-muted">
            {isReview ? "Check everything over. You can change any of this later." : COPY[step!.id]}
          </Text>
          {Step ? (
            <Step profile={profile} setProfile={setProfile} errors={errors} />
          ) : (
            <ReviewStep profile={profile} onEdit={(id) => goTo(onboardingSteps.findIndex((s) => s.id === id))} />
          )}
        </ScrollView>

        <View className="gap-2 border-t border-border px-5 pb-2 pt-3">
          {formError ? <Notice tone="error">{formError}</Notice> : null}
          <View className="flex-row items-center gap-3">
            {index > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={() => goTo(editing && !isReview ? REVIEW : index - 1)}
                className="size-14 items-center justify-center rounded-full border border-border"
              >
                <Ionicons name="arrow-back" size={22} color={c.foreground} />
              </Pressable>
            ) : null}
            <View className="flex-1">
              {isReview ? (
                <Button
                  size="lg"
                  icon="checkmark"
                  label={saving ? "Saving…" : editing ? "Save changes" : "Save and start planning"}
                  onPress={save}
                  disabled={saving}
                />
              ) : (
                <Button size="lg" label={editing ? "Done" : "Continue"} onPress={next} />
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
