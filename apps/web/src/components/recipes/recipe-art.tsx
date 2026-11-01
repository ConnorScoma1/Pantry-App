import type { Recipe } from "@kitchen-pantry/shared-types";
import { Beef, CookingPot, Drumstick, Fish, Salad, Soup, Wheat } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Typographic recipe tile used until licensed food photography exists.
 * We never show stock or AI-generated "photos" of a dish.
 */
const HUES: Record<string, number> = {
  american: 18,
  italian: 8,
  mexican: 32,
  chinese: 0,
  japanese: 350,
  korean: 340,
  thai: 140,
  vietnamese: 150,
  indian: 38,
  mediterranean: 195,
  middle_eastern: 28,
  french: 265,
  spanish: 12,
  southern: 24,
  caribbean: 170,
};

function iconFor(recipe: Recipe) {
  const text = recipe.ingredients.map((i) => i.item).join(" ").toLowerCase();
  if (/salmon|scallop|shrimp|fish|cod/.test(text)) return Fish;
  if (/chicken|turkey/.test(text)) return Drumstick;
  if (/beef|short rib|steak|pork/.test(text)) return Beef;
  if (/risotto|rice|chili|broth/.test(text) && !/tortilla/.test(text)) return recipe.title.toLowerCase().includes("chili") ? Soup : CookingPot;
  if (/penne|pasta|noodle|spaghetti|tortilla/.test(text)) return Wheat;
  return Salad;
}

export function RecipeArt({ recipe, className, size = "md" }: { recipe: Recipe; className?: string; size?: "md" | "lg" }) {
  if (recipe.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- licensed images may come from any partner CDN
    return <img src={recipe.imageUrl} alt="" loading="lazy" className={cn("object-cover", className)} />;
  }
  const Icon = iconFor(recipe);
  const hue = HUES[recipe.cuisine ?? ""] ?? 140;
  return (
    <div
      aria-hidden
      className={cn("recipe-art relative grid place-items-center overflow-hidden", className)}
      style={{ ["--h" as string]: hue }}
    >
      <div className="recipe-art-ring absolute size-[70%] rounded-full" />
      <Icon className={size === "lg" ? "relative size-16" : "relative size-9"} strokeWidth={1.5} />
    </div>
  );
}
