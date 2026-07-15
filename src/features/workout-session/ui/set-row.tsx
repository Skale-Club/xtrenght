"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteSet, updateSet } from "@/features/workout-session/api/workout-actions";
import type { Enums, Tables } from "@/shared/types/database.types";

type WorkoutSet = Pick<
  Tables<"workout_sets">,
  "id" | "set_index" | "reps" | "weight" | "weight_unit" | "completed"
>;

const inputClass =
  "numeric w-full rounded-lg border border-border bg-background px-2 py-2 text-center text-sm " +
  "focus:border-accent focus:outline-none placeholder:text-muted";

/** "" -> null, so clearing a field stores unknown rather than 0. */
function toNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function SetRow({
  sessionId,
  set,
  disabled,
}: {
  sessionId: string;
  set: WorkoutSet;
  disabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Local state so typing stays responsive; the server is told on blur, not on
  // every keystroke. A round trip per character would make the inputs lag and
  // hammer the database mid-set.
  const [weight, setWeight] = useState(set.weight?.toString() ?? "");
  const [reps, setReps] = useState(set.reps?.toString() ?? "");
  const [unit, setUnit] = useState<Enums<"weight_unit">>(set.weight_unit ?? "kg");
  const [completed, setCompleted] = useState(set.completed);
  const [error, setError] = useState<string | null>(null);

  function save(next?: Partial<{ completed: boolean; unit: Enums<"weight_unit"> }>) {
    startTransition(async () => {
      const result = await updateSet(sessionId, set.id, {
        reps: toNumber(reps),
        weight: toNumber(weight),
        weightUnit: next?.unit ?? unit,
        completed: next?.completed ?? completed,
      });

      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteSet(sessionId, set.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li
      className={`grid grid-cols-[2rem_1fr_1fr_3.5rem_2.5rem_2rem] items-center gap-2 ${
        completed ? "opacity-60" : ""
      }`}
    >
      <span className="numeric text-center text-xs text-muted">{set.set_index + 1}</span>

      <input
        value={weight}
        onChange={(event) => setWeight(event.target.value)}
        onBlur={() => save()}
        disabled={disabled || isPending}
        inputMode="decimal"
        placeholder="kg"
        aria-label={`Set ${set.set_index + 1} weight`}
        className={inputClass}
      />

      <input
        value={reps}
        onChange={(event) => setReps(event.target.value)}
        onBlur={() => save()}
        disabled={disabled || isPending}
        inputMode="numeric"
        placeholder="reps"
        aria-label={`Set ${set.set_index + 1} reps`}
        className={inputClass}
      />

      <button
        type="button"
        disabled={disabled || isPending}
        onClick={() => {
          const next = unit === "kg" ? "lbs" : "kg";
          setUnit(next);
          save({ unit: next });
        }}
        aria-label={`Set ${set.set_index + 1} unit, currently ${unit}`}
        className="rounded-lg border border-border py-2 text-xs font-semibold text-muted transition-colors hover:text-foreground disabled:opacity-50"
      >
        {unit}
      </button>

      <button
        type="button"
        disabled={disabled || isPending}
        onClick={() => {
          const next = !completed;
          setCompleted(next);
          save({ completed: next });
        }}
        aria-pressed={completed}
        aria-label={`Mark set ${set.set_index + 1} ${completed ? "not done" : "done"}`}
        className={`rounded-lg border py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
          completed
            ? "border-accent bg-accent text-accent-foreground"
            : "border-border text-muted hover:text-foreground"
        }`}
      >
        ✓
      </button>

      <button
        type="button"
        disabled={disabled || isPending}
        onClick={remove}
        aria-label={`Delete set ${set.set_index + 1}`}
        className="text-sm text-muted transition-colors hover:text-danger disabled:opacity-50"
      >
        ×
      </button>

      {error ? (
        <p role="alert" className="col-span-full text-xs text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}
