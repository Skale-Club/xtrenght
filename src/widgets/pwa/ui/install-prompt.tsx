"use client";

import { useState, useSyncExternalStore } from "react";

import { Button } from "@/shared/ui/button";

const DISMISSED_KEY = "xtrenght-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// A module-level external store for the `beforeinstallprompt` event: the
// browser can fire it before this component ever mounts, and only one copy
// of it exists per page, so React state (which resets per-mount) is the
// wrong home for it -- useSyncExternalStore is.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notifyListeners();
  });
}

function subscribeToInstallPrompt(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function getInstallPromptSnapshot() {
  return deferredPrompt;
}

function getServerInstallPromptSnapshot() {
  return null;
}

function noopSubscribe() {
  return () => {};
}

function getIsIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

function getIsStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function getWasDismissed() {
  return localStorage.getItem(DISMISSED_KEY) === "1";
}

function getServerFalse() {
  return false;
}

// Chrome/Edge/Android fire `beforeinstallprompt` and let us drive a custom
// button; Safari on iOS never fires it, so those users get static
// "Add to Home Screen" instructions instead. Either way the banner backs off
// once the app is already running standalone or the user has dismissed it.
export function InstallPrompt() {
  const prompt = useSyncExternalStore(
    subscribeToInstallPrompt,
    getInstallPromptSnapshot,
    getServerInstallPromptSnapshot,
  );
  const isIOS = useSyncExternalStore(noopSubscribe, getIsIOS, getServerFalse);
  const isStandalone = useSyncExternalStore(noopSubscribe, getIsStandalone, getServerFalse);
  const persistedDismissed = useSyncExternalStore(noopSubscribe, getWasDismissed, getServerFalse);
  const [sessionDismissed, setSessionDismissed] = useState(false);

  const dismissed = persistedDismissed || sessionDismissed;
  const visible = !dismissed && !isStandalone && (isIOS || prompt !== null);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setSessionDismissed(true);
  }

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    deferredPrompt = null;
    notifyListeners();
    setSessionDismissed(true);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center justify-between gap-4 rounded-xl border border-border bg-surface-raised p-4 shadow-lg sm:inset-x-auto sm:right-4">
      <div>
        <p className="text-sm font-semibold">Install Xtrenght</p>
        <p className="mt-1 text-xs text-muted">
          {isIOS
            ? 'Tap the share icon, then "Add to Home Screen".'
            : "Add it to your home screen for quick, full-screen access."}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {!isIOS ? (
          <Button variant="primary" className="px-3 py-1.5 text-xs" onClick={install}>
            Install
          </Button>
        ) : null}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-muted hover:text-foreground"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
