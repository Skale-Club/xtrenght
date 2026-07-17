import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getLastPerformances, getWorkoutSession } from "@/entities/workout/api/workout-queries";
import { ExercisePicker } from "@/features/workout-session/ui/exercise-picker";
import { FinishWorkoutButton } from "@/features/workout-session/ui/finish-workout-button";
import { RestTimer } from "@/features/workout-session/ui/rest-timer";
import { SessionExerciseCard } from "@/features/workout-session/ui/session-exercise-card";
import { SessionRating } from "@/features/workout-session/ui/session-rating";
import { ButtonLink } from "@/shared/ui/button";

export const metadata: Metadata = { title: "Workout" };

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getWorkoutSession(id);

  // Covers both "no such session" and "someone else's session": RLS returns
  // null either way, so this leaks nothing about which is true.
  if (!session) {
    notFound();
  }

  const finished = session.ended_at !== null;
  const exercises = session.workout_session_exercises;

  // What they last did for each of these exercises, to show while logging.
  const lastPerformances = await getLastPerformances(
    exercises.map((e) => e.exercises?.id).filter((id): id is string => Boolean(id)),
    session.id,
  );

  const completedSets = exercises.reduce(
    (n, exercise) => n + exercise.workout_sets.filter((set) => set.completed).length,
    0,
  );
  const totalSets = exercises.reduce((n, exercise) => n + exercise.workout_sets.length, 0);

  return (
    <>
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-accent uppercase">
              {finished ? "Finished" : "In progress"}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              {new Date(session.started_at).toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </h1>
            <p className="mt-1 text-sm text-muted">
              <span className="numeric">{completedSets}</span>
              {" of "}
              <span className="numeric">{totalSets}</span>
              {totalSets === 1 ? " set done" : " sets done"}
              {session.duration_seconds ? ` · ${formatDuration(session.duration_seconds)}` : ""}
            </p>
          </div>

          {finished ? (
            <ButtonLink href="/dashboard" variant="secondary">
              Back to dashboard
            </ButtonLink>
          ) : (
            <FinishWorkoutButton sessionId={session.id} />
          )}
        </div>

        {exercises.length === 0 ? (
          <div className="mb-4 rounded-xl border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted">
              {finished ? "No exercises were logged." : "Add your first exercise to get going."}
            </p>
          </div>
        ) : (
          <div className="mb-4 flex flex-col gap-4">
            {exercises.map((sessionExercise) => (
              <SessionExerciseCard
                key={sessionExercise.id}
                sessionId={session.id}
                sessionExercise={sessionExercise}
                lastPerformance={
                  sessionExercise.exercises
                    ? (lastPerformances.get(sessionExercise.exercises.id) ?? null)
                    : null
                }
                readOnly={finished}
              />
            ))}
          </div>
        )}

        {!finished ? <ExercisePicker sessionId={session.id} /> : null}

        {finished ? (
          <div className="mt-4">
            <SessionRating
              sessionId={session.id}
              initialRating={session.rating}
              initialComment={session.rating_comment}
            />
          </div>
        ) : null}
      </main>

      {/* Fixed to the viewport, so it stays reachable while scrolling a long
          session. Only while training -- it is noise on a finished one. */}
      {!finished ? <RestTimer /> : null}
    </>
  );
}
