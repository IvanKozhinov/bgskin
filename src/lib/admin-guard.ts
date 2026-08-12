// Page-level admin guard. Kept apart from route handlers because it imports
// next/navigation's redirect(), which must not be pulled into API routes.

import { redirect } from "next/navigation";
import { isAdminAuthed } from "@/lib/admin";

/** Redirects to /admin/login unless the caller is a fully-authenticated admin. */
export async function requireAdminPage(): Promise<void> {
  if (!(await isAdminAuthed())) {
    redirect("/admin/login");
  }
}
