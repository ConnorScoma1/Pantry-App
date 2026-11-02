import type { Metadata } from "next";
import { Suspense } from "react";
import { RecipesView } from "./recipes-view";

export const metadata: Metadata = { title: "Recipes" };

export default function RecipesPage() {
  return (
    <Suspense>
      <RecipesView />
    </Suspense>
  );
}
