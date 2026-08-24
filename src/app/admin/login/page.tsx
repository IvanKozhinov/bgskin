import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdminAuthed } from "@/lib/admin";
import AdminLogin from "@/components/admin/AdminLogin";

export const metadata: Metadata = {
  title: "Вход — Админка BGSkins",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  // Already signed in? Skip the form.
  if (await isAdminAuthed()) redirect("/admin");
  return <AdminLogin />;
}
