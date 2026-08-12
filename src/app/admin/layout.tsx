import type { Metadata } from "next";
import type { ReactNode } from "react";
import { isAdminAuthed } from "@/lib/admin";
import AdminShell from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: "BGASkins — Админка",
  robots: { index: false, follow: false },
};

// No guard here on purpose: /admin/login must render without a session. Each
// protected page guards itself via requireAdminPage(). When authenticated we
// wrap in the admin chrome; otherwise (login) children render bare.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const authed = await isAdminAuthed();
  if (!authed) return <>{children}</>;
  return <AdminShell>{children}</AdminShell>;
}
