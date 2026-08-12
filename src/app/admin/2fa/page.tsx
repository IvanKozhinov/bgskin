import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-guard";
import TwoFactorSetup from "@/components/admin/TwoFactorSetup";

export const metadata: Metadata = {
  title: "2FA — Админка BGASkins",
  robots: { index: false, follow: false },
};

export default async function TwoFactorPage() {
  await requireAdminPage();
  return <TwoFactorSetup />;
}
