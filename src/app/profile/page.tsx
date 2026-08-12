// /profile — server component: reads the session and either shows the
// sign-in prompt or hands off to the client profile UI.

import type { Metadata } from "next";
import { getSessionUser } from "@/lib/session";
import ProfileClient from "@/components/profile/ProfileClient";

export const metadata: Metadata = {
  title: "Профиль — BGASkins.cc",
  description: "Баланс, трейд-ссылка и история покупок.",
};

export default async function ProfilePage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-24 sm:px-6">
        <div className="panel w-full max-w-md p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 text-accent">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5" />
            </svg>
          </div>
          <h1 className="mt-5 font-display text-2xl font-bold">Профиль</h1>
          <p className="mt-2 text-ink-dim">Войдите через Steam, чтобы увидеть профиль</p>
          <a href="/api/auth/steam" className="btn-primary mt-6">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2a10 10 0 0 0-9.97 9.24l5.35 2.21a2.83 2.83 0 0 1 1.6-.5h.14l2.38-3.45v-.05a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.4 2.43v.12a2.83 2.83 0 1 1-5.66 0v-.09l-3.83-1.58A10 10 0 1 0 12 2Zm-5.7 13.5 1.23.51a2.12 2.12 0 1 0 1.1-2.94l1.27.52a1.56 1.56 0 1 1-3.6 1.91Zm9-4.04a2.51 2.51 0 1 1 0-5.02 2.51 2.51 0 0 1 0 5.02Zm0-.63a1.89 1.89 0 1 0 0-3.77 1.89 1.89 0 0 0 0 3.77Z" />
            </svg>
            Войти через Steam
          </a>
        </div>
      </div>
    );
  }

  return <ProfileClient user={user} />;
}
