/**
 * Transactional email through Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Server only; used for household invitations when RESEND_API_KEY and
 * INVITE_EMAIL_FROM are set. Without them the app falls back to "Email it"
 * (opens the person's own mail app) — nothing is sent by the server.
 */
export const RESEND_API_URL = "https://api.resend.com/emails";

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendEmail(
  message: EmailMessage,
  options: { apiKey: string; from: string; fetchImpl?: FetchLike; timeoutMs?: number },
): Promise<{ ok: true; id: string | null } | { ok: false; reason: string }> {
  if (!EMAIL.test(message.to) || message.to.length > 254) return { ok: false, reason: "invalid_recipient" };
  const doFetch = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  try {
    const res = await doFetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: options.from, to: [message.to], subject: message.subject.slice(0, 200), text: message.text, html: message.html }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const body = (await res.json().catch(() => ({}))) as { id?: unknown };
    return { ok: true, id: typeof body.id === "string" ? body.id : null };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/**
 * Names people typed (household and display names) go into invite emails
 * sent from the app's own address, so anything that looks like a link, a
 * domain or an email address is replaced with a neutral phrase — the email
 * can't be turned into a phishing message. Names never go in the subject.
 */
const LINKISH = /(https?:|www\.|@|[a-z0-9-]+\s*(\.|\[\.\]|\(dot\))\s*[a-z]{2,}\b)/i;
export function safeName(name: string | null | undefined, fallback: string): string {
  const n = (name ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return n && !LINKISH.test(n) ? n : fallback;
}

/** The household invitation, as plain text and simple HTML (every value escaped). */
export function inviteEmail(o: { to: string; link: string; householdName: string; inviterName: string; days: number }): EmailMessage {
  const days = `${o.days} ${o.days === 1 ? "day" : "days"}`;
  const inviter = safeName(o.inviterName, "A Kitchen Pantry member");
  const household = safeName(o.householdName, "their household");
  const subject = "You're invited to share a kitchen on Kitchen Pantry";
  const text = [
    `${inviter} invited you to join ${household} and share meal plans, the kitchen inventory and the grocery list on Kitchen Pantry.`,
    "",
    "Open this link to join (you'll sign in or create an account first):",
    o.link,
    "",
    `The link expires in ${days} and works once. If you weren't expecting this, you can ignore it. Kitchen Pantry will never ask for a password or payment details by email.`,
  ].join("\n");
  const html = `<p>${escapeHtml(inviter)} invited you to join ${escapeHtml(household)} and share meal plans, the kitchen inventory and the grocery list on Kitchen Pantry.</p>
<p><a href="${escapeHtml(o.link)}">Join on Kitchen Pantry</a></p>
<p>You'll sign in or create an account first. The link expires in ${days} and works once. If you weren't expecting this, you can ignore it. Kitchen Pantry will never ask for a password or payment details by email.</p>`;
  return { to: o.to, subject, text, html };
}
