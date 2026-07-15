"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { addExerciseToSession } from "@/features/workout-session/api/workout-actions";
import { searchExercisesForPicker, type PickerExercise } from "@/features/workout-session/api/search-exercises";
import { Button } from "@/shared/ui/button";

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

export function ExercisePicker({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PickerExercise[]>([]);
  const [isAdding, startAdding] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    // Debounced so typing "bench press" fires one search, not eleven. The flag
    // drops responses that arrive after a newer keystroke, which would
    // otherwise race and show stale results.
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await searchExercisesForPicker(term);
        if (!cancelled) setResults(found);
      } catch {
        if (!cancelled) setError("Search failed. Try again.");
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, open]);

  function add(exerciseId: string) {
    startAdding(async () => {
      const result = await addExerciseToSession(sessionId, exerciseId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setOpen(false);
      setTerm("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} className="w-full">
        + Add exercise
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <input
          autoFocus
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search the catalogue…"
          aria-label="Search exercises to add"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mb-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {results.map((exercise) => (
          <li key={exercise.id}>
            <button
              type="button"
              disabled={isAdding}
              onClick={() => add(exercise.id)}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-surface-raised disabled:opacity-50"
            >
              {exercise.imageUrl ? (
                <Image
                  src={exercise.imageUrl}
                  alt=""
                  width={40}
                  height={40}
                  aria-hidden
                  className="h-10 w-10 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded bg-surface-raised" aria-hidden />
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{exercise.name}</span>
                <span className="block truncate text-xs capitalize text-muted">
                  {exercise.muscles.map(label).join(", ") || "—"}
                </span>
              </span>
            </button>
          </li>
        ))}
        {results.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted">
            {term ? "Nothing matches that." : "Start typing to search."}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
