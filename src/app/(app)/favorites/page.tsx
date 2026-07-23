import type { Metadata } from "next";
import Link from "next/link";

import { listFavoriteExercises } from "@/entities/exercise/api/exercise-queries";
import { ButtonLink } from "@/shared/ui/button";
import { ExerciseImage } from "@/shared/ui/exercise-image";

export const metadata: Metadata = { title: "Favourites" };

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

export default async function FavoritesPage() {
  // proxy.ts gates this route, and RLS scopes the rows -- no user check needed
  // to keep one person's favourites out of another's list.
  const exercises = await listFavoriteExercises();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Favourites</h1>
      <p className="mt-1 text-sm text-muted">
        <span className="numeric">{exercises.length}</span>
        {exercises.length === 1 ? " exercise saved" : " exercises saved"}
      </p>

      {exercises.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="mb-4 text-sm text-muted">
            Nothing saved yet. Star an exercise to find it faster next time.
          </p>
          <ButtonLink href="/exercises" variant="secondary">
            Browse exercises
          </ButtonLink>
        </div>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {exercises.map((exercise) => (
            <li key={exercise.id}>
              <Link
                href={`/exercises/${exercise.slug}`}
                className="flex gap-4 overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-muted"
              >
                {exercise.image_urls[0] ? (
                  <ExerciseImage
                    src={exercise.image_urls[0]}
                    alt=""
                    width={96}
                    height={96}
                    aria-hidden
                    className="h-24 w-24 shrink-0 object-cover"
                  />
                ) : (
                  <div className="h-24 w-24 shrink-0 bg-surface-raised" aria-hidden />
                )}
                <div className="min-w-0 self-center py-4 pr-4">
                  <p className="truncate font-semibold">{exercise.name}</p>
                  <p className="mt-1.5 text-xs capitalize text-muted">
                    {exercise.primary_muscles.map(label).join(", ") || "—"}
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
