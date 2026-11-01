"use client";

import { skillLevels, type SkillLevel } from "@kitchen-pantry/shared-types";
import { ChevronRight, LogOut, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useProfile } from "@/components/profile/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, Hint, PageHeader } from "@/components/ui/card";
import { ChoiceCard, Segmented } from "@/components/ui/controls";
import { savePreviewProfile } from "@/lib/preview-store";
import { applyThemePreference, readThemePreference, type ThemePreference } from "@/lib/theme";
import { resetLearnedPreferencesAction, setSkillLevelAction } from "./actions";

export function ProfileView() {
  const { mode, email, profile, updateLocal } = useProfile();
  const router = useRouter();
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setTheme(readThemePreference()), []);

  function changeSkill(level: SkillLevel) {
    const previous = profile;
    updateLocal({ ...profile, skillLevel: level });
    setMessage(null);
    if (mode === "supabase") {
      startTransition(async () => {
        const result = await setSkillLevelAction(level);
        if (!result.ok) {
          updateLocal(previous);
          setMessage(result.message);
        }
      });
    }
  }

  function resetRecommendations() {
    setMessage(null);
    startTransition(async () => {
      if (mode === "preview") {
        setMessage("Nothing to reset yet — recommendations start learning once you cook and rate meals.");
        return;
      }
      const result = await resetLearnedPreferencesAction();
      setMessage(result.ok ? "Recommendations reset. Your stated preferences are unchanged." : result.message);
    });
  }

  function clearPreview() {
    savePreviewProfile(null);
    router.replace("/onboarding");
  }

  return (
    <div className="animate-enter">
      <PageHeader title="Profile" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <Eyebrow>Account</Eyebrow>
          {mode === "supabase" ? (
            <>
              <p className="mt-2 text-xl font-bold break-all">{email}</p>
              <form action="/auth/sign-out" method="post" className="mt-4">
                <Button type="submit" variant="secondary" icon={<LogOut className="size-4" aria-hidden />}>
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className="mt-2 text-xl font-bold">Preview mode</p>
              <Hint className="mt-1">
                Accounts turn on once Supabase is connected (see the README). Until then your answers live in this
                browser only.
              </Hint>
            </>
          )}
        </Card>

        <Card>
          <Eyebrow>Appearance</Eyebrow>
          <div className="mt-3">
            <Segmented
              label="Theme"
              value={theme}
              onChange={(value) => {
                setTheme(value);
                applyThemePreference(value);
              }}
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </div>
          <Hint>System follows your device&apos;s light or dark setting.</Hint>
        </Card>

        <Card className="lg:col-span-2">
          <Eyebrow>Cooking skill</Eyebrow>
          <p className="mt-1.5 text-[16px] text-muted">
            Change this whenever you like — advanced levels unlock more technical recipes and are never simplified
            automatically.
          </p>
          <div role="radiogroup" aria-label="Cooking skill" className="mt-4 grid gap-2.5 md:grid-cols-2">
            {skillLevels.map((s) => (
              <ChoiceCard
                key={s.level}
                selected={profile.skillLevel === s.level}
                onSelect={() => changeSkill(s.level)}
                title={`${s.level} · ${s.label}`}
                description={s.summary}
              />
            ))}
          </div>
        </Card>

        <Card>
          <Eyebrow>Preferences</Eyebrow>
          <Link
            href="/onboarding?step=household"
            className="mt-3 flex min-h-12 items-center justify-between rounded-2xl bg-background px-4 font-medium hover:bg-surface-strong"
          >
            Edit questionnaire answers <ChevronRight className="size-5 text-muted" aria-hidden />
          </Link>
          <Button
            variant="ghost"
            className="mt-2 w-full justify-start px-4"
            onClick={resetRecommendations}
            disabled={pending}
            icon={<RotateCcw className="size-4" aria-hidden />}
          >
            Reset learned recommendations
          </Button>
          {mode === "preview" ? (
            <Button variant="danger" className="mt-2 w-full" onClick={clearPreview}>
              Clear preview data and start over
            </Button>
          ) : null}
        </Card>
      </div>

      {message ? (
        <p role="status" className="mt-4 rounded-2xl bg-surface px-4 py-3 text-[15px]">
          {message}
        </p>
      ) : null}
    </div>
  );
}
