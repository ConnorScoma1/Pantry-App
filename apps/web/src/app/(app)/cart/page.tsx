import type { Metadata } from "next";
import { Suspense } from "react";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Build my cart" };

export default function CartPage() {
  return (
    <Suspense>
      <CartView />
    </Suspense>
  );
}
