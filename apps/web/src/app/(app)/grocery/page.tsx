import type { Metadata } from "next";
import { GroceryView } from "./grocery-view";

export const metadata: Metadata = { title: "Grocery List" };

export default function GroceryPage() {
  return <GroceryView />;
}
