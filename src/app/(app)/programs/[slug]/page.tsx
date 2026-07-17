import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { getProgramBySlug } from "@/entities/program/api/program-queries";
import { ProgramActionsBar } from "@/features/program/ui/program-actions-bar";
import { ProgramSessionRow } from "@/features/program/ui/program-session-row";
import { createClient } from "@/shared/lib/supabase/server";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const program = await getProgramBySlug(slug);
  return { title: program?.title ?? "Program" };
}

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function describeSets(
  sets: { reps: number | null; weight: number | null; weight_unit: string | null }[],
) {
  if (sets.length === 0) return "no sets prescribed";
  const first = sets[0];
  const uniform = sets.every((s) => s.reps === first.reps && s.weight === first.weight);

  // "3 × 8 @ 60kg" when the prescription repeats, which it usually does.
  if (uniform) {
    const base = `${sets.length} × ${first.reps ?? "–"}`;
    return first.weight ? `${base} @ ${first.weight}${first.weight_unit ?? ""}` : base;
  }
  return sets.map((s) => `${s.weight ?? "–"}×${s.reps ?? "–"}`).join(", ");
}

export default async function ProgramPage({ params }: PageProps) {
  const { slug } = await params;
  const program = await getProgramBySlug(slug);

  // Covers "no such program" and "a draft, and you are not an admin" alike:
  // RLS returns nothing for both, and neither should be distinguishable.
  if (!program) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const enrolled = program.enrollment !== null;
  const { completedCount, totalCount } = program.progress;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      {program.image_url ? (
        <Image
          src={program.image_url}
          alt=""
          width={960}
          height={280}
          priority
          aria-hidden
          className="mb-6 h-44 w-full rounded-xl border border-border object-cover"
        />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-accent uppercase">
            {label(program.level)}
            {program.visibility !== "PUBLISHED" ? ` · ${label(program.visibility)}` : ""}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{program.title}</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="numeric">{program.program_weeks.length}</span>
            {program.program_weeks.length === 1 ? " week" : " weeks"}
            {" · "}
            <span className="numeric">{totalCount}</span>
            {totalCount === 1 ? " session" : " sessions"}
            {program.session_duration_min ? ` · ~${program.session_duration_min} min each` : ""}
          </p>
        </div>

        <ProgramActionsBar
          programId={program.id}
          slug={program.slug}
          enrolled={enrolled}
          signedIn={user !== null}
        />
      </div>

      {program.description ? (
        <p className="mt-6 leading-relaxed text-muted">{program.description}</p>
      ) : null}

      {enrolled && totalCount > 0 ? (
        <div className="mt-8 rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-medium">Your progress</span>
            <span className="numeric text-sm text-muted">
              {completedCount} / {totalCount}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-surface-raised"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Program progress"
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
        </div>
      ) : null}

      {program.program_weeks.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted">This program has no weeks yet.</p>
        </div>
      ) : (
        <div className="mt-10 flex flex-col gap-8">
          {program.program_weeks.map((week) => (
            <section key={week.id}>
              <h2 className="mb-1 text-lg font-semibold">
                {week.title ?? `Week ${week.week_number}`}
              </h2>
              {week.description ? (
                <p className="mb-3 text-sm text-muted">{week.description}</p>
              ) : null}

              <ul className="flex flex-col gap-2">
                {week.program_sessions.map((session) => {
                  const exercises = session.program_session_exercises;
                  const summary =
                    exercises.length === 0
                      ? "no exercises yet"
                      : exercises
                          .map(
                            (e) =>
                              `${e.exercises?.name ?? "?"} — ${describeSets(e.program_suggested_sets)}`,
                          )
                          .join(" · ");

                  return (
                    <ProgramSessionRow
                      key={session.id}
                      sessionId={session.id}
                      slug={program.slug}
                      title={session.title}
                      subtitle={summary}
                      state={program.progress.stateOf(session.id)}
                      workoutId={program.progress.workoutIdFor(session.id)}
                      enrolled={enrolled}
                    />
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
