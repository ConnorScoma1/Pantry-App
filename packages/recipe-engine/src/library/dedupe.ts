import type { Recipe } from "@kitchen-pantry/shared-types";
import { facetsOf, libraryOf } from "./facets";
import { slugify } from "./ids";

/**
 * Duplicate and near-duplicate detection (spec 08 §5, §10).
 *
 * Two recipes are the same dish when their names say the same thing once
 * filler words are removed AND they share most core ingredients — even if a
 * source renamed one ("Grandma's Sunday Pot Roast" vs "Classic Pot Roast").
 * Versions of one dish (classic / simplified / budget / elevated) are
 * allowed: they share a dish key but differ in `variant`.
 *
 * An inverted index on title words and core ingredients keeps this fast
 * enough for 50,000 recipes (only recipes sharing something are compared).
 */

const TITLE_NOISE = new Set(
  "the a an and with of in on for my our your best easy quick simple classic perfect ultimate homemade authentic traditional style recipe grandma grandmas mom moms sunday weeknight famous favorite favourite".split(" "),
);

export function titleTokens(title: string): string[] {
  return slugify(title)
    .split("-")
    .filter((w) => w && !TITLE_NOISE.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** Overlap of two sets; two empty sets (e.g. dish ideas with no ingredients yet) tell us nothing, so 0. */
function jaccard<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let both = 0;
  for (const x of a) if (b.has(x)) both += 1;
  return both / (a.size + b.size - both);
}

export interface Similarity {
  title: number;
  ingredients: number;
  score: number;
}

export function similarity(a: Recipe, b: Recipe): Similarity {
  const title = jaccard(new Set(titleTokens(a.title)), new Set(titleTokens(b.title)));
  const ingredients = jaccard(new Set(facetsOf(a).core), new Set(facetsOf(b).core));
  return { title, ingredients, score: 0.45 * title + 0.55 * ingredients };
}

export type DuplicateKind =
  /** Same source record or same slug: an update, not a new recipe. */
  | "same_record"
  /** Same dish and same version, near-identical ingredients: reject. */
  | "near_duplicate"
  /** Different names but almost the same recipe: reject (or merge by hand). */
  | "renamed_duplicate"
  /** Another version of the same dish: allowed, linked as a version. */
  | "version";

export interface DuplicateMatch {
  kind: DuplicateKind;
  existing: Recipe;
  similarity: Similarity;
}

export interface DuplicateIndex {
  add(recipe: Recipe): void;
  /** Matches for a candidate, most serious first (only "version" matches are acceptable). */
  check(candidate: Recipe): DuplicateMatch[];
  size(): number;
}

export function createDuplicateIndex(initial: readonly Recipe[] = []): DuplicateIndex {
  const byId = new Map<string, Recipe>();
  const bySlug = new Map<string, Recipe>();
  const byToken = new Map<string, Set<string>>();
  const put = (key: string, id: string) => {
    let set = byToken.get(key);
    if (!set) byToken.set(key, (set = new Set()));
    set.add(id);
  };
  const keys = (r: Recipe) => [
    ...titleTokens(r.title).map((t) => `t:${t}`),
    ...facetsOf(r).core.map((c) => `i:${c}`),
    `d:${libraryOf(r).dishKey}`,
  ];
  const index = {
    add(r: Recipe) {
      byId.set(r.id, r);
      bySlug.set(r.slug, r);
      for (const k of keys(r)) put(k, r.id);
    },
    check(c: Recipe): DuplicateMatch[] {
      const out: DuplicateMatch[] = [];
      const same = byId.get(c.id) ?? bySlug.get(c.slug);
      if (same) out.push({ kind: "same_record", existing: same, similarity: similarity(c, same) });
      // Candidates: share the dish key, or at least two title words / core ingredients.
      const counts = new Map<string, number>();
      for (const k of keys(c)) {
        for (const id of byToken.get(k) ?? []) counts.set(id, (counts.get(id) ?? 0) + (k.startsWith("d:") ? 3 : 1));
      }
      const lib = libraryOf(c);
      for (const [id, n] of counts) {
        if (n < 2 || id === same?.id) continue;
        const e = byId.get(id)!;
        const s = similarity(c, e);
        const elib = libraryOf(e);
        if (elib.dishKey === lib.dishKey) {
          if (elib.variant === lib.variant && s.ingredients >= 0.6) out.push({ kind: "near_duplicate", existing: e, similarity: s });
          else out.push({ kind: "version", existing: e, similarity: s });
        } else if ((s.score >= 0.75 && s.ingredients >= 0.7) || (s.ingredients >= 0.9 && facetsOf(c).core.length >= 5)) {
          out.push({ kind: "renamed_duplicate", existing: e, similarity: s });
        }
      }
      const order: Record<DuplicateKind, number> = { same_record: 0, near_duplicate: 1, renamed_duplicate: 2, version: 3 };
      return out.sort((a, b) => order[a.kind] - order[b.kind] || b.similarity.score - a.similarity.score);
    },
    size: () => byId.size,
  };
  for (const r of initial) index.add(r);
  return index;
}

/**
 * Keep one recipe per dish in a results list (spec 08 §5: no near-identical
 * repeats). The first — best-ranked — version stays; the others are counted
 * so the card can say "+2 versions".
 */
export function collapseVersions<T>(items: readonly T[], recipeOf: (item: T) => Recipe): Array<{ item: T; otherVersions: Recipe[] }> {
  const seen = new Map<string, { item: T; otherVersions: Recipe[] }>();
  const out: Array<{ item: T; otherVersions: Recipe[] }> = [];
  for (const item of items) {
    const r = recipeOf(item);
    const key = `${r.cuisine ?? ""}:${libraryOf(r).dishKey}`;
    const first = seen.get(key);
    if (first) first.otherVersions.push(r);
    else {
      const entry = { item, otherVersions: [] as Recipe[] };
      seen.set(key, entry);
      out.push(entry);
    }
  }
  return out;
}
