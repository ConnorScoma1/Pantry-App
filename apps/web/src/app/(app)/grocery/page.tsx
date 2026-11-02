import type { Metadata } from "next";
import { Suspense } from "react";
import { GroceryView } from "./grocery-view";

export const metadata: Metadata = { title: "Grocery List" };

export default function GroceryPage() {
  return (
    <Suspense>
      <GroceryView />
    </Suspense>
  );
}
