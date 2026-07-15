"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";

import { startWorkoutSession } from "@/features/workout-session/api/workout-actions";
import { Button } from "@/shared/ui/button";

export function StartWorkoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    startTransition(async () => {
      const result = await startWorkoutSession();

      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }

      setError(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={handleClick} disabled={isPending}>
        {isPending ? "Starting…" : "Start workout"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
