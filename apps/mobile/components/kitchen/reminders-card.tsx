import { Text, View } from "react-native";
import { Notice, Toggle } from "@/components/controls";
import { Card, Eyebrow } from "@/components/ui";
import { useReminders } from "@/lib/use-weekly-planning";

/**
 * Profile → Reminders (just this person). Use-soon reminders: once a day,
 * in the daytime, when something in the kitchen is due today or tomorrow.
 */
export function RemindersCard() {
  const r = useReminders();
  return (
    <Card>
      <Eyebrow>Reminders</Eyebrow>
      <View className="mt-2 gap-1">
        <Text className="text-[17px] font-semibold text-foreground">Food to use soon (just you)</Text>
        <Text className="text-[15px] leading-5 text-muted">
          Once a day, in the daytime, when something in your kitchen is due today or tomorrow — going by the use-by dates you entered.
        </Text>
      </View>
      <View className="mt-4 gap-4">
        <Toggle label="In the app" description="A notice on Home." value={r.prefs.useSoonInApp} onChange={(useSoonInApp) => void r.save({ useSoonInApp })} />
        {r.push.available || r.prefs.useSoonPush ? (
          <Toggle label="On this phone" description="A notification, even when the app is closed." value={r.prefs.useSoonPush} onChange={(useSoonPush) => void r.save({ useSoonPush })} />
        ) : (
          <View>
            <Text className="text-[17px] font-medium text-foreground">On this phone</Text>
            <Text className="text-[15px] text-muted">{r.push.reason}</Text>
          </View>
        )}
      </View>
      {!r.loading && !r.server.running && r.server.reason ? (
        <View className="mt-4">
          <Notice tone="warning">{r.server.reason}</Notice>
        </View>
      ) : null}
      <Text className="mt-4 text-[14px] leading-5 text-muted">Dates are a guide, not a safety check — if something looks or smells off, or is past its date, throw it out.</Text>
      {r.error ? (
        <View className="mt-3">
          <Notice tone="error">{r.error}</Notice>
        </View>
      ) : null}
    </Card>
  );
}
