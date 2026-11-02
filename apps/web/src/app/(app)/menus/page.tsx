import type { Metadata } from "next";
import { Suspense } from "react";
import { MenusView } from "./menus-view";

export const metadata: Metadata = { title: "Menus" };

export default function MenusPage() {
  return (
    <Suspense>
      <MenusView />
    </Suspense>
  );
}
