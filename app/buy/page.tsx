import type { Metadata } from "next";
import { BuyRoot } from "@/components/buy/BuyRoot";

export const metadata: Metadata = { title: "App" };

export default function BuyPage() {
  return (
    <div className="app-wash min-h-screen px-4 py-6">
      <BuyRoot />
    </div>
  );
}
