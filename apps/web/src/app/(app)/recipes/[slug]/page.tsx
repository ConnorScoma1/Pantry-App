import type { Metadata } from "next";
import { RecipeDetailView } from "./recipe-detail-view";

export const metadata: Metadata = { title: "Recipe" };

export default async function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <RecipeDetailView slug={slug} />;
}
