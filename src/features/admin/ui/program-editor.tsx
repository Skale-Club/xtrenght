"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ProgramForEditing } from "@/entities/program/api/program-queries";
import {
  addExerciseToProgramSession,
  addSession,
  addSuggestedSet,
  addWeek,
  deleteSession,
  deleteSuggestedSet,
  deleteWeek,
  removeExerciseFromProgramSession,
  updateProgram,
  updateSuggestedSet,
} from "@/features/admin/api/admin-program-actions";
import { searchExercisesForPicker, type PickerExercise } from "@/features/workout-session/api/search-exercises";
import type { Enums } from "@/shared/types/database.types";
import { Button } from "@/shared/ui/button";
import { ExerciseImage } from "@/shared/ui/exercise-image";

const LEVELS: Enums<"program_level">[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"];

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none";

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function toNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

type Session = ProgramForEditing["program_weeks"][number]["program_sessions"][number];
type SessionExercise = Session["program_session_exercises"][number];
type SuggestedSet = SessionExercise["program_suggested_sets"][number];

// ---------------------------------------------------------------- set row --

function SetRow({ set, onChanged }: { set: SuggestedSet; onChanged: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [reps, setReps] = useState(set.reps?.toString() ?? "");
  const [weight, setWeight] = useState(set.weight?.toString() ?? "");

  // Saves on blur, like the workout logger: a round trip per keystroke would
  // lag the field and hammer the database while someone is typing.
  function save() {
    startTransition(async () => {
      await updateSuggestedSet(set.id, { reps: toNumber(reps), weight: toNumber(weight) });
      onChanged();
    });
  }

  return (
    <li className="grid grid-cols-[1.5rem_1fr_1fr_2rem] items-center gap-2">
      <span className="numeric text-center text-xs text-muted">{set.set_index + 1}</span>
      <input
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        onBlur={save}
        disabled={isPending}
        inputMode="decimal"
        placeholder="kg"
        aria-label={`Set ${set.set_index + 1} suggested weight`}
        className={`numeric ${inputClass} text-center`}
      />
      <input
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        onBlur={save}
        disabled={isPending}
        inputMode="numeric"
        placeholder="reps"
        aria-label={`Set ${set.set_index + 1} suggested reps`}
        className={`numeric ${inputClass} text-center`}
      />
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(async () => {
          await deleteSuggestedSet(set.id);
          onChanged();
        })}
        aria-label={`Delete suggested set ${set.set_index + 1}`}
        className="text-sm text-muted transition-colors hover:text-danger disabled:opacity-50"
      >
        ×
      </button>
    </li>
  );
}

// ------------------------------------------------------------ exercise card --

function ExerciseCard({ exercise, onChanged }: { exercise: SessionExercise; onChanged: () => void }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        {exercise.exercises?.image_urls?.[0] ? (
          <ExerciseImage
            src={exercise.exercises.image_urls[0]}
            alt=""
            width={28}
            height={28}
            aria-hidden
            className="h-7 w-7 shrink-0 rounded object-cover"
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {exercise.exercises?.name ?? "Exercise"}
        </span>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => {
            await removeExerciseFromProgramSession(exercise.id);
            onChanged();
          })}
          aria-label={`Remove ${exercise.exercises?.name ?? "exercise"}`}
          className="text-sm text-muted transition-colors hover:text-danger disabled:opacity-50"
        >
          ×
        </button>
      </div>

      <ul className="flex flex-col gap-1.5">
        {exercise.program_suggested_sets.map((set) => (
          <SetRow key={set.id} set={set} onChanged={onChanged} />
        ))}
      </ul>

      <Button
        variant="ghost"
        disabled={isPending}
        onClick={() => startTransition(async () => {
          await addSuggestedSet(exercise.id);
          onChanged();
        })}
        className="mt-2 w-full text-xs"
      >
        + set
      </Button>
    </div>
  );
}

// ------------------------------------------------------------ exercise picker --

