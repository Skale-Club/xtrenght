"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { endWorkoutSession } from "@/features/workout-session/api/workout-actions";
import { Button } from "@/shared/ui/button";

export function FinishWorkoutButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Finishing is not destructive, but it is not undoable from the UI either --
  // worth one tap of friction rather than ending a workout by mis-tap.
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function finish() {
    startTransition(async () => {
      const result = await endWorkoutSession(sessionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setConfirming(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={finish} disabled={isPending}>
            {isPending ? "Finishing…" : "Confirm finish"}
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          Finish workout
        </Button>
      )}

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
