import { recipeArt, type RecipeArtKind } from "@kitchen-pantry/recipe-engine";
import type { Recipe } from "@kitchen-pantry/shared-types";
import { Beef, CookingPot, Drumstick, Fish, Salad, Soup, Wheat, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

const ICONS: Record<RecipeArtKind, LucideIcon> = {
  fish: Fish,
  poultry: Drumstick,
  meat: Beef,
  soup: Soup,
  pot: CookingPot,
  grain: Wheat,
  veg: Salad,
};

/**
 * Typographic recipe tile used until licensed food photography exists.
 * We never show stock or AI-generated "photos" of a dish. Colours come from
 * the shared recipe-engine so web and mobile match.
 */
export function RecipeArt({ recipe, className, size = "md" }: { recipe: Recipe; className?: string; size?: "md" | "lg" }) {
  if (recipe.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- licensed images may come from any partner CDN
    return <img src={recipe.imageUrl} alt="" loading="lazy" className={cn("object-cover", className)} />;
  }
  const { hue, kind } = recipeArt(recipe);
  const Icon = ICONS[kind];
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
