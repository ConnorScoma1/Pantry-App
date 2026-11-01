import type { SupabaseLike } from "@kitchen-pantry/database";

/**
 * The shared data layer only needs `from` and `rpc`. supabase-js clients
 * satisfy that at runtime; this single cast keeps generic-heavy client types
 * out of the shared packages.
 */
export function asSupabaseLike(client: unknown): SupabaseLike {
  return client as SupabaseLike;
}
