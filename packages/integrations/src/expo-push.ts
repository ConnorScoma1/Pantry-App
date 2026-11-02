/**
 * Phone notifications through Expo's push service (the free service Expo
 * apps use; it forwards to Apple and Google). Server only. Each message goes
 * to one Expo push address registered by a signed-in phone.
 *
 * Expo answers with one "ticket" per message. A ticket error of
 * DeviceNotRegistered means the app was removed or notifications were
 * switched off on that phone, so the address should be forgotten.
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */
export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** In-app path the app opens when the notice is tapped. */
  data?: { url: string };
}

export interface PushOutcome {
  sent: number;
  failed: number;
  /** Addresses Expo says no longer work. */
  stale: string[];
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$/;

export async function sendExpoPushes(
  messages: readonly PushMessage[],
  options: { fetchImpl?: FetchLike; accessToken?: string | null; timeoutMs?: number } = {},
): Promise<PushOutcome> {
  const valid = messages.filter((m) => EXPO_TOKEN.test(m.to)).map((m) => ({
    to: m.to,
    title: m.title.slice(0, 120),
    body: m.body.slice(0, 300),
    sound: "default",
    ...(m.data && /^\/[A-Za-z0-9/_?=&.-]*$/.test(m.data.url) ? { data: m.data } : {}),
  }));
  const outcome: PushOutcome = { sent: 0, failed: messages.length - valid.length, stale: [] };
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  for (let i = 0; i < valid.length; i += 100) {
    const batch = valid.slice(i, i + 100);
    const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
    if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
    try {
      const res = await fetchImpl(EXPO_PUSH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });
      const json = (res.ok ? await res.json() : null) as { data?: Array<{ status?: string; details?: { error?: string } }> } | null;
      const tickets = Array.isArray(json?.data) ? json!.data : [];
      batch.forEach((m, k) => {
        const t = tickets[k];
        if (t?.status === "ok") outcome.sent += 1;
        else {
          outcome.failed += 1;
          if (t?.details?.error === "DeviceNotRegistered") outcome.stale.push(m.to);
        }
      });
    } catch {
      outcome.failed += batch.length;
    }
  }
  return outcome;
}
