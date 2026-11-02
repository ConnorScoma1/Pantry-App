/**
 * Production monitoring hook (Next.js instrumentation). Every server error
 * — route handlers, server actions, rendering — is logged as one JSON line
 * your host's log drain can alert on (Vercel, Fly, Render all collect
 * stdout). No request bodies, cookies or headers are logged.
 * To send errors to a service such as Sentry instead, install its SDK and
 * call it here.
 */
export async function register() {
  // Nothing to start: logs go to stdout.
}

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  const e = error as { message?: string; digest?: string; name?: string };
  console.error(
    JSON.stringify({
      level: "error",
      source: "kitchen-pantry-web",
      at: new Date().toISOString(),
      name: e?.name ?? "Error",
      message: String(e?.message ?? error).slice(0, 500),
      digest: e?.digest ?? null,
      method: request.method,
      // Path only — invite tokens and other secrets live in path segments, so mask long ids.
      path: request.path.replace(/[A-Za-z0-9_-]{20,}/g, ":id").split("?")[0],
      route: context.routePath,
      routeType: context.routeType,
    }),
  );
}
