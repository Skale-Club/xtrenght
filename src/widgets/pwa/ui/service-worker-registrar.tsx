"use client";

import { useEffect } from "react";

// Registered only in production: the dev server's unhashed _next/static
// assets would get cache-first served stale after every edit otherwise.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Installability is a nice-to-have, not a hard requirement.
    });
  }, []);

  return null;
}
