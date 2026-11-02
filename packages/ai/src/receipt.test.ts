import { strict as assert } from "node:assert";
import { test } from "node:test";
import { AiRequestError, checkReceiptImage, cleanReceipt, readReceipt, type AiConfig, type FetchLike } from "./index";

const config: AiConfig = { apiKey: "k", model: "claude-sonnet-5-5", maxOutputTokens: 2048, dailyPlanLimit: 10 };
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString("base64");
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(200, 7)]).toString("base64");

test("receipt image: real image bytes only, matching the declared type and size", () => {
  assert.equal(checkReceiptImage({ mediaType: "image/jpeg", base64: jpeg }).ok, true);
  assert.equal(checkReceiptImage({ mediaType: "image/png", base64: jpeg }).ok, false);
  assert.equal(checkReceiptImage({ mediaType: "image/png", base64: png }).ok, true);
  assert.equal(checkReceiptImage({ mediaType: "image/gif", base64: jpeg }).ok, false);
  assert.equal(checkReceiptImage({ mediaType: "image/jpeg", base64: "not base64!!".repeat(20) }).ok, false);
});

test("receipt: card or account numbers and markup never come back; amounts and dates are checked", () => {
  const d = cleanReceipt(
    {
      readable: true,
      store: "Pick n Save",
      date: "2026-11-01",
      lines: [
        { text: "BANANAS 2.31 LB", name: "Bananas", quantity: 2.31, unit: "lb", priceCents: 136, isFood: true },
        { text: "VISA ************1234 4111 1111 1111 1111", name: "Visa 4111 1111 1111 1111", quantity: null, unit: null, priceCents: 4512, isFood: false },
        { text: "012345678905 WHL MILK GAL", name: "<b>Whole milk</b>", quantity: 1, unit: "gal", priceCents: 389, isFood: true },
        { text: "PAPER TWL", name: "Paper towels", quantity: 3, unit: "rolls", priceCents: 899, isFood: false },
        { text: "?", name: "Mystery", quantity: -2, unit: "lb", priceCents: 9_999_999, isFood: true },
      ],
    },
    "2026-11-02",
  );
  assert.equal(d.lines.length, 4);
  assert.ok(!JSON.stringify(d).includes("4111"));
  assert.equal(d.lines[1]!.name, "Whole milk");
  assert.equal(d.lines[1]!.unit, "gallon");
  assert.equal(d.lines[1]!.category, "dairy");
  assert.equal(d.lines[2]!.quantity, null); // "rolls" isn't a unit we track
  assert.equal(d.lines[3]!.quantity, null);
  assert.equal(d.lines[3]!.priceCents, null);
  assert.equal(d.date, "2026-11-01");
  assert.equal(cleanReceipt({ readable: true, store: null, date: "2027-01-01", lines: [] }, "2026-11-02").date, null);
});

test("receipt: the photo goes to Claude as an image, and an unreadable answer is an error", async () => {
  let sent: any = null;
  const fetchImpl: FetchLike = async (_u, init) => {
    sent = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ model: "m", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ readable: true, store: "Store", date: null, lines: [{ text: "EGGS", name: "Eggs", quantity: 12, unit: "ct", priceCents: 299, isFood: true }] }) }], usage: { input_tokens: 1500, output_tokens: 60 } }) };
  };
  const image = { mediaType: "image/jpeg" as const, base64: jpeg };
  const r = await readReceipt({ config, image, today: "2026-11-02", fetchImpl });
  assert.equal(r.lines[0]!.unit, "each");
  assert.equal(sent.messages[0].content[0].type, "image");
  assert.equal(sent.messages[0].content[0].source.media_type, "image/jpeg");
  const empty: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: JSON.stringify({ readable: false, store: null, date: null, lines: [] }) }] }) });
  await assert.rejects(readReceipt({ config, image, today: "2026-11-02", fetchImpl: empty }), AiRequestError);
});

test("receipt: dotted or slashed card numbers, emails, phones and addresses are removed everywhere", () => {
  const d = cleanReceipt(
    {
      readable: true,
      store: "Pick n Save 123 Main St (414) 555-0100",
      date: "2026-02-30",
      lines: [
        { text: "MILK 4111.1111.1111.1111", name: "Milk", quantity: null, unit: null, priceCents: 389, isFood: true },
        { text: "4111/1111/1111/1111", name: "4111/1111/1111/1111", quantity: null, unit: null, priceCents: null, isFood: true },
        { text: "x", name: "Eggs john@example.com 414.555.0100", quantity: null, unit: null, priceCents: 299, isFood: true },
        { text: "x", name: "Bread \u202Egnp.exe", quantity: null, unit: null, priceCents: 199, isFood: true },
      ],
    },
    "2026-11-02",
  );
  const all = JSON.stringify(d);
  for (const bad of ["4111", "john@", "555", "Main St", "\u202E"]) assert.ok(!all.includes(bad), bad);
  assert.deepEqual(d.lines.map((l) => l.name), ["Milk", "Eggs", "Bread gnp.exe"]);
  assert.equal(d.store, "Pick n Save");
  assert.equal(d.date, null);
});
