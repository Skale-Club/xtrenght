"use client";

import { useState, useSyncExternalStore } from "react";

import { Button } from "@/shared/ui/button";

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

function getServerFalse() {
  return false;
}

/**
 * The install control, now living in Settings rather than as a floating banner
 * over every page. A prompt to install belongs somewhere you go looking for it,
 * not in your face while you're mid-set.
 *
 * Chrome/Edge/Android fire `beforeinstallprompt` and let us drive a real button;
 * Safari on iOS never fires it, so those users get the "Add to Home Screen"
 * instructions. Once the app is already running standalone there is nothing to
 * install, so it says so.
 */
export function InstallButton() {
  const prompt = useSyncExternalStore(
    subscribeToInstallPrompt,
    getInstallPromptSnapshot,
    getServerInstallPromptSnapshot,
  );
  const isIOS = useSyncExternalStore(noopSubscribe, getIsIOS, getServerFalse);
  const isStandalone = useSyncExternalStore(noopSubscribe, getIsStandalone, getServerFalse);
  const [installed, setInstalled] = useState(false);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    deferredPrompt = null;
    notifyListeners();
    if (choice.outcome === "accepted") setInstalled(true);
  }

  if (isStandalone || installed) {
    return <p className="text-sm text-muted">Xtrenght is installed on this device.</p>;
  }

  if (isIOS) {
    return (
      <p className="text-sm text-muted">
        In Safari, tap the share icon, then <span className="text-foreground">Add to Home Screen</span>.
      </p>
    );
  }

  if (prompt) {
    return (
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={install}>
          Install app
        </Button>
        <span className="text-xs text-muted">Full-screen, on your home screen.</span>
      </div>
    );
  }

  // Eligible browsers fire the event; if it hasn't, the app is either already
  // installed or the browser installs via its own menu.
  return (
    <p className="text-sm text-muted">
      Use your browser&apos;s menu to install Xtrenght — look for “Install app” or “Add to Home Screen”.
    </p>
  );
}
