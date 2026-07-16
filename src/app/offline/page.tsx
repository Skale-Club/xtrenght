import type { Metadata } from "next";
import Link from "next/link";

import { ButtonLink } from "@/shared/ui/button";

export const metadata: Metadata = { title: "You're offline" };

// Deliberately static and auth-free: the service worker caches this route at
// install time and serves it verbatim when a navigation fetch fails, so it
// must not depend on Supabase or any other request-time data.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <Link href="/" className="text-lg font-black tracking-tight">
        X<span className="text-accent">trenght</span>
      </Link>

      <h1 className="mt-8 text-3xl font-black tracking-tight sm:text-4xl">You&rsquo;re offline</h1>

      <p className="mt-4 max-w-md text-muted">
        No connection right now. Anything already loaded still works -- reconnect to keep logging
        sets.
      </p>

      <ButtonLink href="/" className="mt-8">
        Try again
      </ButtonLink>
    </main>
  );
}
