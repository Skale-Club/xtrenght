import type { Metadata } from "next";
import Link from "next/link";

import { listExercises } from "@/entities/exercise/api/exercise-queries";
import type { Enums } from "@/shared/types/database.types";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const metadata: Metadata = { title: "Exercises" };

const FILTER_MUSCLES: Enums<"muscle_group">[] = [
  "CHEST",
  "BACK",
  "SHOULDERS",
  "BICEPS",
  "TRICEPS",
  "QUADRICEPS",
  "HAMSTRINGS",
  "GLUTES",
  "ABDOMINALS",
];

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ muscle?: string; q?: string }>;
}) {
  const { muscle, q } = await searchParams;

  // Validate against the enum before it reaches Postgres: an unknown value
  // would fail the cast, and this keeps the URL from deciding what is a muscle.
  const selected = FILTER_MUSCLES.find((m) => m === muscle);

  const exercises = await listExercises({
    search: q,
    muscles: selected ? [selected] : undefined,
  });

  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Exercises</h1>
        <p className="mt-1 text-sm text-muted">Browse the catalogue. No account needed.</p>

        <form className="mt-8 mb-6">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search exercises…"
            aria-label="Search exercises"
            className="w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2.5 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </form>

        <div className="mb-8 flex flex-wrap gap-2">
          <Link
            href="/exercises"
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
              selected ? "border-border text-muted hover:text-foreground" : "border-accent text-accent"
            }`}
          >
            All
          </Link>
          {FILTER_MUSCLES.map((m) => (
            <Link
              key={m}
              href={`/exercises?muscle=${m}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                selected === m ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"
              }`}
            >
              {label(m)}
            </Link>
          ))}
        </div>

        {exercises.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted">
              No exercises found. If the catalogue is empty, seed it first — see the README.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {exercises.map((exercise) => (
              <li key={exercise.id}>
                <Link
                  href={`/exercises/${exercise.slug}`}
                  className="block rounded-xl border border-border bg-surface p-5 transition-colors hover:border-muted"
                >
                  <p className="font-semibold">{exercise.name}</p>
                  <p className="mt-1.5 text-xs capitalize text-muted">
                    {exercise.primary_muscles.map(label).join(", ") || "—"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
