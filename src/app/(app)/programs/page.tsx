import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { listPrograms } from "@/entities/program/api/program-queries";

export const metadata: Metadata = { title: "Programs" };

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

export default async function ProgramsPage() {
  const programs = await listPrograms();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Programs</h1>
      <p className="mt-1 text-sm text-muted">Structured plans, week by week.</p>

      {programs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted">No programs published yet.</p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {programs.map((program) => (
            <li key={program.id}>
              <Link
                href={`/programs/${program.slug}`}
                className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-muted"
              >
                {program.image_url ? (
                  <Image
                    src={program.image_url}
                    alt=""
                    width={640}
                    height={200}
                    aria-hidden
                    className="h-32 w-full object-cover"
                  />
                ) : null}

                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{program.title}</p>
                    {program.visibility !== "PUBLISHED" ? (
                      // Only an admin can see this row at all -- RLS hides
                      // drafts from everyone else.
                      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[0.6rem] font-bold tracking-wide text-muted uppercase">
                        {label(program.visibility)}
                      </span>
                    ) : null}
                  </div>

                  {program.description ? (
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted">{program.description}</p>
                  ) : null}

                  <p className="mt-auto pt-4 text-xs capitalize text-muted">
                    <span className="text-accent">{label(program.level)}</span>
                    {" · "}
                    <span className="numeric">{program.weekCount}</span>
                    {program.weekCount === 1 ? " week" : " weeks"}
                    {" · "}
                    <span className="numeric">{program.sessionCount}</span>
                    {program.sessionCount === 1 ? " session" : " sessions"}
                    {program.participant_count > 0 ? (
                      <>
                        {" · "}
                        <span className="numeric">{program.participant_count}</span> following
                      </>
                    ) : null}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
