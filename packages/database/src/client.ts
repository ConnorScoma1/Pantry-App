/**
 * The slice of a Supabase client this package uses. Both the web server
 * client (@supabase/ssr) and the mobile client (@supabase/supabase-js) fit
 * it, and tests can pass a small fake. Query builders are typed loosely on
 * purpose; every value coming back is validated or mapped explicitly.
 */
export interface DbError {
  code?: string;
  message?: string;
}

export interface DbResponse<T = unknown> {
  data: T;
  error: DbError | null;
}

export interface SupabaseLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<DbResponse>;
}

export type Result<T> = { ok: true; data: T } | { ok: false; message: string; fieldErrors?: Record<string, string> };

/** Log the technical detail, return a friendly message. */
export function dbFailure(context: string, error: DbError, message: string): Result<never> {
  console.error(`[db] ${context} failed`, { code: error.code, message: error.message });
  return { ok: false, message };
}

/** Async key-value storage: AsyncStorage on mobile, a localStorage wrapper on web. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}
