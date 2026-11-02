import type { Metadata } from "next";
import { HistoryView } from "./history-view";

export const metadata: Metadata = { title: "Cooking history" };

export default function HistoryPage() {
  return <HistoryView />;
}
