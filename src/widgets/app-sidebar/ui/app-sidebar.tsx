"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { signOut } from "@/features/auth/api/auth-actions";

/** One 24-grid icon. Kept inline so the app pulls in no icon dependency. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const icons = {
  dashboard: (
    <Icon>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Icon>
  ),
  coach: (
    <Icon>
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
    </Icon>
  ),
  programs: (
    <Icon>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </Icon>
  ),
  exercises: (
    <Icon>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </Icon>
  ),
  saved: (
    <Icon>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </Icon>
  ),
  admin: (
    <Icon>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Icon>
  ),
  settings: (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Icon>
  ),
  signout: (
    <Icon>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </Icon>
  ),
  menu: (
    <Icon>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </Icon>
  ),
  close: (
    <Icon>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  ),
};

type NavItem = { href: string; label: string; icon: ReactNode };

const PRIMARY: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: icons.dashboard },
  { href: "/coach", label: "Coach", icon: icons.coach },
  { href: "/programs", label: "Programs", icon: icons.programs },
  { href: "/exercises", label: "Exercises", icon: icons.exercises },
  { href: "/favorites", label: "Saved", icon: icons.saved },
];

const ADMIN_ITEM: NavItem = { href: "/admin/programs", label: "Admin", icon: icons.admin };
const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: icons.settings };

function Wordmark({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/" onClick={onClick} className="text-lg font-black tracking-tight">
      X<span className="text-accent">trenght</span>
    </Link>
  );
}

export function AppSidebar({ email, isAdmin }: { email?: string | null; isAdmin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The route captured when the drawer was opened. Once open, any change means a
  // link was followed, so the drawer should dismiss itself.
  const [routeAtOpen, setRouteAtOpen] = useState(pathname);

  // Adjusting state during render (rather than in an effect) is React's own
  // recommendation for "reset state when a value changes" -- it avoids the
  // cascading re-render an effect's setState would trigger.
  if (open && pathname !== routeAtOpen) {
    setOpen(false);
  }

  function openDrawer() {
    setRouteAtOpen(pathname);
    setOpen(true);
  }

  const primary = isAdmin ? [...PRIMARY, ADMIN_ITEM] : PRIMARY;

  // Dashboard is an exact match so it doesn't light up on every nested route.
  // The rest also match their children (e.g. /coach covers /coach/memory).
  function isActive(href: string) {
    if (href === "/dashboard") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function link(item: NavItem, onNavigate?: () => void) {
    const active = isActive(item.href);
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? "bg-surface-raised text-foreground"
            : "text-muted hover:bg-surface-raised/60 hover:text-foreground"
        }`}
      >
        <span className={active ? "text-accent" : "text-muted"}>{item.icon}</span>
        {item.label}
      </Link>
    );
  }

  // The scrolling panel, shared by the desktop rail and the mobile drawer.
  // `onNavigate` closes the drawer; the desktop rail passes nothing.
  function panel(onNavigate?: () => void) {
    return (
      <>
        <div className="flex h-16 items-center justify-between px-5">
          <Wordmark onClick={onNavigate} />
          {onNavigate ? (
            <button
              type="button"
              onClick={onNavigate}
              aria-label="Close menu"
              className="text-muted hover:text-foreground"
            >
              {icons.close}
            </button>
          ) : null}
        </div>

        <nav className="flex-1 overflow-y-auto px-3">
          <ul className="flex flex-col gap-1">
            {primary.map((item) => (
              <li key={item.href}>{link(item, onNavigate)}</li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-border p-3">
          {link(SETTINGS_ITEM, onNavigate)}
          {email ? <p className="truncate px-3 pt-3 pb-2 text-xs text-muted">{email}</p> : null}
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-raised/60 hover:text-foreground"
            >
              <span className="text-muted">{icons.signout}</span>
              Sign out
            </button>
          </form>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Desktop rail: vertical, sticky, scrolls independently of the content. */}
      <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-r md:border-border md:bg-surface">
        {panel()}
      </aside>

      {/* Mobile bar: just the wordmark and a hamburger; the nav lives in a drawer. */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
        <button
          type="button"
          onClick={openDrawer}
          aria-label="Open menu"
          aria-expanded={open}
          className="text-muted hover:text-foreground"
        >
          {icons.menu}
        </button>
        <Wordmark />
      </header>

      {/* Mobile drawer. Rendered only while open so the overlay isn't in the tree
          (and focusable) the rest of the time. */}
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[80%] flex-col border-r border-border bg-surface">
            {panel(() => setOpen(false))}
          </div>
        </div>
      ) : null}
    </>
  );
}
