"use client";

import { creditHref, imageLibraryName, recipeArt, recipeImageSrc, type RecipeArtKind } from "@kitchen-pantry/recipe-engine";
import type { Recipe } from "@kitchen-pantry/shared-types";
import { Beef, CookingPot, Drumstick, Fish, Salad, Soup, Wheat, type LucideIcon } from "lucide-react";
import { useState } from "react";
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

/** Typographic tile: shown when a recipe has no licensed photo, or the photo fails to load. */
function ArtTile({ recipe, className, size }: { recipe: Recipe; className?: string; size: "md" | "lg" }) {
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

/**
 * Recipe picture. Only credited, openly licensed photos (see
 * recipe-engine/catalog/photos.ts); a photo of a similar dish carries a
 * "Similar dish" label so nobody mistakes it for our exact recipe.
 */
export function RecipeArt({ recipe, className, size = "md" }: { recipe: Recipe; className?: string; size?: "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const image = recipe.image;
  if (!image || failed) return <ArtTile recipe={recipe} className={className} size={size} />;
  return (
    <div className={cn("relative overflow-hidden bg-surface-strong", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- remote CDN images are resized by the CDN itself */}
      <img
        src={recipeImageSrc(image, size === "lg" ? 1400 : 640)}
        alt={image.alt}
        loading={size === "lg" ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="absolute inset-0 size-full object-cover"
      />
      {image.representative ? (
        <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-0.5 text-[12px] font-medium text-white backdrop-blur-sm">
          Similar dish
        </span>
      ) : null}
    </div>
  );
}

/** "Similar dish · Photo by Name on Unsplash", linked as the licence asks. */
export function PhotoCredit({ recipe, className }: { recipe: Recipe; className?: string }) {
  const image = recipe.image;
  if (!image) return null;
  const library = imageLibraryName(image.license);
  const author = creditHref(image.creditUrl, image.license);
  const linkClass = "underline decoration-border underline-offset-2 hover:text-foreground";
  return (
    <p className={cn("text-[13px] text-muted", className)}>
      {image.representative ? "Similar dish, not this exact recipe · " : ""}Photo by{" "}
      {author ? (
        <a href={author} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {image.creditName}
        </a>
      ) : (
        image.creditName
      )}
      {library ? (
        <>
          {" "}
          on{" "}
          <a href={creditHref(image.sourceUrl, image.license) ?? image.sourceUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {library}
          </a>
        </>
      ) : null}
    </p>
  );
}
