import type { Metadata } from "next";
import { SpecialsView } from "./specials-view";

export const metadata: Metadata = { title: "Specials" };

export default function SpecialsPage() {
  return <SpecialsView />;
}
