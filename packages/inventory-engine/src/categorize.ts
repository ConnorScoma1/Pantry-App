import type { PantryCategory, StorageLocation } from "@kitchen-pantry/shared-types";

/**
 * Best-guess category and storage for a free-typed item name, so "baby
 * spinach" lands in Produce/Fridge without the user opening "More details".
 * Rules are ordered: multi-word and more specific phrases come first.
 * Only a suggestion — the user can always change it.
 */
const RULES: Array<[PantryCategory, StorageLocation, string[]]> = [
  ["frozen", "freezer", ["frozen", "ice cream"]],
  ["condiment", "pantry", ["peanut butter", "almond butter", "nut butter", "maple syrup"]],
  ["spice", "pantry", ["black pepper", "peppercorn", "chili powder", "red pepper flakes", "garlic powder", "onion powder", "seasoning", "spice", "salt", "cumin", "paprika", "cinnamon", "oregano", "thyme", "turmeric", "nutmeg", "bay leaves", "curry powder"]],
  ["canned", "pantry", ["canned", "tinned", "broth", "stock", "soup", "tomato paste", "coconut milk", "chickpeas", "black beans", "kidney beans"]],
  ["sauce", "pantry", ["sauce", "salsa", "marinara", "pesto", "sriracha", "dressing"]],
  ["condiment", "fridge", ["ketchup", "mustard", "mayo", "relish", "pickle"]],
  ["condiment", "pantry", ["vinegar", "honey", "syrup", "jam", "jelly"]],
  ["oil", "pantry", ["oil", "cooking spray"]],
  ["baking", "pantry", ["flour", "sugar", "baking", "yeast", "vanilla", "cocoa", "chocolate chips", "cornstarch"]],
  ["pasta", "pantry", ["pasta", "spaghetti", "penne", "linguine", "fettuccine", "macaroni", "noodle", "lasagna", "orzo", "ramen"]],
  ["rice", "pantry", ["rice"]],
  ["grain", "pantry", ["bread", "oats", "oatmeal", "quinoa", "tortilla", "couscous", "barley", "cereal", "bagel", "pita", "bun"]],
  ["protein", "fridge", ["chicken", "beef", "steak", "pork", "turkey", "lamb", "sausage", "bacon", "ham", "ground", "salmon", "tuna", "cod", "tilapia", "shrimp", "fish", "tofu", "tempeh", "duck", "veal"]],
  ["dairy", "fridge", ["milk", "cream", "cheese", "yogurt", "yoghurt", "butter", "egg", "sour cream", "parmesan", "mozzarella", "cheddar", "feta"]],
  ["produce", "fridge", ["spinach", "lettuce", "kale", "arugula", "broccoli", "cauliflower", "carrot", "celery", "cucumber", "zucchini", "mushroom", "pepper", "asparagus", "green bean", "cabbage", "berries", "berry", "grape", "cilantro", "parsley", "basil", "mint", "scallion", "green onion", "lime", "lemon", "herb"]],
  ["produce", "counter", ["onion", "garlic", "potato", "sweet potato", "tomato", "avocado", "banana", "apple", "orange", "squash", "ginger", "shallot"]],
];

export interface CategoryGuess {
  category: PantryCategory;
  storageLocation: StorageLocation;
}

export function guessCategory(name: string): CategoryGuess | null {
  const text = ` ${name.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim()} `;
  if (text.trim().length < 3) return null;
  for (const [category, storageLocation, terms] of RULES) {
    if (terms.some((t) => new RegExp(`\\s${t}(e?s)?\\s`).test(text))) return { category, storageLocation };
  }
  return null;
}
