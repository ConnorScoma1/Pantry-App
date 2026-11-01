import type { Metadata } from "next";
import { RecipesView } from "./recipes-view";

export const metadata: Metadata = { title: "Recipes" };

export default function RecipesPage() {
  return <RecipesView />;
}
