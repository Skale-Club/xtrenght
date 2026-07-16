"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteCoachNote } from "@/features/ai-coach/api/note-actions";

type Note = { id: string; note: string; created_at: string };

/**
 * What the coach remembers about you, and the button that takes it back.
 *
 * A note is a claim the model made about you from a conversation. It loads into
 * every system prompt from then on, so a wrong one quietly shapes every future
 * answer. That makes it something you get to read and delete -- not a hidden
 * profile.
 */
export function CoachNotes({ notes }: { notes: Note[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (notes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted">
          The coach hasn&apos;t noted anything about you yet. It will as you talk.
        </p>
      </div>
    );
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteCoachNote(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  return (
    <>
      {error ? (
        <p role="alert" className="mb-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {notes.map((note) => (
          <li
            key={note.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm">{note.note}</p>
              <p className="mt-0.5 text-xs text-muted">
                {new Date(note.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => remove(note.id)}
              disabled={isPending}
              aria-label={`Forget: ${note.note}`}
              className="shrink-0 text-xs text-muted transition-colors hover:text-danger disabled:opacity-50"
            >
              Forget
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
