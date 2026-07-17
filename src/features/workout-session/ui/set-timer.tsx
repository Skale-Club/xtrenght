"use client";

import { useEffect, useRef, useState } from "react";

import { beepEnd, beepTick } from "@/shared/lib/audio/beep";

function format(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Countdown for a timed set -- a plank, a hold, any exercise measured in seconds
 * instead of reps.
 *
 * It ticks off a target timestamp rather than decrementing a counter: a
 * setInterval drifts, and a backgrounded tab throttles it, either of which would
 * make the timer lie about how long the hold actually lasted. The last three
 * seconds click (beepTick) and zero lands on a distinct tone (beepEnd), so the
 * athlete can hold to the end without watching the screen.
 *
 * Reaching zero calls onFinish -- the set row marks the set done from there.
 */
export function SetTimer({
  targetSeconds,
  onFinish,
  disabled,
}: {
  targetSeconds: number;
  onFinish: () => void;
  disabled?: boolean;
}) {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(targetSeconds);

  // Kept in a ref so the countdown effect doesn't re-subscribe every render just
  // because the parent passed a fresh onFinish closure. Updated in an effect, not
  // during render.
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  useEffect(() => {
    if (endsAt === null) return;

    let lastTick = Infinity;
    const step = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);

      // One click per second across the final three -- guarded so a 200ms
      // interval doesn't fire the same second's beep more than once.
      if (left > 0 && left <= 3 && left < lastTick) {
        beepTick();
      }
      lastTick = left;

      if (left === 0) {
        beepEnd();
        setEndsAt(null);
        onFinishRef.current();
      }
    };

    step();
    const id = setInterval(step, 200);
    return () => clearInterval(id);
  }, [endsAt]);

  const running = endsAt !== null;

  if (running) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="numeric text-lg font-bold tabular-nums text-accent"
          role="timer"
          aria-live="off"
          aria-label={`${format(remaining)} remaining`}
        >
          {format(remaining)}
        </span>
        <button
          type="button"
          onClick={() => {
            setEndsAt(null);
            setRemaining(targetSeconds);
          }}
          aria-label="Stop timer"
          className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-muted transition-colors hover:text-foreground"
        >
          ■
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled || targetSeconds <= 0}
      onClick={() => setEndsAt(Date.now() + targetSeconds * 1000)}
      aria-label={`Start ${targetSeconds} second timer`}
      className="numeric inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:border-accent disabled:opacity-50"
    >
      <span aria-hidden className="text-accent">▶</span>
      {format(targetSeconds)}
    </button>
  );
}
