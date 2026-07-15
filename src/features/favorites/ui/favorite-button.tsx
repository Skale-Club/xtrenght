"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import { toggleFavorite } from "@/features/favorites/api/favorite-actions";

export function FavoriteButton({
  exerciseId,
  slug,
  initialFavorited,
  signedIn,
}: {
  exerciseId: string;
  slug: string;
  initialFavorited: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [favorited, setFavorited] = useState(initialFavorited);
  // Optimistic: a heart that waits for a round trip feels broken.
  const [shown, setShown] = useOptimistic(favorited);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return null;
  }

  function handleClick() {
    startTransition(async () => {
      setShown(!favorited);
      const result = await toggleFavorite(exerciseId, slug);

      if (result.error) {
        // useOptimistic reverts on its own when the transition ends without the
        // real value changing, so there is nothing to roll back by hand.
        setError(result.error);
        return;
      }

      setError(null);
      setFavorited(result.favorited ?? !favorited);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-pressed={shown}
        aria-label={shown ? "Remove from favourites" : "Save to favourites"}
        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
          shown
            ? "border-accent text-accent"
            : "border-border text-muted hover:border-muted hover:text-foreground"
        }`}
      >
        {shown ? "★ Saved" : "☆ Save"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
