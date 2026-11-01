import type { AllergenCode } from "@kitchen-pantry/shared-types";

/**
 * Allergen screening by ingredient text. Matching is deliberately broad —
 * a false positive costs a recipe suggestion, a false negative can hurt
 * someone. This screen can only ever say "conflict found" or "no conflict
 * found in the listed ingredients"; it never certifies a dish allergen-free,
 * because packaged products and kitchens carry cross-contact risk.
 */

interface AllergenRule {
  /** Terms matched on word boundaries (plurals handled automatically). */
  terms: string[];
  /** Phrases removed before matching (e.g. "coconut milk" is not dairy). */
  exceptions?: string[];
}

const WHEAT_TERMS = [
  "wheat",
  "flour",
  "all-purpose flour",
  "bread",
  "breadcrumb",
  "panko",
  "pasta",
  "spaghetti",
  "linguine",
  "fettuccine",
  "penne",
  "macaroni",
  "lasagna",
  "noodle",
  "couscous",
  "semolina",
  "bulgur",
  "farro",
  "spelt",
  "durum",
  "seitan",
  "tortilla",
  "pita",
  "naan",
  "cracker",
  "croissant",
  "bun",
  "roll",
  "pie crust",
  "puff pastry",
  "soy sauce",
  "shoyu",
  "teriyaki",
  "hoisin",
];

const NON_WHEAT_FLOURS = [
  "almond flour",
  "coconut flour",
  "rice flour",
  "corn flour",
  "chickpea flour",
  "buckwheat flour",
  "oat flour",
  "tapioca flour",
  "cassava flour",
  "corn tortilla",
  "rice noodle",
  "rice noodles",
  "glass noodle",
  "glass noodles",
  "gluten-free",
  "tamari",
];

export const ALLERGEN_RULES: Record<AllergenCode, AllergenRule> = {
  milk: {
    terms: [
      "milk",
      "butter",
      "buttermilk",
      "cream",
      "cheese",
      "parmesan",
      "parmigiano",
      "mozzarella",
      "ricotta",
      "cheddar",
      "feta",
      "yogurt",
      "yoghurt",
      "whey",
      "casein",
      "caseinate",
      "ghee",
      "lactose",
      "half-and-half",
      "custard",
      "kefir",
      "crème fraîche",
      "creme fraiche",
      "mascarpone",
      "paneer",
    ],
    exceptions: [
      "coconut milk",
      "coconut cream",
      "almond milk",
      "oat milk",
      "soy milk",
      "rice milk",
      "cashew milk",
      "cream of tartar",
      "peanut butter",
      "almond butter",
      "cashew butter",
      "nut butter",
      "sunflower butter",
      "apple butter",
      "cocoa butter",
      "dairy-free",
      "vegan butter",
      "vegan cheese",
    ],
  },
  egg: {
    terms: ["egg", "egg white", "egg yolk", "mayonnaise", "mayo", "aioli", "meringue", "albumin", "brioche"],
    exceptions: ["eggplant", "egg-free", "vegan mayo"],
  },
  peanut: {
    terms: ["peanut", "groundnut", "arachis", "satay"],
  },
  tree_nut: {
    terms: [
      "almond",
      "walnut",
      "pecan",
      "cashew",
      "pistachio",
      "hazelnut",
      "filbert",
      "macadamia",
      "brazil nut",
      "pine nut",
      "pignoli",
      "praline",
      "marzipan",
      "frangipane",
      "nougat",
      "gianduja",
      "pesto",
    ],
  },
  soy: {
    terms: ["soy", "soya", "soybean", "tofu", "tempeh", "edamame", "miso", "tamari", "shoyu", "natto", "soy sauce", "teriyaki", "hoisin"],
  },
  wheat: {
    terms: WHEAT_TERMS,
    exceptions: NON_WHEAT_FLOURS,
  },
  gluten: {
    terms: [...WHEAT_TERMS, "barley", "rye", "malt", "triticale", "beer", "ale", "lager", "brewer's yeast"],
    exceptions: NON_WHEAT_FLOURS,
  },
  fish: {
    terms: [
      "fish",
      "salmon",
      "tuna",
      "cod",
      "tilapia",
      "halibut",
      "trout",
      "mackerel",
      "sardine",
      "anchovy",
      "anchovies",
      "bass",
      "snapper",
      "haddock",
      "pollock",
      "catfish",
      "swordfish",
      "mahi",
      "fish sauce",
      "worcestershire",
      "caesar dressing",
      "bonito",
      "dashi",
    ],
  },
  shellfish: {
    terms: [
      "shrimp",
      "prawn",
      "crab",
      "lobster",
      "crawfish",
      "crayfish",
      "langoustine",
      "scallop",
      "clam",
      "mussel",
      "oyster",
      "squid",
      "calamari",
      "octopus",
      "oyster sauce",
      "shellfish",
    ],
  },
  sesame: {
    terms: ["sesame", "tahini", "benne", "gomasio", "halva", "hummus", "za'atar", "zaatar", "furikake"],
  },
};

