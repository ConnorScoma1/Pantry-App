import { strict as assert } from "node:assert";
import { test } from "node:test";
import { inviteEmail, RESEND_API_URL, safeName, sendEmail } from "./email";

test("invite email: values are escaped and the link is the only call to action", () => {
  const m = inviteEmail({ to: "sam@example.com", link: "https://pantry.example/invite/abc", householdName: "<script>The Parks</script>", inviterName: "Alex & Co", days: 7 });
  assert.equal(m.subject, "You're invited to share a kitchen on Kitchen Pantry", "names never go in the subject");
  assert.ok(!m.html.includes("<script>") && !m.text.includes("<script>"));
  assert.match(m.html, /Alex &amp; Co/);
  assert.match(m.text, /expires in 7 days and works once/);
});

test("send email: only real addresses; the API key stays in the header; failures don't throw", async () => {
  let sent: { url: string; auth?: string; body: Record<string, unknown> } | null = null;
  const fetchImpl = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    sent = { url, auth: init.headers.Authorization, body: JSON.parse(init.body) as Record<string, unknown> };
    return { ok: true, status: 200, json: async () => ({ id: "em_1" }) };
  };
  const msg = inviteEmail({ to: "sam@example.com", link: "https://x.example/i/1", householdName: "H", inviterName: "A", days: 1 });
  assert.deepEqual(await sendEmail(msg, { apiKey: "re_test", from: "Kitchen Pantry <hello@pantry.example>", fetchImpl }), { ok: true, id: "em_1" });
  assert.equal(sent!.url, RESEND_API_URL);
  assert.equal(sent!.auth, "Bearer re_test");
  assert.deepEqual(sent!.body.to, ["sam@example.com"]);
  assert.deepEqual(await sendEmail({ ...msg, to: "not an email" }, { apiKey: "k", from: "f", fetchImpl }), { ok: false, reason: "invalid_recipient" });
  const down = await sendEmail(msg, { apiKey: "k", from: "f", fetchImpl: async () => { throw new Error("offline"); } });
  assert.deepEqual(down, { ok: false, reason: "network" });
});

test("invite email: names that look like links or addresses are replaced", () => {
  assert.equal(safeName("The Parks", "x"), "The Parks");
  for (const bad of ["Account locked - verify at evil.example", "visit www.bad.co", "https://x", "help@bank.com", "evil . com", "evil(dot)com"]) {
    assert.equal(safeName(bad, "their household"), "their household", bad);
  }
  const m = inviteEmail({ to: "v@example.com", link: "https://pantry.example/invite/abc", householdName: "Verify at evil.example now", inviterName: "Support team at bank.com", days: 7 });
  assert.ok(!/evil|bank/.test(m.text + m.html + m.subject));
  assert.match(m.text, /A Kitchen Pantry member invited you to join their household/);
});
