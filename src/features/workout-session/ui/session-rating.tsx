"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { rateWorkoutSession } from "@/features/workout-session/api/workout-actions";

const SCALE = [1, 2, 3, 4, 5];

export function SessionRating({
  sessionId,
  initialRating,
  initialComment,
}: {
  sessionId: string;
  initialRating: number | null;
  initialComment: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState(initialComment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save(nextRating: number) {
    setRating(nextRating);
    startTransition(async () => {
      const result = await rateWorkoutSession(sessionId, nextRating, comment);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setSaved(true);
      router.refresh();
    });
  }

  function saveComment() {
    // The database rejects a comment without a rating, so don't send one.
    if (rating === null) return;
    startTransition(async () => {
      const result = await rateWorkoutSession(sessionId, rating, comment);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">How did it go?</h2>

      <div className="flex gap-2" role="group" aria-label="Rate this workout from 1 to 5">
        {SCALE.map((value) => (
          <button
            key={value}
            type="button"
            disabled={isPending}
            onClick={() => save(value)}
            aria-pressed={rating === value}
            aria-label={`${value} out of 5`}
            className={`numeric h-10 flex-1 rounded-lg border text-sm font-bold transition-colors disabled:opacity-50 ${
              rating !== null && value <= rating
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {rating !== null ? (
        <div className="mt-3">
          <label htmlFor="rating-comment" className="sr-only">
            Notes about this workout
          </label>
          <textarea
            id="rating-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            onBlur={saveComment}
            rows={2}
            placeholder="Anything worth remembering? (optional)"
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      {saved && !error && !isPending ? (
        <p role="status" className="mt-2 text-xs text-muted">
          Saved.
        </p>
      ) : null}
    </section>
  );
}
