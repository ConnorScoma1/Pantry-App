import type { Metadata } from "next";
import { HouseholdView } from "./household-view";

export const metadata: Metadata = { title: "Household" };

export default function HouseholdPage() {
  return <HouseholdView />;
}
