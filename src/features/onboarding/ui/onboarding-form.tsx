"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { EQUIPMENT_OPTIONS } from "@/entities/profile/model/equipment-options";
import { GOAL_OPTIONS } from "@/entities/profile/model/goals";
import { saveTrainingProfile, skipOnboarding } from "@/features/onboarding/api/profile-actions";
import { Button } from "@/shared/ui/button";

const GOALS = GOAL_OPTIONS;

type Props = {
  initial?: {
    equipment: string[];
    goal: string | null;
    sessionsPerWeek: number | null;
    limitations: string;
    bodyWeight: number | null;
    weightUnit: "kg" | "lbs";
  };
  /** Onboarding gets a Skip and a redirect; /profile gets neither. */
  mode: "onboarding" | "edit";
};

export function OnboardingForm({ initial, mode }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [equipment, setEquipment] = useState<string[]>(initial?.equipment ?? []);
  const [goal, setGoal] = useState<string | null>(initial?.goal ?? null);
  const [sessions, setSessions] = useState<number | null>(initial?.sessionsPerWeek ?? null);
  const [limitations, setLimitations] = useState(initial?.limitations ?? "");
  const [weight, setWeight] = useState(initial?.bodyWeight ? String(initial.bodyWeight) : "");
  const [unit, setUnit] = useState<"kg" | "lbs">(initial?.weightUnit ?? "kg");

  const toggle = (value: string) =>
    setEquipment((prev) => (prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value]));

  // Only the exercises they can actually do. Counts are per-option and overlap,
  // so this is a floor, not a sum -- said as "at least" rather than a fake total.
  const reachable = EQUIPMENT_OPTIONS.filter((o) => equipment.includes(o.value)).reduce(
    (sum, o) => sum + o.count,
    0,
  );

  function save() {
    startTransition(async () => {
      const parsed = weight.trim() ? Number(weight.replace(",", ".")) : null;
      if (parsed !== null && Number.isNaN(parsed)) {
        setError("That bodyweight isn't a number.");
        return;
      }

      const result = await saveTrainingProfile({
        equipment,
        goal,
        sessionsPerWeek: sessions,
        limitations,
        bodyWeight: parsed,
        weightUnit: unit,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setError(null);
      if (mode === "onboarding") {
        router.push("/dashboard");
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  function skip() {
    startTransition(async () => {
      await skipOnboarding();
      router.push("/dashboard");
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Equipment first: it is the answer that changes the most downstream. */}
      <section>
        <h2 className="text-sm font-semibold">What can you train with?</h2>
        <p className="mt-1 text-xs text-muted">
          Pick everything you have access to. This is what stops the coach offering you a
          pec deck when you own two dumbbells.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {EQUIPMENT_OPTIONS.map((option) => {
            const on = equipment.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                aria-pressed={on}
                className={
                  on
                    ? "rounded-full border border-accent bg-accent/10 px-3 py-1.5 text-sm text-foreground"
                    : "rounded-full border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-muted hover:text-foreground"
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <p className="mt-2 text-xs text-muted" aria-live="polite">
          {equipment.length === 0
            ? "Nothing picked — you'll see the whole catalogue of 876."
            : `At least ${reachable} exercises open up.`}
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold">What are you training for?</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {GOALS.map((option) => {
            const on = goal === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setGoal(on ? null : option.value)}
                aria-pressed={on}
                title={option.hint}
                className={
                  on
                    ? "rounded-full border border-accent bg-accent/10 px-3 py-1.5 text-sm text-foreground"
                    : "rounded-full border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-muted hover:text-foreground"
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">How many days a week?</h2>
        <div className="mt-3 flex gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSessions(sessions === n ? null : n)}
              aria-pressed={sessions === n}
              aria-label={`${n} days per week`}
              className={
                sessions === n
                  ? "h-10 w-10 rounded-lg border border-accent bg-accent/10 text-sm"
                  : "h-10 w-10 rounded-lg border border-border text-sm text-muted transition-colors hover:border-muted hover:text-foreground"
              }
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">What do you weigh?</h2>
        <p className="mt-1 text-xs text-muted">
          Optional. It makes push-ups count as volume instead of zero, and gives your
          numbers a scale. Every entry is kept, so this becomes a chart.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            inputMode="decimal"
            placeholder="82.5"
            aria-label="Bodyweight"
            className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <div className="flex overflow-hidden rounded-lg border border-border">
            {(["kg", "lbs"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                aria-pressed={unit === u}
                className={unit === u ? "bg-accent/10 px-3 py-2 text-sm" : "px-3 py-2 text-sm text-muted"}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Anything the coach should work around?</h2>
        <p className="mt-1 text-xs text-muted">
          Injuries, pain, movements you avoid. Plain words are fine — the coach reads it.
        </p>
        <textarea
          value={limitations}
          onChange={(event) => setLimitations(event.target.value)}
          rows={3}
          placeholder="Right shoulder hurts on flat bench. Knees are fine."
          aria-label="Limitations"
          className="mt-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <p className="mt-2 text-xs text-muted">
          Not medical advice either way — if something hurts, see a professional.
        </p>
      </section>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={isPending}>
          {isPending ? "Saving…" : mode === "onboarding" ? "Save and start" : "Save"}
        </Button>

        {mode === "onboarding" ? (
          <button
            type="button"
            onClick={skip}
            disabled={isPending}
            className="text-xs text-muted hover:text-foreground"
          >
            Skip for now
          </button>
        ) : null}

        {saved ? (
          <span role="status" className="text-xs text-accent">
            Saved.
          </span>
        ) : null}
      </div>
    </div>
  );
}
