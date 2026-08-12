"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Hides storefront chrome on the admin surface. Children (which may be server
 * components, e.g. the Footer) are passed through untouched on the storefront
 * and dropped entirely under /admin.
 */
export default function AdminHidden({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  if (pathname.startsWith("/admin")) return null;
  return <>{children}</>;
}
