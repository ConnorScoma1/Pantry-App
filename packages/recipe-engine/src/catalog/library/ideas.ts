import type { LibraryRecipeInput } from "../../library/import";

/**
 * Dish ideas for the menu builder and "Explore" (spec 08 §7: "menu ideas
 * without complete instructions"). Each is just a well-known dish name, its
 * cuisine, course and rough difficulty — no ingredients or steps, so the app
 * labels them as ideas and never offers to cook them. They're the backlog
 * for full recipes (licensed, commissioned or AI-drafted and reviewed).
 *
 * Format: cuisine | course | skill | title | region (optional) | categories (optional, comma-separated)
 */
const RAW = `
`;

const COURSE: Record<string, LibraryRecipeInput["course"]> = { main: "main", side: "side", starter: "starter", sauce: "sauce", breakfast: "breakfast", dessert: "dessert", soup: "main", raw_bar: "starter" };

export const dishIdeas: LibraryRecipeInput[] = RAW.trim()
  .split("\n")
  .filter((line) => line.includes("|"))
  .map((line) => {
    const [cuisine, course, skill, title, region, categories] = line.split("|");
    return {
      externalId: `idea:${cuisine}:${title}`,
      title: title!,
      cuisine: cuisine!,
      course: COURSE[course!] ?? "main",
      dessertCategory: course === "dessert" ? "plated" : null,
      skillLevel: Number(skill),
      region: region || null,
      categories: [...(categories ? categories.split(",") : []), ...(course === "soup" ? ["soup"] : [])].filter(Boolean),
      status: "idea" as const,
    };
  });
