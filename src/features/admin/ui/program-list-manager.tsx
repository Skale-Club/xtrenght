"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createProgram,
  deleteProgram,
  setProgramVisibility,
} from "@/features/admin/api/admin-program-actions";
import type { Enums } from "@/shared/types/database.types";
import { Button } from "@/shared/ui/button";

type Row = {
  id: string;
  slug: string;
  title: string;
  level: Enums<"program_level">;
  visibility: Enums<"program_visibility">;
  participant_count: number;
  weekCount: number;
  sessionCount: number;
};

const LEVELS: Enums<"program_level">[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"];

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none";

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

export function ProgramListManager({ programs }: { programs: Row[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  function run(fn: () => Promise<{ error: string | null }>) {
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setConfirmingDelete(null);
      router.refresh();
    });
  }

  return (
    <>
      <form
        action={(formData) => run(() => createProgram(formData))}
        className="mb-8 flex flex-wrap gap-2 rounded-xl border border-border bg-surface p-4"
      >
        <input name="title" placeholder="New program title" required className={`${inputClass} flex-1`} />
        <select name="level" defaultValue="BEGINNER" className={inputClass}>
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {label(level)}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={isPending}>
          Create
        </Button>
      </form>

      {error ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {programs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted">No programs yet. Create the first one above.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {programs.map((program) => (
            <li
              key={program.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <Link href={`/admin/programs/${program.id}`} className="font-medium hover:text-accent">
                  {program.title}
                </Link>
                <p className="mt-0.5 text-xs capitalize text-muted">
                  {label(program.level)} · <span className="numeric">{program.weekCount}</span> weeks ·{" "}
                  <span className="numeric">{program.sessionCount}</span> sessions ·{" "}
                  <span className="numeric">{program.participant_count}</span> following
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={program.visibility}
                  disabled={isPending}
                  onChange={(event) =>
                    run(() =>
                      setProgramVisibility(program.id, event.target.value as Enums<"program_visibility">),
                    )
                  }
                  aria-label={`Visibility for ${program.title}`}
                  className={`${inputClass} capitalize ${
                    program.visibility === "PUBLISHED" ? "text-accent" : "text-muted"
                  }`}
                >
                  <option value="DRAFT">draft</option>
                  <option value="PUBLISHED">published</option>
                  <option value="ARCHIVED">archived</option>
                </select>

                {confirmingDelete === program.id ? (
                  <>
                    <Button variant="ghost" onClick={() => setConfirmingDelete(null)} disabled={isPending}>
                      Cancel
                    </Button>
                    <Button onClick={() => run(() => deleteProgram(program.id))} disabled={isPending}>
                      Really delete
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" onClick={() => setConfirmingDelete(program.id)}>
                    Delete
                  </Button>
                )}
              </div>

              {confirmingDelete === program.id && program.participant_count > 0 ? (
                // Worth saying out loud: their logged workouts survive, their
                // place in the program does not.
                <p className="w-full text-xs text-danger">
                  {program.participant_count} {program.participant_count === 1 ? "person is" : "people are"}{" "}
                  following this. Deleting drops their progress — their logged workouts stay in their history.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
