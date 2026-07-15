"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { saveOnboarding, type OnboardingFormState } from "@/features/onboarding/api/onboarding-actions";
import {
  AGE_MAX,
  AGE_MIN,
  EQUIPMENT_OPTIONS,
  GOAL_OPTIONS,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  LOCATION_OPTIONS,
  type OnboardingPreferences,
} from "@/entities/profile/model/onboarding";
import { Button } from "@/shared/ui/button";

const initialState: OnboardingFormState = { error: null };

// The whole card is the control: the real input is visually hidden but still
// focusable, and `has-[:checked]` / `has-[:focus-visible]` paint the card from
// the input's state, so keyboard and screen-reader users get the native radio
// and checkbox semantics for free.
const optionCard =
  "relative flex cursor-pointer flex-col rounded-xl border border-border bg-surface p-4 transition-colors " +
  "hover:border-muted has-[:checked]:border-accent has-[:checked]:bg-surface-raised " +
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent";

const chip =
  "flex cursor-pointer items-center justify-center rounded-lg border border-border bg-surface px-3 py-2.5 " +
  "text-center text-sm font-medium transition-colors hover:border-muted " +
  "has-[:checked]:border-accent has-[:checked]:bg-surface-raised has-[:checked]:text-accent " +
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent";

const numberInput =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground " +
  "placeholder:text-muted focus:border-accent focus:outline-none";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold">
        {title}
        {hint ? <span className="ml-2 font-normal text-muted">{hint}</span> : null}
      </legend>
      {children}
    </fieldset>
  );
}

function SubmitButton({ isEditing }: { isEditing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : isEditing ? "Save changes" : "Build my plan"}
    </Button>
  );
}

export function OnboardingForm({ defaultValues }: { defaultValues: OnboardingPreferences | null }) {
  const [state, formAction] = useActionState(saveOnboarding, initialState);
  const isEditing = defaultValues !== null;

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <Section title="What's your main goal?">
        <div className="grid gap-3 sm:grid-cols-2">
          {GOAL_OPTIONS.map((option) => (
            <label key={option.value} className={optionCard}>
              <input
                type="radio"
                name="goal"
                value={option.value}
                defaultChecked={defaultValues?.goal === option.value}
                required
                className="sr-only"
              />
              <span className="font-semibold">{option.label}</span>
              <span className="mt-0.5 text-sm text-muted">{option.hint}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Where do you train?">
        <div className="grid gap-3 sm:grid-cols-2">
          {LOCATION_OPTIONS.map((option) => (
            <label key={option.value} className={optionCard}>
              <input
                type="radio"
                name="location"
                value={option.value}
                defaultChecked={defaultValues?.location === option.value}
                required
                className="sr-only"
              />
              <span className="font-semibold">{option.label}</span>
              <span className="mt-0.5 text-sm text-muted">{option.hint}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="What equipment do you have?" hint="Pick everything you can use">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {EQUIPMENT_OPTIONS.map((option) => (
            <label key={option.value} className={chip}>
              <input
                type="checkbox"
                name="equipment"
                value={option.value}
                defaultChecked={defaultValues?.equipment.includes(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted">
          Nothing selected counts as bodyweight only — that&apos;s a plan too.
        </p>
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="age" className="mb-1.5 block text-sm font-semibold">
            Age
          </label>
          <input
            id="age"
            name="age"
            type="number"
            inputMode="numeric"
            min={AGE_MIN}
            max={AGE_MAX}
            defaultValue={defaultValues?.age ?? ""}
            required
            className={numberInput}
          />
        </div>
        <div>
          <label htmlFor="heightCm" className="mb-1.5 block text-sm font-semibold">
            Height <span className="font-normal text-muted">(cm)</span>
          </label>
          <input
            id="heightCm"
            name="heightCm"
            type="number"
            inputMode="numeric"
            min={HEIGHT_MIN_CM}
            max={HEIGHT_MAX_CM}
            defaultValue={defaultValues?.heightCm ?? ""}
            required
            className={numberInput}
          />
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <SubmitButton isEditing={isEditing} />
    </form>
  );
}