function InlinePicker({ sessionId, onChanged }: { sessionId: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PickerExercise[]>([]);
  const [isPending, startTransition] = useTransition();

  async function search(value: string) {
    setTerm(value);
    const found = await searchExercisesForPicker(value);
    setResults(found);
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => { setOpen(true); void search(""); }} className="w-full text-xs">
        + exercise
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-border p-2">
      <input
        autoFocus
        value={term}
        onChange={(e) => void search(e.target.value)}
        placeholder="Search the catalogue…"
        aria-label="Search exercises to add to this session"
        className={inputClass}
      />
      <ul className="mt-2 flex max-h-52 flex-col gap-1 overflow-y-auto">
        {results.map((result) => (
          <li key={result.id}>
            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(async () => {
                await addExerciseToProgramSession(sessionId, result.id);
                setOpen(false);
                setTerm("");
                onChanged();
              })}
              className="w-full truncate rounded p-1.5 text-left text-xs transition-colors hover:bg-surface-raised disabled:opacity-50"
            >
              {result.name}
            </button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" onClick={() => setOpen(false)} className="mt-1 w-full text-xs">
        Cancel
      </Button>
    </div>
  );
}

// ----------------------------------------------------------------- editor --

export function ProgramEditor({ program }: { program: ProgramForEditing }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newSessionTitle, setNewSessionTitle] = useState<Record<string, string>>({});

  const refresh = () => router.refresh();

  function run(fn: () => Promise<{ error: string | null }>) {
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      refresh();
    });
  }

  return (
    <>
      <form
        action={(formData) => run(() => updateProgram(program.id, formData))}
        className="mb-8 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Title</span>
            <input name="title" defaultValue={program.title} required className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Level</span>
            <select name="level" defaultValue={program.level} className={inputClass}>
              {LEVELS.map((level) => (
                <option key={level} value={level} className="capitalize">
                  {label(level)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Category</span>
            <input name="category" defaultValue={program.category ?? ""} className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Session length (min)</span>
            <input
              name="session_duration_min"
              type="number"
              min={1}
              defaultValue={program.session_duration_min ?? ""}
              className={inputClass}
            />
          </label>
        </div>

        <label className="text-sm">
          <span className="mb-1 block font-medium">Cover image URL</span>
          <input name="image_url" defaultValue={program.image_url ?? ""} className={inputClass} />
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium">Description</span>
          <textarea
            name="description"
            defaultValue={program.description ?? ""}
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </label>

        <div className="flex items-center justify-between">
          {/* The slug is derived from the title at creation and never changes:
              a published program's URL should not break because a typo got
              fixed. */}
          <p className="text-xs text-muted">
            /programs/<span className="numeric">{program.slug}</span>
          </p>
          <Button type="submit" disabled={isPending}>
            Save details
          </Button>
        </div>
      </form>

      {error ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Weeks</h2>
        <Button variant="secondary" disabled={isPending} onClick={() => run(() => addWeek(program.id))}>
          + Add week
        </Button>
      </div>

      {program.program_weeks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted">No weeks yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {program.program_weeks.map((week) => (
            <section key={week.id} className="rounded-xl border border-border p-4">
              <header className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">Week {week.week_number}</h3>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => deleteWeek(week.id))}
                  className="text-xs text-muted transition-colors hover:text-danger disabled:opacity-50"
                >
                  Delete week
                </button>
              </header>

              <div className="flex flex-col gap-4">
                {week.program_sessions.map((session) => (
                  <div key={session.id} className="rounded-lg border border-border bg-surface-raised p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium">{session.title}</span>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => run(() => deleteSession(session.id))}
                        className="text-xs text-muted transition-colors hover:text-danger disabled:opacity-50"
                      >
                        remove
                      </button>
                    </div>

                    <div className="flex flex-col gap-2">
                      {session.program_session_exercises.map((exercise) => (
                        <ExerciseCard key={exercise.id} exercise={exercise} onChanged={refresh} />
                      ))}
                      <InlinePicker sessionId={session.id} onChanged={refresh} />
                    </div>
                  </div>
                ))}

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const title = newSessionTitle[week.id] ?? "";
                    run(async () => {
                      const result = await addSession(week.id, title);
                      if (!result.error) setNewSessionTitle((s) => ({ ...s, [week.id]: "" }));
                      return result;
                    });
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={newSessionTitle[week.id] ?? ""}
                    onChange={(e) => setNewSessionTitle((s) => ({ ...s, [week.id]: e.target.value }))}
                    placeholder="Session name, e.g. Day 1 — Push"
                    aria-label={`New session for week ${week.week_number}`}
                    className={inputClass}
                  />
                  <Button type="submit" variant="secondary" disabled={isPending}>
                    Add
                  </Button>
                </form>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
