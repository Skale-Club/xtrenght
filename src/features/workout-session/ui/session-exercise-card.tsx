"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { addSet, removeExerciseFromSession } from "@/features/workout-session/api/workout-actions";
import { SetRow } from "@/features/workout-session/ui/set-row";
import type { WorkoutSessionDetail } from "@/entities/workout/api/workout-queries";
import { Button } from "@/shared/ui/button";

type SessionExercise = WorkoutSessionDetail["workout_session_exercises"][number];

export function SessionExerciseCard({
  sessionId,
  sessionExercise,
  readOnly,
}: {
  sessionId: string;
  sessionExercise: SessionExercise;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const exercise = sessionExercise.exercises;
  const sets = sessionExercise.workout_sets;

  function append() {
    startTransition(async () => {
      await addSet(sessionId, sessionExercise.id);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      await removeExerciseFromSession(sessionId, sessionExercise.id);
      router.refresh();
    });
  }

  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <header className="mb-4 flex items-center gap-3">
        {exercise?.image_urls?.[0] ? (
          <Image
            src={exercise.image_urls[0]}
            alt=""
            width={44}
            height={44}
            aria-hidden
            className="h-11 w-11 shrink-0 rounded-lg object-cover"
          />
        ) : null}

        <h2 className="min-w-0 flex-1 truncate font-semibold">
          {exercise ? (
            <Link href={`/exercises/${exercise.slug}`} className="hover:text-accent">
              {exercise.name}
            </Link>
          ) : (
            "Exercise"
          )}
        </h2>

        {!readOnly ? (
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            aria-label={`Remove ${exercise?.name ?? "exercise"} from this workout`}
            className="text-sm text-muted transition-colors hover:text-danger disabled:opacity-50"
          >
            ×
          </button>
        ) : null}
      </header>

      {sets.length > 0 ? (
        <>
          {/* Labels the columns once, rather than repeating placeholder text in
              every row's inputs. */}
          <div className="mb-2 grid grid-cols-[2rem_1fr_1fr_3.5rem_2.5rem_2rem] gap-2 text-center text-[0.65rem] font-medium tracking-wide text-muted uppercase">
            <span>Set</span>
            <span>Weight</span>
            <span>Reps</span>
            <span>Unit</span>
            <span>Done</span>
            <span />
          </div>

          <ul className="flex flex-col gap-2">
            {sets.map((set) => (
              <SetRow key={set.id} sessionId={sessionId} set={set} disabled={readOnly} />
            ))}
          </ul>
        </>
      ) : (
        <p className="py-2 text-sm text-muted">No sets yet.</p>
      )}

      {!readOnly ? (
        <Button variant="ghost" onClick={append} disabled={isPending} className="mt-3 w-full">
          {isPending ? "…" : "+ Add set"}
        </Button>
      ) : null}
    </article>
  );
}
