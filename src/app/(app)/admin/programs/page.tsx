import type { Metadata } from "next";

import { listPrograms } from "@/entities/program/api/program-queries";
import { ProgramListManager } from "@/features/admin/ui/program-list-manager";

export const metadata: Metadata = { title: "Programs · Admin" };

export default async function AdminProgramsPage() {
  // The same query the public page uses. RLS is what differs: for an admin it
  // returns drafts too, so there is no separate admin listing to keep in sync.
  const programs = await listPrograms();

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Programs</h1>
        <p className="mt-1 text-sm text-muted">Create, build and publish training programs.</p>
      </div>

      <ProgramListManager programs={programs} />
    </>
  );
}
