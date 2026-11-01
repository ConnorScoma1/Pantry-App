import { brand } from "@kitchen-pantry/ui-tokens";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Field, Input, Notice, Segmented } from "@/components/controls";
import { useApp } from "@/lib/app-state";

type Mode = "sign-in" | "sign-up";

export default function SignInScreen() {
  const { mode: dataMode, signedIn, profile, signIn, signUp } = useApp();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (dataMode === "preview" || signedIn) return <Redirect href={profile ? "/" : "/onboarding"} />;

  async function submit() {
    setBusy(true);
    setMessage(null);
    setErrors({});
    if (mode === "sign-in") {
      const result = await signIn(email, password);
      setBusy(false);
      if (result.ok) router.replace("/");
      else {
        setMessage({ tone: "error", text: result.message });
        setErrors(result.fieldErrors ?? {});
      }
    } else {
      const result = await signUp(email, password);
      setBusy(false);
      if (!result.ok) {
        setMessage({ tone: "error", text: result.message });
        setErrors(result.fieldErrors ?? {});
      } else if (result.data.needsConfirmation) {
        setMessage({ tone: "info", text: "Check your email to confirm your account, then sign in." });
        setMode("sign-in");
      } else {
        router.replace("/onboarding");
      }
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow justify-center px-5 py-10" keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" className="text-[34px] font-bold leading-tight tracking-tight text-foreground">
            Welcome to {brand.name}
          </Text>
          <Text className="mt-2 text-[17px] text-muted">{brand.tagline}</Text>

          <View className="mt-8 gap-4">
            <Segmented
              value={mode}
              onChange={(m) => {
                setMode(m);
                setErrors({});
                setMessage(null);
              }}
              options={[
                { value: "sign-in", label: "Sign in" },
                { value: "sign-up", label: "Create account" },
              ]}
            />
            <Field label="Email" error={errors.email}>
              <Input
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                invalid={Boolean(errors.email)}
                accessibilityLabel="Email"
              />
            </Field>
            <Field
              label="Password"
              error={errors.password}
              hint={mode === "sign-up" ? "At least 10 characters." : undefined}
            >
              <Input
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                textContentType={mode === "sign-up" ? "newPassword" : "password"}
                invalid={Boolean(errors.password)}
                accessibilityLabel="Password"
                onSubmitEditing={submit}
              />
            </Field>
            {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
            <Button
              size="lg"
              label={busy ? "One moment…" : mode === "sign-in" ? "Sign in" : "Create account"}
              onPress={submit}
              disabled={busy}
            />
            <Text className="text-center text-[14px] text-muted">
              Same account as the Kitchen Pantry website.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
