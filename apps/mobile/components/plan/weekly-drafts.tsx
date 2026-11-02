import Ionicons from "@expo/vector-icons/Ionicons";
import { hourLabel, WEEKDAYS } from "@kitchen-pantry/meal-planner";
import { planningModes, type MealPlan, type PlanningMode } from "@kitchen-pantry/shared-types";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Button, Chip, ChipRow, Notice, Toggle } from "@/components/controls";
import { Card, Eyebrow } from "@/components/ui";
import { useThemeColors } from "@/lib/theme";
import { useNotifications, useWeeklyJob, useWeeklyPlanning } from "@/lib/use-weekly-planning";

const MODES = planningModes.filter((m) => m.available);

function shortDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function HourPicker({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  const c = useThemeColors();
  const round = "size-11 items-center justify-center rounded-full border border-border bg-background";
  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="flex-1 text-[15px] font-semibold text-foreground">Time</Text>
      <View className="flex-row items-center gap-3">
        <Pressable accessibilityRole="button" accessibilityLabel="Earlier" onPress={() => onChange((value + 23) % 24)} className={round}>
          <Ionicons name="remove" size={20} color={c.foreground} />
        </Pressable>
        <Text accessibilityLiveRegion="polite" className="min-w-[84px] text-center text-[18px] font-bold text-foreground">
          {hourLabel(value)}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Later" onPress={() => onChange((value + 1) % 24)} className={round}>
          <Ionicons name="add" size={20} color={c.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

/** Plan → Planning settings → Weekly drafts. Off by default. */
export function WeeklyDraftsCard() {
  const w = useWeeklyPlanning();
  const s = w.settings;
  return (
    <Card>
      <Eyebrow>Weekly drafts</Eyebrow>
      <Text className="mt-1.5 text-[16px] leading-6 text-muted">
        Once a week we draft next week&apos;s dinners from your kitchen, what needs using up and your preferences, for you to review. Nothing is ever bought, and a week you&apos;ve confirmed or started is never changed.
      </Text>
      <View className="mt-4 gap-5">
        <Toggle
          label="Draft next week for me"
          description={s.enabled ? `Every ${w.schedule.label}.` : "Off — you plan each week yourself."}
          value={s.enabled}
          onChange={(enabled) => void w.save({ enabled })}
        />
        {s.enabled ? (
          <>
            <View className="gap-2">
              <Text className="text-[15px] font-semibold text-foreground">Day</Text>
              <ChipRow>
                {WEEKDAYS.map((d) => (
                  <Chip key={d.day} label={d.label.slice(0, 3)} selected={s.runDay === d.day} onPress={() => void w.save({ runDay: d.day })} />
                ))}
              </ChipRow>
            </View>
            <HourPicker value={s.runHour} onChange={(runHour) => void w.save({ runHour })} />
            <View className="gap-2">
              <Text className="text-[15px] font-semibold text-foreground">Plan it as</Text>
              <ChipRow>
                {MODES.map((m) => (
                  <Chip key={m.code} label={m.label} selected={s.mode === m.code} onPress={() => void w.save({ mode: m.code as PlanningMode })} />
                ))}
              </ChipRow>
            </View>
            <Text className="text-[15px] leading-5 text-foreground">
              {w.latest && w.latest.weekStart === w.schedule.weekStart && w.latest.status !== "running"
                ? `The week of ${shortDay(w.schedule.weekStart)} is done: ${w.latest.message ?? (w.latest.status === "drafted" ? "a draft is ready." : "no draft this time.")}`
                : w.schedule.due
                  ? `Next week (from ${shortDay(w.schedule.weekStart)}) will be drafted within the hour.`
                  : `Next draft: ${w.schedule.label}, for the week of ${shortDay(w.schedule.weekStart)}.`}
            </Text>
            <Text className="text-[14px] leading-5 text-muted">
              {s.enabledByYou
                ? "Planned with your cooking skill and tastes, and everyone's allergies and diets."
                : s.enabledByName
                  ? `Turned on by ${s.enabledByName} — planned with their skill and tastes, and everyone's allergies and diets.`
                  : "Planned with everyone's allergies and diets."}
            </Text>
            {!w.server.running && w.server.reason ? <Notice tone="warning">{w.server.reason}</Notice> : null}
          </>
        ) : null}
        <View className="gap-4 border-t border-border pt-5">
          <Text className="text-[15px] font-semibold text-foreground">Tell me when a plan is ready (just you)</Text>
          <Toggle label="In the app" description="A notice on Home." value={w.prefs.planReadyInApp} onChange={(planReadyInApp) => void w.savePrefs({ planReadyInApp })} />
          {w.push.available || w.prefs.planReadyPush ? (
            <Toggle label="On this phone" description="A notification, even when the app is closed." value={w.prefs.planReadyPush} onChange={(planReadyPush) => void w.savePrefs({ planReadyPush })} />
          ) : (
            <View>
              <Text className="text-[17px] font-medium text-foreground">On this phone</Text>
              <Text className="text-[15px] text-muted">{w.push.reason}</Text>
            </View>
          )}
        </View>
        {w.error ? <Notice tone="error">{w.error}</Notice> : null}
      </View>
    </Card>
  );
}

export function WeeklyDraftBanner({ weekStart, plan }: { weekStart: string; plan: MealPlan | null }) {
  const job = useWeeklyJob(weekStart);
  if (!job || job.status === "running") return null;
  if (job.status === "drafted") {
    if (!plan || plan.id !== job.mealPlanId || plan.confirmedAt) return null;
    const notes = job.details.notes && job.details.notes.length > 0 ? ` ${job.details.notes.join(" ")}` : "";
    return <Notice>{`Drafted for you. ${job.message ?? "Next week's dinners are ready."} Swap or lock anything, then confirm the week.${notes}`}</Notice>;
  }
  if (plan && plan.meals.length > 0) return null;
  return <Notice tone={job.status === "failed" ? "warning" : "info"}>{job.message ?? "There's no draft for this week."}</Notice>;
}

/** Home: the newest unread "plan is ready" notice. */
export function PlanReadyCard() {
  const n = useNotifications();
  const notice = n.items.find((x) => x.kind === "plan_ready" && !x.readAt);
  if (!notice) return null;
  return (
    <View accessibilityRole="summary" className="gap-3 rounded-card bg-accent-soft p-5">
      <Text className="text-[17px] font-semibold text-foreground">{notice.title}</Text>
      {notice.body ? <Text className="text-[15px] leading-5 text-foreground">{notice.body}</Text> : null}
      <View className="flex-row flex-wrap gap-2">
        <Button
          label="Review the plan"
          onPress={() => {
            void n.markRead([notice.id]);
            router.push((notice.link ?? "/plan") as never);
          }}
        />
        <Button label="Later" variant="ghost" onPress={() => void n.markRead([notice.id])} />
      </View>
    </View>
  );
}
