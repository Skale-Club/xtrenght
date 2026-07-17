import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getProgramForEditing } from "@/entities/program/api/program-queries";
import { ProgramEditor } from "@/features/admin/ui/program-editor";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const program = await getProgramForEditing(id);
  return { title: `${program?.title ?? "Program"} · Admin` };
}

export default async function AdminProgramEditPage({ params }: PageProps) {
  const { id } = await params;
  const program = await getProgramForEditing(id);

  if (!program) {
    notFound();
  }

  return (
    <>
      <div className="mb-8">
        <Link href="/admin/programs" className="text-sm text-muted hover:text-foreground">
          ← Programs
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{program.title}</h1>
        <p className="mt-1 text-sm capitalize text-muted">
          {program.visibility.toLowerCase()}
          {program.visibility === "PUBLISHED" ? (
            <>
              {" · "}
              <Link href={`/programs/${program.slug}`} className="text-accent hover:underline">
                view public page
              </Link>
            </>
          ) : null}
        </p>
      </div>

      <ProgramEditor program={program} />
    </>
  );
}
