import type { Metadata } from "next";
import Link from "next/link";

import { listSettings } from "@/features/admin/api/settings-actions";
import { SettingsForm } from "@/features/admin/ui/settings-form";

export const metadata: Metadata = { title: "Settings · Admin" };

export default async function AdminSettingsPage() {
  const settings = await listSettings();

  return (
    <>
      <div className="mb-8">
        <Link href="/admin/programs" className="text-sm text-muted hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Runtime configuration. Changes take effect within a minute — no redeploy.
        </p>
      </div>

      {settings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted">No settings yet.</p>
        </div>
      ) : (
        <SettingsForm settings={settings} />
      )}

      <p className="mt-6 text-xs text-muted">
        Secrets are write-only: their values are never sent to this page, only whether they are set.
        To change one, type a new value over it.
      </p>
    </>
  );
}
