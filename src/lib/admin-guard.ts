// Page-level admin guard. Kept apart from route handlers because it imports
// next/navigation's redirect(), which must not be pulled into API routes.

import { redirect } from "next/navigation";
import { adminNeedsEnrollment, hasAdminSession, isAdminAuthed } from "@/lib/admin";

/**
 * Guard a protected admin page. Redirects to /admin/login unless fully
 * authenticated. When the deployment mandates 2FA and the admin hasn't enrolled
 * yet, redirects to the 2FA setup page instead.
 */
export async function requireAdminPage(): Promise<void> {
  if (await isAdminAuthed()) return;
  if (await adminNeedsEnrollment()) redirect("/admin/2fa");
  redirect("/admin/login");
}

/**
 * Guard for the 2FA setup page itself: a valid session is enough (so an admin
 * forced to enrol can reach it), but a fully-anonymous visitor is bounced.
 */
export async function requireAdminSessionPage(): Promise<void> {
  if (!(await hasAdminSession())) redirect("/admin/login");
}
