import type { Metadata } from "next";
import { Suspense } from "react";
import MarketClient from "@/components/market/MarketClient";

export const metadata: Metadata = {
  title: "Маркет — BGSkins.pro",
  description: "Каталог скинов CS2: винтовки, пистолеты, ножи и перчатки с мгновенной доставкой.",
};

function MarketFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="skeleton h-9 w-44" />
      <div className="mt-2 h-5 w-72 max-w-full">
        <div className="skeleton h-4 w-full" />
      </div>
      <div className="mt-6 flex items-start gap-6">
        <div className="skeleton hidden h-[32rem] w-64 shrink-0 md:block" />
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between">
            <div className="skeleton h-5 w-40" />
            <div className="skeleton h-9 w-44" />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton aspect-[3/4]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MarketPage() {
  return (
    <Suspense fallback={<MarketFallback />}>
      <MarketClient />
    </Suspense>
  );
}
