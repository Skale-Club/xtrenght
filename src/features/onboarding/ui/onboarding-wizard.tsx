"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { EQUIPMENT_OPTIONS } from "@/entities/profile/model/equipment-options";
import { GOAL_OPTIONS } from "@/entities/profile/model/goals";
import { saveTrainingProfile, skipOnboarding } from "@/features/onboarding/api/profile-actions";
import { Button } from "@/shared/ui/button";

/**
 * First-run setup as a step-by-step modal, one question per screen.
 *
 * The same answers used to live on a long scrolling page; a wizard asks for
 * them one at a time, which reads as "a few quick questions" rather than "a
 * form". Skippable at any point -- skipOnboarding stamps onboarded_at so this
 * never shows again, and everything here is editable later in Settings.
 */
export function OnboardingWizard({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const [equipment, setEquipment] = useState<string[]>([]);
  const [goal, setGoal] = useState<string | null>(null);
  const [sessions, setSessions] = useState<number | null>(null);
  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState<"kg" | "lbs">("kg");
  const [limitations, setLimitations] = useState("");

  const toggleEquipment = (value: string) =>
    setEquipment((prev) => (prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value]));

  const reachable = EQUIPMENT_OPTIONS.filter((o) => equipment.includes(o.value)).reduce(
    (sum, o) => sum + o.count,
    0,
  );

  function finish() {
    startTransition(async () => {
      const parsed = weight.trim() ? Number(weight.replace(",", ".")) : null;
      if (parsed !== null && Number.isNaN(parsed)) {
        setError("That bodyweight isn't a number.");
        setStep(3);
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
      router.refresh();
    });
  }

  function skip() {
    startTransition(async () => {
      await skipOnboarding();
      router.refresh();
    });
  }

  const steps = [
    {
      title: "What can you train with?",
      hint: "Pick everything you have. It's what stops the coach offering a barbell you don't own.",
      body: (
        <>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT_OPTIONS.map((option) => {
              const on = equipment.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleEquipment(option.value)}
                  aria-pressed={on}
                  className={
                    on
                      ? "rounded-full border border-accent bg-accent/10 px-3 py-1.5 text-sm"
                      : "rounded-full border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-muted hover:text-foreground"
                  }
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted" aria-live="polite">
            {equipment.length === 0
              ? "Nothing picked — you'll see the whole catalogue of 876."
              : `At least ${reachable} exercises open up.`}
          </p>
        </>
      ),
    },
    {
      title: "What are you training for?",
      hint: "Sets the rep ranges and how the coach progresses you.",
      body: (
        <div className="flex flex-wrap gap-2">
          {GOAL_OPTIONS.map((option) => {
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
                    ? "rounded-full border border-accent bg-accent/10 px-3 py-1.5 text-sm"
                    : "rounded-full border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-muted hover:text-foreground"
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ),
    },
    {
      title: "How many days a week?",
      hint: "How the coach judges whether you're training enough.",
      body: (
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSessions(sessions === n ? null : n)}
              aria-pressed={sessions === n}
              aria-label={`${n} days per week`}
              className={
                sessions === n
                  ? "h-11 w-11 rounded-lg border border-accent bg-accent/10 text-sm"
                  : "h-11 w-11 rounded-lg border border-border text-sm text-muted transition-colors hover:border-muted hover:text-foreground"
              }
            >
              {n}
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "What do you weigh?",
      hint: "Optional. Makes bodyweight moves count as volume, and gives your numbers a scale. Every entry is kept, so it becomes a chart.",
      body: (
        <div className="flex gap-2">
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
      ),
    },
    {
      title: "Anything to work around?",
      hint: "Injuries, pain, movements you avoid. Plain words — the coach reads it. Not medical advice; if something hurts, see a professional.",
      body: (
        <textarea
          value={limitations}
          onChange={(event) => setLimitations(event.target.value)}
          rows={3}
          placeholder="Right shoulder hurts on flat bench. Knees are fine."
          aria-label="Limitations"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
        />
      ),
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-accent uppercase">
              Welcome, {displayName}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Step {step + 1} of {steps.length}
            </p>
          </div>
          <button
            type="button"
            onClick={skip}
            disabled={isPending}
            className="text-xs text-muted hover:text-foreground disabled:opacity-50"
          >
            Skip for now
          </button>
        </div>

        {/* Progress bar -- concrete sense of how much is left. */}
        <div className="h-1 w-full bg-surface">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <h2 className="text-lg font-bold tracking-tight">{current.title}</h2>
          <p className="mt-1 mb-4 text-sm text-muted">{current.hint}</p>
          {current.body}

          {error ? (
            <p role="alert" className="mt-4 text-xs text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || isPending}
            className="text-sm text-muted hover:text-foreground disabled:invisible"
          >
            ← Back
          </button>

          {isLast ? (
            <Button onClick={finish} disabled={isPending}>
              {isPending ? "Saving…" : "Save and start"}
            </Button>
          ) : (
            <Button onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))} disabled={isPending}>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
