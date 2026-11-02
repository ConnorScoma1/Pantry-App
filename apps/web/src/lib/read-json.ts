import { NextResponse } from "next/server";

/**
 * Read a JSON request body with a hard size cap. The cap is enforced while
 * streaming, so a request without a Content-Length header (chunked) can't
 * make the server buffer an unbounded body.
 */
export async function readJson(request: Request, maxBytes: number): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const tooLarge = () => ({ ok: false as const, response: NextResponse.json({ ok: false, message: "Request too large." }, { status: 413 }) });
  const invalid = () => ({ ok: false as const, response: NextResponse.json({ ok: false, message: "Invalid JSON." }, { status: 400 }) });
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return tooLarge();
  if (!request.body) return invalid();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return invalid();
  }
}
