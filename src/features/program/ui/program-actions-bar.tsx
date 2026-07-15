"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { enrollInProgram, leaveProgram } from "@/features/program/api/program-actions";
import { Button, ButtonLink } from "@/shared/ui/button";

export function ProgramActionsBar({
  programId,
  slug,
  enrolled,
  signedIn,
}: {
  programId: string;
  slug: string;
  enrolled: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return <ButtonLink href={`/login?redirectTo=/programs/${slug}`}>Sign in to follow</ButtonLink>;
  }

  function run(fn: () => Promise<{ error: string | null }>) {
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setConfirmLeave(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {!enrolled ? (
        <Button disabled={isPending} onClick={() => run(() => enrollInProgram(programId, slug))}>
          {isPending ? "…" : "Follow program"}
        </Button>
      ) : confirmLeave ? (
        <div className="flex gap-2">
          <Button variant="ghost" disabled={isPending} onClick={() => setConfirmLeave(false)}>
            Cancel
          </Button>
          <Button disabled={isPending} onClick={() => run(() => leaveProgram(programId, slug))}>
            {isPending ? "…" : "Confirm leave"}
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setConfirmLeave(true)}>
          Following
        </Button>
      )}

      {enrolled && !confirmLeave ? (
        // Leaving drops progress tracking, and the workouts already logged stay
        // in history -- worth saying before they click, not after.
        <p className="text-xs text-muted">Tap to stop following</p>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
