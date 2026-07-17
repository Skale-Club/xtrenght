import { AppShell } from "@/widgets/app-shell/ui/app-shell";

/**
 * Layout for every navigable route. `(app)` is a route group -- the parentheses
 * keep it out of the URL, so these pages still live at /dashboard, /exercises,
 * and so on. It exists so the nav chrome is declared once here instead of being
 * pasted into every page.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
