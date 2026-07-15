"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { signIn, signUp, type AuthFormState } from "@/features/auth/api/auth-actions";
import { Button } from "@/shared/ui/button";

const initialState: AuthFormState = { error: null };

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground " +
  "placeholder:text-muted focus:border-accent focus:outline-none";

function SubmitButton({ label }: { label: string }) {
  // useFormStatus reads the parent form's pending state, so this survives the
  // action being swapped between sign-in and sign-up.
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Working…" : label}
    </Button>
  );
}

export function AuthForm({ redirectTo }: { redirectTo?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const action = mode === "signin" ? signIn : signUp;
  const [state, formAction] = useActionState(action, initialState);

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex gap-1 rounded-lg border border-border bg-surface p-1">
        {(["signin", "signup"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            aria-pressed={mode === value}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              mode === value ? "bg-surface-raised text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {value === "signin" ? "Sign in" : "Sign up"}
          </button>
        ))}
      </div>

      {/* key remounts the form on mode change, clearing the previous action's state. */}
      <form key={mode} action={formAction} className="flex flex-col gap-4">
        {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}

        {mode === "signup" ? (
          <div>
            <label htmlFor="displayName" className="mb-1.5 block text-sm font-medium">
              Name
            </label>
            <input id="displayName" name="displayName" autoComplete="name" className={inputClass} />
          </div>
        ) : null}

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className={inputClass}
          />
        </div>

        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        {state.message ? (
          <p role="status" className="text-sm text-accent">
            {state.message}
          </p>
        ) : null}

        <SubmitButton label={mode === "signin" ? "Sign in" : "Create account"} />
      </form>
    </div>
  );
}
