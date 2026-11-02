import type { Metadata } from "next";
import { Suspense } from "react";
import { UseItUpView } from "./use-it-up-view";

export const metadata: Metadata = { title: "Use it before you lose it" };

export default function UseItUpPage() {
  return (
    <Suspense>
      <UseItUpView />
    </Suspense>
  );
}
