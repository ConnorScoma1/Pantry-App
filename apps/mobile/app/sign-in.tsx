import { brand } from "@kitchen-pantry/ui-tokens";
import { socialProviderLabels, type SocialProvider } from "@kitchen-pantry/validation";
import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Field, Input, Notice, Segmented } from "@/components/controls";
import { useApp } from "@/lib/app-state";
import { signInWithProvider, socialSignInOptions } from "@/lib/social-sign-in";
import { apiUrl } from "@/lib/config";

type Mode = "sign-in" | "sign-up";

export default function SignInScreen() {
  const { mode: dataMode, signedIn, profile, signIn, signUp } = useApp();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [providers, setProviders] = useState<SocialProvider[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (dataMode === "supabase") void socialSignInOptions().then((p) => !cancelled && setProviders(p));
    return () => {
      cancelled = true;
    };
  }, [dataMode]);

  if (dataMode === "preview" || signedIn) return <Redirect href={profile ? "/" : "/onboarding"} />;

  function switchTo(m: Mode) {
    setMode(m);
    setErrors({});
    setMessage(null);
  }

  async function social(provider: SocialProvider) {
    setBusy(true);
    setMessage(null);
    const result = await signInWithProvider(provider);
    setBusy(false);
    // Signed in: the app's session listener moves on to Home or onboarding.
    if (!result.ok && !result.cancelled) setMessage({ tone: "error", text: result.message });
  }

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
        setMessage({ tone: "info", text: `Check your email (${email.trim()}) for a link to confirm your account, then sign in here. Check spam if it hasn't arrived in a minute.` });
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
              onChange={switchTo}
              options={[
                { value: "sign-in", label: "Sign in" },
                { value: "sign-up", label: "Create account" },
              ]}
            />
            {providers.length > 0 ? (
              <>
                {providers.map((p) => (
                  <Button
                    key={p}
                    variant="secondary"
                    size="lg"
                    label={`${mode === "sign-up" ? "Sign up" : "Continue"} with ${socialProviderLabels[p]}`}
                    onPress={() => void social(p)}
                    disabled={busy}
                  />
                ))}
                <Text className="text-center text-[14px] text-muted">or with your email</Text>
              </>
            ) : null}
            {mode === "sign-up" ? (
              <Text className="text-[15px] text-muted">
                Create a free account with your email and a password. We&apos;ll email you a link to confirm it.
              </Text>
            ) : null}
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
              label={mode === "sign-up" ? "Choose a password" : "Password"}
              error={errors.password}
              hint={mode === "sign-up" ? "At least 10 characters. Mixing letters, numbers and symbols is safest." : undefined}
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
            <Pressable accessibilityRole="button" onPress={() => switchTo(mode === "sign-up" ? "sign-in" : "sign-up")} className="py-1">
              <Text className="text-center text-[15px] text-muted">
                {mode === "sign-up" ? "Already have an account? " : "New to Kitchen Pantry? "}
                <Text className="font-semibold text-foreground underline">{mode === "sign-up" ? "Sign in" : "Create an account"}</Text>
              </Text>
            </Pressable>
            <Text className="text-center text-[14px] text-muted">
              Same account as the Kitchen Pantry website.
            </Text>
            {apiUrl ? (
              <Text className="text-center text-[13px] text-muted">
                By continuing you agree to the{" "}
                <Text accessibilityRole="link" className="underline" onPress={() => void Linking.openURL(`${apiUrl}/terms`)}>terms of use</Text> and{" "}
                <Text accessibilityRole="link" className="underline" onPress={() => void Linking.openURL(`${apiUrl}/privacy`)}>privacy policy</Text>.
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
