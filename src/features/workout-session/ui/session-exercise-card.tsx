"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { isTimedSet } from "@/entities/exercise/model/set-kind";
import { addSet, removeExerciseFromSession } from "@/features/workout-session/api/workout-actions";
import { SetRow } from "@/features/workout-session/ui/set-row";
import type { LastPerformance, WorkoutSessionDetail } from "@/entities/workout/api/workout-queries";
import { Button } from "@/shared/ui/button";

type SessionExercise = WorkoutSessionDetail["workout_session_exercises"][number];

/**
 * The full, self-labelling summary of a past session's sets. Returns its own
 * units so the caller never appends "kg" to a rep count.
 *
 * - all sets equal, weighted:   "3 sets · 60 kg × 5"
 * - all sets equal, bodyweight: "3 sets · 5 reps"
 * - all sets equal, timed:      "3 sets · 60s"
 * - mixed, weighted:            "60kg × 5, 62.5kg × 3"
 * - mixed, bodyweight:          "5 · 8 · 6 reps"
 * - mixed, timed:               "60s · 45s · 30s"
 */
function formatLast(perf: LastPerformance): string {
  const sets = perf.sets;
  const round = (n: number) => (Math.round(n * 10) / 10).toString();

  // A timed exercise is held for seconds -- no reps, and usually no load.
  if (sets.some((s) => s.durationSeconds !== null)) {
    const secs = sets.map((s) => s.durationSeconds);
    const first = secs[0];
    if (secs.every((s) => s === first) && first !== null) {
      return `${sets.length} set${sets.length === 1 ? "" : "s"} · ${first}s`;
    }
    return secs.map((s) => (s !== null ? `${s}s` : "?")).join(" · ");
  }

  const anyWeight = sets.some((s) => s.weightKg !== null);

  const first = sets[0];
  const uniform = sets.every((s) => s.weightKg === first.weightKg && s.reps === first.reps);

  if (uniform && first) {
    const count = `${sets.length} set${sets.length === 1 ? "" : "s"}`;
    return first.weightKg !== null
      ? `${count} · ${round(first.weightKg)} kg × ${first.reps ?? "?"}`
      : `${count} · ${first.reps ?? "?"} reps`;
  }

  if (!anyWeight) {
    return `${sets.map((s) => s.reps ?? "?").join(" · ")} reps`;
  }

  return sets
    .map((s) => (s.weightKg !== null ? `${round(s.weightKg)}kg × ${s.reps ?? "?"}` : `${s.reps ?? "?"} reps`))
    .join(", ");
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function SessionExerciseCard({
  sessionId,
  sessionExercise,
  lastPerformance,
  readOnly,
}: {
  sessionId: string;
  sessionExercise: SessionExercise;
  lastPerformance: LastPerformance | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const exercise = sessionExercise.exercises;
  const sets = sessionExercise.workout_sets;
  // Every set of an exercise shares its kind (a new set inherits it), so the
  // first set decides which column layout the whole card wears.
  const timed = sets.length > 0 && isTimedSet(sets[0].types);

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

      {lastPerformance ? (
        // The number they actually want while picking today's load. Completed
        // sets only, normalised to kg, from the last session that trained this.
        <p className="mb-3 text-xs text-muted">
          <span className="font-medium text-foreground/70">Last time</span>
          {" · "}
          {formatWhen(lastPerformance.date)} — {formatLast(lastPerformance)}
        </p>
      ) : null}

      {sets.length > 0 ? (
        <>
          {/* Labels the columns once, rather than repeating placeholder text in
              every row's inputs. Timed and rep sets wear different columns. */}
          {timed ? (
            <div className="mb-2 grid grid-cols-[2rem_1fr_auto_2.5rem_2rem] gap-2 text-center text-[0.65rem] font-medium tracking-wide text-muted uppercase">
              <span>Set</span>
              <span>Secs</span>
              <span>Timer</span>
              <span>Done</span>
              <span />
            </div>
          ) : (
            <div className="mb-2 grid grid-cols-[2rem_1fr_1fr_3.5rem_2.5rem_2rem] gap-2 text-center text-[0.65rem] font-medium tracking-wide text-muted uppercase">
              <span>Set</span>
              <span>Weight</span>
              <span>Reps</span>
              <span>Unit</span>
              <span>Done</span>
              <span />
            </div>
          )}

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
