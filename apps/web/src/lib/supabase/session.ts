import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath, isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./config";

/**
 * Runs in the proxy on every matched request: refreshes the Supabase auth
 * cookie and sends signed-out visitors to /sign-in.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  if (!isSupabaseConfigured) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Validates the token with Supabase Auth (don't trust the cookie alone).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, searchParams } = request.nextUrl;
  // API routes answer 401 themselves (the phone app sends a bearer token, not cookies).
  if (pathname.startsWith("/api/")) return response;
  // Supabase sends people to the Site URL instead of /auth/callback when the
  // callback isn't in its allowed redirect URLs. Finish the sign-in anyway.
  if (!user && !pathname.startsWith("/auth/")) {
    const code = searchParams.get("code");
    if (code) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/callback";
      url.search = `?code=${encodeURIComponent(code)}&next=${encodeURIComponent(pathname === "/sign-in" ? "/" : pathname)}`;
      return NextResponse.redirect(url);
    }
    if (searchParams.has("error_description") || searchParams.has("error_code")) {
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      url.search = "?error=social";
      return NextResponse.redirect(url);
    }
  }
  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  if (user && pathname === "/sign-in") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
