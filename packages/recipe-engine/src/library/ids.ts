/**
 * Stable identifiers for imported recipes: the same source record always
 * gets the same id and slug, so re-running an import updates rather than
 * duplicates. Pure JS (no node:crypto) so it also runs in the browser.
 */

/** Two independent 64-bit FNV-1a hashes → 128 bits, formatted as a v4-shaped UUID. */
export function stableUuid(text: string): string {
  const hash = (seed: bigint): bigint => {
    let h = seed;
    for (const byte of new TextEncoder().encode(text)) {
      h ^= BigInt(byte);
      h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    return h;
  };
  const hex = (hash(0xcbf29ce484222325n).toString(16).padStart(16, "0") + hash(0x84222325cbf29ce4n).toString(16).padStart(16, "0")).split("");
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Lower-case ASCII words joined by hyphens; accents are folded ("Crème brûlée" → "creme-brulee"). */
export function slugify(text: string, max = 80): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}
