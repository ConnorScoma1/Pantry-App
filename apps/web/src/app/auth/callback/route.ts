import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Exchanges the code from a magic link, email confirmation or Google / Apple / Facebook sign-in for a session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  // The person cancelled at Google / Apple / Facebook, or the provider refused.
  if (!code && (searchParams.has("error") || searchParams.has("error_description"))) {
    console.error("[auth] provider returned an error", { error: searchParams.get("error_code") ?? searchParams.get("error") });
    return NextResponse.redirect(`${origin}/sign-in?error=social`);
  }

  if (isSupabaseConfigured && code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.error("[auth] code exchange failed", { code: error.code });
  }
  return NextResponse.redirect(`${origin}/sign-in?error=link`);
}

/** Only allow same-site relative redirects. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
