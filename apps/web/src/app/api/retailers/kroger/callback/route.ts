import { NextResponse } from "next/server";
import { finishKrogerConnect, readConnectState } from "@/lib/cart/server";
import { siteUrl } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Kroger sends the shopper back here after they allow cart access (this URL
 * is the KROGER_REDIRECT_URI registered on the Kroger app).
 *  - Web: finish with the browser's session and return to /cart.
 *  - Phone: hand the one-time code to the app (kitchenpantry://cart); the app
 *    finishes it with its own sign-in. The server only accepts it if the
 *    signed-in person is the one the sealed state was made for, and the code
 *    is useless without the server's client secret.
 * Redirects go to the configured site (NEXT_PUBLIC_SITE_URL), never to a
 * host taken from the request.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const back = (q: string) => NextResponse.redirect(new URL(`/cart?${q}`, siteUrl));
  const s = readConnectState(state);
  if (url.searchParams.get("error") || !code || !s) return back("connect=failed");

  if (s.app === "mobile") {
    const deep = new URL("kitchenpantry://cart");
    deep.searchParams.set("kroger_code", code);
    deep.searchParams.set("kroger_state", state);
    return NextResponse.redirect(deep.toString());
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in?next=/cart", siteUrl));
  const r = await finishKrogerConnect(user.id, code, state);
  return back(r.ok ? "connect=kroger" : "connect=failed");
}
