"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { startWorkoutSession } from "@/features/workout-session/api/workout-actions";
import { Button } from "@/shared/ui/button";

export function StartWorkoutButton({ resumeId }: { resumeId?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    // An open session already exists: go straight back to it rather than
    // starting a second one. The action would return the same id anyway; this
    // just skips the round trip.
    if (resumeId) {
      router.push(`/workout/${resumeId}`);
      return;
    }

    startTransition(async () => {
      const result = await startWorkoutSession();

      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }

      setError(null);
      if ("sessionId" in result && result.sessionId) {
        router.push(`/workout/${result.sessionId}`);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={handleClick} disabled={isPending}>
        {isPending ? "Starting…" : resumeId ? "Resume workout" : "Start workout"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
