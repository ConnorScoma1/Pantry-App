import type { Metadata } from "next";
import { KitchenView } from "./kitchen-view";

export const metadata: Metadata = { title: "My Kitchen" };

export default function KitchenPage() {
  return <KitchenView />;
}
