import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-guard";
import IntegrationsForm from "@/components/admin/IntegrationsForm";

export const metadata: Metadata = {
  title: "Интеграции — Админка BGASkins",
  robots: { index: false, follow: false },
};

export default async function IntegrationsPage() {
  await requireAdminPage();
  return <IntegrationsForm />;
}
