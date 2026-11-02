import type { Metadata } from "next";
import { CompareView } from "./compare-view";

export const metadata: Metadata = { title: "Compare stores" };

export default function ComparePage() {
  return <CompareView />;
}
