import type { Metadata } from "next";
import { Suspense } from "react";
import { PlanView } from "./plan-view";

export const metadata: Metadata = { title: "Meal Plan" };

export default function PlanPage() {
  return (
    <Suspense>
      <PlanView />
    </Suspense>
  );
}
