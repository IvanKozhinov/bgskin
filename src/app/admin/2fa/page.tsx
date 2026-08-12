import type { Metadata } from "next";
import { requireAdminSessionPage } from "@/lib/admin-guard";
import TwoFactorSetup from "@/components/admin/TwoFactorSetup";

export const metadata: Metadata = {
  title: "2FA — Админка BGASkins",
  robots: { index: false, follow: false },
};

export default async function TwoFactorPage() {
  // A valid session is enough (an admin forced to enrol must be able to reach
  // this page even before 2FA is satisfied).
  await requireAdminSessionPage();
  return <TwoFactorSetup />;
}
