import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-guard";
import PricingForm from "@/components/admin/PricingForm";

export const metadata: Metadata = {
  title: "Цены — Админка BGASkins",
  robots: { index: false, follow: false },
};

export default async function PricingPage() {
  await requireAdminPage();
  return <PricingForm />;
}
