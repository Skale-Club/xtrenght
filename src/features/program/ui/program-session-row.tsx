"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ProgramSessionState } from "@/entities/program/api/program-queries";
import { startProgramSession } from "@/features/program/api/program-actions";
import { Button } from "@/shared/ui/button";

const STATE_LABEL: Record<ProgramSessionState, string> = {
  done: "Done",
  in_progress: "Resume",
  next: "Start",
  locked: "Start",
};

export function ProgramSessionRow({
  sessionId,
  slug,
  title,
  subtitle,
  state,
  workoutId,
  enrolled,
}: {
  sessionId: string;
  slug: string;
  title: string;
  subtitle: string;
  state: ProgramSessionState;
  workoutId: string | null;
  enrolled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    // Already has a workout -- done or in progress. Go to it rather than
    // starting a second one.
    if (workoutId) {
      router.push(`/workout/${workoutId}`);
      return;
    }

    startTransition(async () => {
      const result = await startProgramSession(sessionId, slug);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.workoutSessionId) {
        router.push(`/workout/${result.workoutSessionId}`);
      }
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className={`truncate text-sm font-medium ${state === "done" ? "text-muted line-through" : ""}`}>
          {title}
        </p>
        <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
        {error ? (
          <p role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>

      {enrolled ? (
        <Button
          variant={state === "next" ? "primary" : "secondary"}
          onClick={open}
          disabled={isPending}
          className="shrink-0"
        >
          {isPending ? "…" : STATE_LABEL[state]}
        </Button>
      ) : null}
    </li>
  );
}