/**
 * Ingredients commonly made in facilities or ways that carry cross-contact
 * risk even when the ingredient itself isn't the allergen.
 */
const CROSS_CONTACT: Array<{ term: string; allergens: AllergenCode[]; note: string }> = [
  { term: "oats", allergens: ["gluten"], note: "Oats are often processed with wheat — use certified gluten-free oats." },
  { term: "oat", allergens: ["gluten"], note: "Oats are often processed with wheat — use certified gluten-free oats." },
  { term: "chocolate", allergens: ["milk", "peanut", "tree_nut", "soy"], note: "Chocolate often contains or shares lines with milk, nuts and soy." },
  { term: "granola", allergens: ["tree_nut", "peanut", "gluten"], note: "Granola frequently contains nuts and gluten." },
  { term: "curry paste", allergens: ["shellfish", "fish", "peanut"], note: "Many curry pastes contain shrimp paste, fish or peanuts." },
  { term: "spice blend", allergens: ["wheat", "sesame", "peanut"], note: "Spice blends can contain wheat, sesame or nut fillers." },
  { term: "seasoning", allergens: ["wheat", "milk", "soy"], note: "Seasoning mixes can contain wheat, dairy or soy." },
  { term: "broth", allergens: ["wheat", "soy", "milk"], note: "Boxed broths may contain wheat, soy or dairy." },
  { term: "stock", allergens: ["wheat", "soy", "milk"], note: "Boxed stocks may contain wheat, soy or dairy." },
  { term: "sausage", allergens: ["wheat", "milk", "soy"], note: "Sausages can contain wheat fillers, dairy or soy." },
  { term: "fried", allergens: ["wheat", "shellfish", "fish"], note: "Shared fryer oil is a common cross-contact source." },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termPattern(term: string): RegExp {
  // Word-boundary match with optional plural ("egg" -> "eggs", "anchovy" handled explicitly).
  return new RegExp(`(^|[^a-z])${escapeRegExp(term)}(e?s)?(?=$|[^a-z])`, "i");
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function stripExceptions(text: string, exceptions: string[] = []): string {
  let out = text;
  for (const phrase of exceptions) {
    out = out.replace(new RegExp(escapeRegExp(phrase.toLowerCase()), "g"), " ");
  }
  return out;
}

export interface AllergenConflict {
  allergen: AllergenCode;
  ingredient: string;
  matchedTerm: string;
}

export interface CrossContactWarning {
  allergen: AllergenCode;
  ingredient: string;
  note: string;
}

export interface AllergenScreenResult {
  conflicts: AllergenConflict[];
  warnings: CrossContactWarning[];
  /** Always false: text screening cannot verify preparation conditions. */
  certifiedAllergenFree: false;
}

/** Screen recipe ingredient lines against a household's allergies. */
export function screenAllergens(
  ingredientLines: string[],
  allergies: readonly AllergenCode[],
): AllergenScreenResult {
  const conflicts: AllergenConflict[] = [];
  const warnings: CrossContactWarning[] = [];

  for (const line of ingredientLines) {
    const text = normalizeText(line);
    for (const allergen of allergies) {
      const rule = ALLERGEN_RULES[allergen];
      const searchable = stripExceptions(text, rule.exceptions);
      const hit = rule.terms.find((term) => termPattern(term).test(searchable));
      if (hit) {
        conflicts.push({ allergen, ingredient: line, matchedTerm: hit });
        continue;
      }
      for (const cc of CROSS_CONTACT) {
        if (cc.allergens.includes(allergen) && termPattern(cc.term).test(text)) {
          warnings.push({ allergen, ingredient: line, note: cc.note });
          break;
        }
      }
    }
  }

  return { conflicts, warnings, certifiedAllergenFree: false };
}

/** Free-text exclusions ("never recommend olives") use the same matcher. */
export function matchesAnyTerm(ingredientLines: string[], terms: readonly string[]): string[] {
  const hits = new Set<string>();
  for (const line of ingredientLines) {
    const text = normalizeText(line);
    for (const term of terms) {
      const clean = normalizeText(term);
      if (clean && termPattern(clean).test(text)) hits.add(term);
    }
  }
  return [...hits];
}
