"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PRESETS = [60, 90, 120, 180];

function format(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Rest countdown between sets.
 *
 * Purely client-side and deliberately not persisted: rest is a live prompt, not
 * a record. Nothing about a timer that was running when you closed the tab is
 * worth restoring.
 */
export function RestTimer() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [preset, setPreset] = useState(90);
  const audioRef = useRef<AudioContext | null>(null);

  // Declared above the effect that calls it. Hoisting would make it work either
  // way, but a function the effect closes over should be defined before it, so
  // that adding a dependency later cannot silently capture a stale version.
  const beep = useCallback(() => {
    try {
      // WebAudio rather than an audio file: no asset to ship, and it works
      // without a network round trip mid-workout.
      const ctx = audioRef.current ?? new AudioContext();
      audioRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // Autoplay policy or no audio device. The countdown reaching 0:00 is
      // still visible, so failing silently is fine.
    }
  }, []);

  useEffect(() => {
    if (endsAt === null) return;

    // Ticks off a target timestamp rather than decrementing a counter: a
    // setInterval that drifts, or a backgrounded tab that throttles it, would
    // otherwise make the timer lie about how long you actually rested.
    const tick = () => {
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setEndsAt(null);
        beep();
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt, beep]);

  const running = endsAt !== null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center p-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-surface-raised p-1.5 shadow-lg">
        {running ? (
          <>
            <span
              className="numeric px-3 text-lg font-bold tabular-nums"
              role="timer"
              aria-live="off"
              aria-label={`Rest timer, ${format(remaining)} remaining`}
            >
              {format(remaining)}
            </span>
            <button
              type="button"
              onClick={() => setEndsAt(null)}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-foreground"
            >
              Stop
            </button>
          </>
        ) : (
          <>
            <span className="pl-3 text-xs font-medium tracking-wide text-muted uppercase">Rest</span>
            {PRESETS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                onClick={() => {
                  setPreset(seconds);
                  setEndsAt(Date.now() + seconds * 1000);
                }}
                aria-label={`Start a ${seconds} second rest`}
                className={`numeric rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  preset === seconds
                    ? "bg-accent text-accent-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {format(seconds)}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
